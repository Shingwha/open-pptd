// ============================================================================
// server/export-image.js — 图片导出端点（RP-C / M5：capture 优先）
// ----------------------------------------------------------------------------
//   GET  /api/export-image   能力探测：本机是否有可用 Chrome/Edge（无则 404 语义）
//   POST /api/export-image   请求体 = 当前编辑现场快照（序列化后的 PPTD 文件 +
//                            media/fonts 字节），在临时目录落盘为完整项目，
//                            复用 renderer/headless/shoot.js 的无头 capture 管线
//                            逐页出 PNG，base64 随 JSON 回传。
//
// 设计要点：
//   · 编辑现场语义：请求由浏览器把**当前编辑现场**（可能含未保存修改）序列化后
//     送来，而不是让 server 读磁盘上的 .pptd —— 与旧 foreignObject 导出的语义
//     （导出所见即编辑现场）保持一致。
//   · 分层：本模块属 Node 专用 packages/server，可 import renderer/headless/**
//     （headless 是 Node 链路；server 无反向依赖约束，见 dep-graph）。
//   · 全部临时文件在 finally 删除；body 有大小上限；写入路径做防穿越校验。
// ============================================================================

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, normalize, sep, dirname } from "node:path";

const MAX_BODY = 256 * 1024 * 1024; // 256MB（页面多 + 大图时的安全上限）
const RENDER_TIMEOUT_MS = 60000; // 单页截图步超时（headless 冷启动较慢）

/** 读取请求体（超限即断）。 */
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

/** 同源校验：带 Origin 且主机非本机回环 → 拒绝（防被网页跨站驱动无头出图）。 */
function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // 无 Origin（curl / 站内同源旧实现）放行
  try {
    const host = new URL(origin).hostname;
    return host === "127.0.0.1" || host === "localhost" || host === "[::1]" || host === "::1";
  } catch {
    return false;
  }
}

/** 本机是否具备可用 Chrome/Edge（探测失败 → false，前端回退 foreignObject）。 */
async function browserAvailable() {
  try {
    const { findBrowser } = await import("../renderer/headless/browser.js");
    findBrowser();
    return true;
  } catch {
    return false;
  }
}

/** 单页渲染 + 读回 PNG 字节。 */
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
 * 创建端点处理器（startServer 由 server/index.js 注入，避免与装配根循环 import）。
 * @param {{ startServer: (options: object) => Promise<import("node:http").Server> }} deps
 * @returns {(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => Promise<void>}
 */
export function createExportImageHandler({ startServer } = {}) {
  // 静默 startServer（renderDeck 每个实例会起一个临时静态 server；勿往 stdout 打日志）。
  // liveReload:false —— 一次性出图不需要 SSE 轮询（否则轮询定时器会在临时目录删除后报错/常驻）。
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

      // ---- 落盘临时项目 ----
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

      // ---- 无头截图（renderer/headless 惰性加载：不用时零开销）----
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
        /* 响应头已发 */
      }
    } finally {
      if (workDir) {
        try {
          rmSync(workDir, { recursive: true, force: true });
        } catch {
          /* 清理失败不影响结果 */
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
