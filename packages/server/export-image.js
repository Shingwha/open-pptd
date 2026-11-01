// server/export-image.js — image export endpoint (capture backend over ExportService)
// GET /api/export-image probes for a usable Chrome/Edge; POST takes a snapshot of the
// current editing state (serialized PPTD files + media/fonts bytes), materializes it as a
// temp project and renders it through ExportService format=png with the headless
// RenderBackend, returning base64 PNGs (what you export is what you see, unsaved changes
// included). Temp files are removed in finally; body capped; paths and Origin checked.

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, normalize, sep, dirname } from "node:path";
import { createDiskProjectSource, createFsResourceProvider } from "./runtime-node.js";
import { createProject } from "../runtime/index.js";
import { exportProject } from "../export/index.js";
import { readBody, sendJson as json } from "./http-util.js";

const MAX_BODY = 256 * 1024 * 1024; // 256MB (safe cap for many pages + large images)
const RENDER_TIMEOUT_MS = 60000; // per-session screenshot timeout (headless cold start is slow)

/** Same-origin check: reject when Origin is present and its host is not loopback (prevents cross-site pages from driving headless rendering). */
function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // no Origin (curl / legacy same-site) → allow
  try {
    const host = new URL(origin).hostname;
    return host === "127.0.0.1" || host === "localhost" || host === "[::1]" || host === "::1";
  } catch {
    return false;
  }
}

/** Is a usable Chrome/Edge available on this machine (probe failure → false; frontend falls back to foreignObject). */
async function browserAvailable() {
  try {
    const { findBrowser } = await import("../renderer/headless/browser.js");
    findBrowser();
    return true;
  } catch {
    return false;
  }
}

/** Render selected pages through ExportService + headless backend → [{page, b64}]. */
async function renderPages({ manifestPath, pages, scale, workDir, startServer }) {
  const { createHeadlessRenderBackend } = await import("../renderer/headless/backend.js");
  const files = await createDiskProjectSource(manifestPath).read();
  const project = createProject(files);
  const resources = createFsResourceProvider({ baseDir: workDir });
  const renderBackend = (options) =>
    createHeadlessRenderBackend({
      ...options,
      startServer,
      timeoutMs: RENDER_TIMEOUT_MS,
      quiet: true,
    });
  const report = await exportProject(
    project,
    { format: "png", pages, scale, backend: "headless", check: false },
    { resources, renderBackend }
  );
  if (!report.ok) throw new Error(report.errors.join("；") || "PNG 导出失败");
  const pngs = [];
  const artifacts = report.artifacts || [];
  for (let i = 0; i < artifacts.length; i++) {
    pngs.push({ page: report.pages[i], b64: Buffer.from(artifacts[i].bytes).toString("base64") });
  }
  return pngs;
}

/**
 * Create the endpoint handler (startServer is injected by server/index.js to avoid
 * a circular import with the assembly root).
 * @param {{ startServer: (options: object) => Promise<import("node:http").Server> }} deps
 * @returns {(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => Promise<void>}
 */
export function createExportImageHandler({ startServer } = {}) {
  // Silent startServer (renderDeck starts a temp static server per instance; do not log to stdout).
  // liveReload:false — one-shot rendering needs no SSE polling (otherwise the poll timer errors or
  // stays alive after the temp dir is removed).
  const silentStart = (opts) => startServer({ ...opts, liveReload: false, onListen: () => {} });

  async function probe(res) {
    const browser = await browserAvailable();
    json(res, 200, { ok: true, capture: true, browser });
  }

  async function exportImage(req, res) {
    if (!originAllowed(req)) {
      json(res, 403, { ok: false, error: "origin denied" });
      return;
    }
    let workDir = null;
    try {
      const raw = await readBody(req, { limit: MAX_BODY });
      const payload = JSON.parse(raw || "{}");
      const files = Array.isArray(payload.files) ? payload.files : [];
      const manifestName = String(payload.manifestName || "deck.pptd").replace(/[\\/]+/g, "/");
      if (!files.length || !manifestName) {
        json(res, 400, { ok: false, error: "files/manifestName 缺失" });
        return;
      }
      const scale = [1, 2, 3].includes(Number(payload.scale)) ? Number(payload.scale) : 2;
      const reqPages = (Array.isArray(payload.pages) ? payload.pages : []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
      const all = payload.all === true;
      if (!all && reqPages.length === 0) {
        json(res, 400, { ok: false, error: "pages 缺失" });
        return;
      }

      // ---- materialize the temp project ----
      workDir = mkdtempSync(join(tmpdir(), "pptd-export-"));
      for (const f of files) {
        const rel = String(f?.path || "").replace(/^\/+/, "");
        if (!rel) continue;
        const filePath = normalize(join(workDir, rel));
        if (filePath !== workDir && !filePath.startsWith(workDir + sep)) throw new Error(`路径越界: ${rel}`);
        mkdirSync(dirname(filePath), { recursive: true });
        if (f.b64 != null) writeFileSync(filePath, Buffer.from(String(f.b64), "base64"));
        else writeFileSync(filePath, String(f.content ?? ""), "utf8");
      }
      const manifestPath = normalize(join(workDir, manifestName));

      // ---- ExportService + headless backend (renderer/headless loads lazily) ----
      const pngs = await renderPages({
        manifestPath,
        pages: all ? "all" : reqPages,
        scale,
        workDir,
        startServer: silentStart,
      });
      json(res, 200, { ok: true, scale, pngs });
    } catch (err) {
      try {
        json(res, 500, { ok: false, error: String(err?.message || err) });
      } catch {
        /* headers already sent */
      }
    } finally {
      if (workDir) {
        try {
          rmSync(workDir, { recursive: true, force: true });
        } catch {
          /* cleanup failure does not affect the result */
        }
      }
    }
  }

  return async function handleExportImage(req, res) {
    if (req.method === "GET" || req.method === "HEAD") return probe(res);
    if (req.method !== "POST") {
      json(res, 405, { ok: false, error: "method not allowed" });
      return;
    }
    return exportImage(req, res);
  };
}
