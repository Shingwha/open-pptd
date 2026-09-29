// ============================================================================
// server/export-image.js — image export endpoint (RP-C / M5: capture-first)
// ----------------------------------------------------------------------------
//   GET  /api/export-image   capability probe: is a usable Chrome/Edge present
//                            (404 semantics otherwise)
//   POST /api/export-image   body = snapshot of the current editing state
//                            (serialized PPTD files + media/fonts bytes),
//                            materialized into a temp dir as a complete project,
//                            then driven through renderer/headless/shoot.js to
//                            produce one PNG per page; base64 returned in JSON.
//
// Design notes:
//   · Editing-state semantics: the browser serializes the **current editing state**
//     (possibly with unsaved changes) and sends it, instead of letting the server
//     read .pptd from disk — consistent with the old foreignObject export (what you
//     export is what you see).
//   · Layering: this module is Node-only packages/server and may import
//     renderer/headless/** (headless is the Node path; server has no reverse-dependency
//     constraint, see dep-graph).
//   · All temp files are removed in finally; the body has a size cap; write paths are
//     traversal-checked.
// ============================================================================

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, normalize, sep, dirname } from "node:path";

const MAX_BODY = 256 * 1024 * 1024; // 256MB (safe cap for many pages + large images)
const RENDER_TIMEOUT_MS = 60000; // per-page screenshot timeout (headless cold start is slow)

/** Read the request body (aborts when over the cap). */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        req.destroy();
        reject(new Error(`请求体过大（>${(MAX_BODY / 1024 / 1024) | 0}MB）`));
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

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

/** Render one page and read back PNG bytes. */
async function renderPages({ renderDeck, startServer, manifestPath, page, scale, workDir }) {
  const outDir = join(workDir, "out");
  mkdirSync(outDir, { recursive: true });
  const { files } = await renderDeck({
    manifest: manifestPath,
    outPath: outDir,
    page,
    scale,
    timeoutMs: RENDER_TIMEOUT_MS,
    quiet: true,
    startServer,
  });
  const pngs = [];
  for (const file of files) {
    const n = Number(/-(\d+)\.png$/i.exec(file)?.[1]);
    pngs.push({ page: Number.isInteger(n) ? n : pngs.length + 1, b64: readFileSync(file).toString("base64") });
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
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ ok: true, capture: true, browser }));
  }

  async function exportImage(req, res) {
    if (!originAllowed(req)) {
      res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" }).end(JSON.stringify({ ok: false, error: "origin denied" }));
      return;
    }
    let workDir = null;
    try {
      const raw = await readBody(req);
      const payload = JSON.parse(raw || "{}");
      const files = Array.isArray(payload.files) ? payload.files : [];
      const manifestName = String(payload.manifestName || "deck.pptd").replace(/[\\/]+/g, "/");
      if (!files.length || !manifestName) {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }).end(JSON.stringify({ ok: false, error: "files/manifestName 缺失" }));
        return;
      }
      const scale = [1, 2, 3].includes(Number(payload.scale)) ? Number(payload.scale) : 2;
      const reqPages = (Array.isArray(payload.pages) ? payload.pages : []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
      const all = payload.all === true;
      if (!all && reqPages.length === 0) {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" }).end(JSON.stringify({ ok: false, error: "pages 缺失" }));
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

      // ---- headless rendering (renderer/headless loads lazily: zero cost when unused) ----
      const { renderDeck } = await import("../renderer/headless/shoot.js");
      const pngs = [];
      if (all) {
        pngs.push(...(await renderPages({ renderDeck, startServer: silentStart, manifestPath, page: "all", scale, workDir })));
      } else {
        for (const n of reqPages) {
          pngs.push(...(await renderPages({ renderDeck, startServer: silentStart, manifestPath, page: n, scale, workDir })));
        }
      }
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ ok: true, scale, pngs }));
    } catch (err) {
      const msg = String(err?.message || err);
      try {
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" }).end(JSON.stringify({ ok: false, error: msg }));
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
      res.writeHead(405, { "Content-Type": "application/json; charset=utf-8" }).end(JSON.stringify({ ok: false, error: "method not allowed" }));
      return;
    }
    return exportImage(req, res);
  };
}
