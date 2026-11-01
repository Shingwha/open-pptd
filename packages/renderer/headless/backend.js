// renderer/headless/backend.js — Node/headless RenderBackend factory (Node-only)
// Implements the RenderBackend contract (typedef in packages/export/index.js): prepare() opens
// the shot session (server + browser + viewport/DPR + page 0 repaint), paint(page, {pixelRatio})
// switches to a 1-based page and waits for paint-ready, capture() returns PNG bytes, dispose()
// closes browser/profile/server. The factory is injected by Node hosts (CLI, server) via
// ExportService env.renderBackend; packages/export owns page selection/scale/naming/zip.
// diagnostics() is extra: live DPR plus every chart canvas backing-store ratio.

import { openShotSession } from "./shoot.js";

function backendError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/**
 * @param {object} options RenderBackendFactory options
 * @param {number} [options.width] expected deck width (CSS px)
 * @param {number} [options.height] expected deck height (CSS px)
 * @param {number} [options.scale] export pixel ratio (1|2|3); pixelRatio must equal it
 * @param {"headless"|"auto"} [options.mode]
 * @param {object} options.target `{ project, deck, manifestPath? }`
 * @param {string} [options.browserPath]
 * @param {number} [options.timeoutMs]
 * @param {boolean} [options.quiet]
 * @param {(options: object) => Promise<import("node:http").Server>} options.startServer
 *        static server factory injected by the host (packages/server)
 * @returns {Promise<object>} RenderBackend + `info` / `diagnostics()`
 */
export async function createHeadlessRenderBackend({
  width = null,
  height = null,
  scale = 1,
  mode = "headless",
  target = {},
  browserPath = null,
  timeoutMs = 30000,
  quiet = true,
  startServer,
} = {}) {
  if (mode !== "headless" && mode !== "auto") {
    throw backendError("ERR_UNSUPPORTED_BACKEND", `headless backend 不支持 mode="${mode}"（可用 headless/auto）`);
  }
  if (typeof startServer !== "function") {
    throw backendError("ERR_RENDER_BACKEND", "headless backend 需要注入 startServer（来自 packages/server）");
  }
  const manifestPath = target.manifestPath || target.project?.manifestPath || null;
  if (!manifestPath) {
    throw backendError(
      "ERR_RENDER_BACKEND",
      "headless backend 需要磁盘项目路径（target.manifestPath）；内存项目请使用其他 render backend"
    );
  }
  const shotScale = Number(scale);
  if (![1, 2, 3].includes(shotScale)) {
    throw backendError("ERR_INVALID_OPTION", `scale 仅支持 1|2|3（当前 ${scale}）`);
  }

  let session = null;
  let info = null;

  return {
    /** Metadata, available after prepare(). */
    get info() {
      return info;
    },

    async prepare() {
      if (session) return;
      session = await openShotSession({
        manifest: manifestPath,
        scale: shotScale,
        browserPath,
        timeoutMs,
        quiet,
        startServer,
      });
      info = {
        count: session.count,
        width: session.width,
        height: session.height,
        scale: session.scale,
      };
      // The host/model size and the shot surface must agree; a mismatch means the
      // caller is exporting a different deck than the one on disk.
      const mismatch =
        (width != null && Number(width) !== session.width) || (height != null && Number(height) !== session.height);
      if (mismatch) {
        const active = session;
        session = null;
        await active.close();
        throw backendError(
          "ERR_RENDER_BACKEND",
          `渲染目标尺寸不一致：deck ${width}×${height}px vs 页面 ${active.width}×${active.height}px（${manifestPath}）`
        );
      }
    },

    async paint(page, { pixelRatio } = {}) {
      if (!session) throw backendError("ERR_RENDER_BACKEND", "paint 前必须先 prepare()");
      if (pixelRatio != null && Number(pixelRatio) !== shotScale) {
        throw backendError("ERR_INVALID_OPTION", `pixelRatio 必须等于 scale（${shotScale}），当前 ${pixelRatio}`);
      }
      const index = Number(page) - 1;
      if (!Number.isInteger(index) || index < 0 || index >= session.count) {
        throw backendError("ERR_PAGES", `页码 ${page} 超出范围（共 ${session.count} 页）`);
      }
      await session.paint(index);
    },

    async capture() {
      if (!session) throw backendError("ERR_RENDER_BACKEND", "capture 前必须先 prepare()");
      return session.capture();
    },

    async diagnostics() {
      if (!session) throw backendError("ERR_RENDER_BACKEND", "diagnostics 前必须先 prepare()");
      const raw = await session.diagnostics();
      return {
        dpr: raw.dpr,
        scale: shotScale,
        canvases: raw.canvases.map((c) => ({
          width: c.width,
          height: c.height,
          cssWidth: c.cssWidth,
          cssHeight: c.cssHeight,
          ratioX: c.cssWidth ? Number((c.width / c.cssWidth).toFixed(3)) : null,
          ratioY: c.cssHeight ? Number((c.height / c.cssHeight).toFixed(3)) : null,
        })),
      };
    },

    async dispose() {
      const active = session;
      session = null;
      info = null;
      if (active) await active.close();
    },
  };
}
