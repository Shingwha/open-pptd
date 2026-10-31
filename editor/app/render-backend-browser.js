// ============================================================================
// app/render-backend-browser.js — browser RenderBackend (foreignObject + capture)
// ----------------------------------------------------------------------------
// Implements the RenderBackend contract (interfaces.md §6) for the browser:
//
//   createBrowserRenderBackend({ width, height, scale, target, state })
//     prepare() → wait for document fonts
//     paint(page,{pixelRatio}) → render page offscreen + foreignObject → canvas
//     capture() → PNG bytes (Uint8Array)
//     dispose() → remove the offscreen nodes / dispose chart instances
//
//   createCaptureRenderBackend({ scale, target, state, pages })
//     prepare() → POST the editing-session snapshot to /api/export-image once
//     paint(page) → select the page, capture() → that page's PNG bytes
//
// Both backends are rasterizers only: page selection, scale validation, naming,
// zip and reporting live in packages/export (ExportService). The canvas never
// paints an extra background, so the alpha channel of the rendered page survives
// (the page background itself is drawn by the renderer).
//
// Browser security constraints kept from the old export-image path:
//   1. the SVG is loaded as a data: URL (a blob: URL taints the canvas)
//   2. foreignObject must not contain <img> (bitmaps become div+background:url)
//   3. no http reference may remain (images/backgrounds → data URLs); elements
//      that cannot be embedded are dropped and reported per element
// ============================================================================

import { base64ToBytes, bytesToBase64, deckSize, resolveTheme } from "../../packages/model/index.js";
import { disposeChartInstances, renderPage } from "../../packages/renderer/index.js";
import { dataUrlOf } from "../../packages/writer/index.js";
import { serializeProject } from "../../packages/runtime/index.js";

const PROBE_TIMEOUT_MS = 3000; // capability probe
const CAPTURE_BASE_TIMEOUT_MS = 30000;
const CAPTURE_MAX_TIMEOUT_MS = 180000;
const DEFAULT_ENDPOINT = "/api/export-image";

function backendError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/** RenderBackendFactory for foreignObject (injected through ExportService env.renderBackend). */
export function createBrowserRenderBackendFactory({ state, extraOptions = {} } = {}) {
  let last = null;
  const factory = async (options) => {
    last = createBrowserRenderBackend({ ...options, ...extraOptions, state });
    return last;
  };
  factory.getLastBackend = () => last;
  return factory;
}

/**
 * foreignObject backend: full-page DOM → SVG → Nx canvas (pixelRatio = scale).
 * @param {object} options RenderBackendFactory options + `state` (editor state)
 */
export function createBrowserRenderBackend({ width = null, height = null, scale = 1, mode = "foreignObject", target = {}, state } = {}) {
  if (mode !== "foreignObject" && mode !== "auto") {
    throw backendError("ERR_UNSUPPORTED_BACKEND", `browser backend 不支持 mode="${mode}"（可用 foreignObject/auto）`);
  }
  const shotScale = Number(scale);
  if (![1, 2, 3].includes(shotScale)) {
    throw backendError("ERR_INVALID_OPTION", `scale 仅支持 1|2|3（当前 ${scale}）`);
  }
  const deck = state?.deck || target?.deck;
  if (!deck || !Array.isArray(deck.pages)) throw backendError("ERR_RENDER_BACKEND", "browser backend 需要 deck（编辑状态）");

  let clipper = null;
  let holder = null;
  let last = null;
  let lastPage = null;
  const droppedByPage = new Map();

  /** Embedded-font @font-face (cached; the font set is stable within a project). */
  let fontFaceCache = null;
  function fontFaceCss() {
    if (fontFaceCache != null) return fontFaceCache;
    let css = "";
    for (const [family, f] of Object.entries(state?.fontLibrary || {})) {
      if (!f?.bytes) continue;
      css += `@font-face{font-family:'${family}';src:url(data:font/ttf;base64,${bytesToBase64(f.bytes)}) format('truetype');}`;
    }
    fontFaceCache = css;
    return css;
  }

  /** Any URL → dataURL (same-origin / CORS-enabled convert; otherwise throws and is reported). */
  async function urlToDataUrl(url) {
    const mapped = state?.imageMap?.[url];
    if (typeof mapped === "string" && mapped.startsWith("data:")) return mapped;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    return dataUrlOf(await blob.arrayBuffer(), blob.type || "application/octet-stream");
  }

  /** <img>/<canvas> → div background-image carrier (object-fit → background-size). */
  function toCarrier(styleText, dataUrl, fit) {
    const div = document.createElement("div");
    div.style.cssText = styleText;
    div.style.backgroundImage = `url(${dataUrl})`;
    div.style.backgroundRepeat = "no-repeat";
    div.style.backgroundPosition = "center";
    div.style.backgroundSize = fit === "contain" ? "contain" : fit === "fill" ? "100% 100%" : "cover";
    return div;
  }

  function elementIdOf(node) {
    return node?.closest?.("[data-element-id]")?.dataset?.elementId || null;
  }

  /** Self-contained resources + per-element audit (same rules as the old export-image path). */
  async function embedResources(container) {
    const dropped = [];
    for (const node of [...container.querySelectorAll("video,iframe,object,embed,audio")]) {
      dropped.push({ elementId: elementIdOf(node), tag: node.tagName.toLowerCase(), reason: "foreignObject 不支持该元素" });
      node.remove();
    }
    for (const cv of [...container.querySelectorAll("canvas")]) {
      let dataUrl = null;
      try {
        dataUrl = cv.toDataURL("image/png");
      } catch {
        dropped.push({ elementId: elementIdOf(cv), tag: "canvas", reason: "画布被跨域内容污染，无法读取像素" });
        cv.remove();
        continue;
      }
      cv.replaceWith(toCarrier(cv.style.cssText, dataUrl, "fill"));
    }
    for (const img of [...container.querySelectorAll("img")]) {
      const src = img.src || "";
      if (src.startsWith("data:")) {
        img.replaceWith(toCarrier(img.style.cssText, src, img.style.objectFit || "cover"));
        continue;
      }
      try {
        const dataUrl = await urlToDataUrl(src);
        img.replaceWith(toCarrier(img.style.cssText, dataUrl, img.style.objectFit || "cover"));
      } catch {
        dropped.push({ elementId: elementIdOf(img), tag: "img", reason: `外链图片无法内嵌（无跨域授权）：${src}` });
        img.remove();
      }
    }
    const bgNode = container.firstElementChild;
    const m = /^url\("?([^")]+)"?\)$/.exec(bgNode?.style?.backgroundImage || "");
    if (m && !m[1].startsWith("data:")) {
      try {
        bgNode.style.backgroundImage = `url(${await urlToDataUrl(m[1])})`;
      } catch {
        dropped.push({ elementId: null, tag: "page-background", reason: `背景图无法内嵌（无跨域授权）：${m[1]}` });
        bgNode.style.backgroundImage = "";
      }
    }
    return dropped;
  }

  /** Whole-page DOM → PNG bytes (data URL SVG → foreignObject → Nx canvas). */
  async function rasterize(container, w, h, ratio) {
    const xml = new XMLSerializer().serializeToString(container);
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
      `<style>${fontFaceCss()}</style>` +
      `<foreignObject width="100%" height="100%">` +
      `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${w}px;height:${h}px;position:relative;">` +
      xml +
      `</div></foreignObject></svg>`;
    const img = new Image();
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = w * ratio;
    canvas.height = h * ratio;
    const ctx = canvas.getContext("2d");
    // No background fill: the page background is part of the rendered DOM; whatever is
    // transparent stays transparent (PNG keeps its alpha channel).
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((ok, err) => canvas.toBlob((b) => (b ? ok(b) : err(new Error("PNG 编码失败"))), "image/png"));
    return new Uint8Array(await blob.arrayBuffer());
  }

  function cleanup() {
    if (clipper) {
      try {
        disposeChartInstances(clipper);
      } catch {
        /* chart cleanup must not mask the export result */
      }
      clipper.remove();
    }
    clipper = null;
    holder = null;
  }

  return {
    async prepare() {
      if (typeof document === "undefined") throw backendError("ERR_RENDER_BACKEND", "foreignObject backend 需要浏览器环境");
      try {
        await document.fonts?.ready;
      } catch {
        /* font wait failure does not block the export */
      }
      const [w, h] = deckSize(deck);
      if ((width != null && Number(width) !== w) || (height != null && Number(height) !== h)) {
        throw backendError("ERR_RENDER_BACKEND", `渲染目标尺寸不一致：deck ${width}×${height}px vs 编辑状态 ${w}×${h}px`);
      }
    },

    async paint(page, { pixelRatio } = {}) {
      if (pixelRatio != null && Number(pixelRatio) !== shotScale) {
        throw backendError("ERR_INVALID_OPTION", `pixelRatio 必须等于 scale（${shotScale}），当前 ${pixelRatio}`);
      }
      const index = Number(page) - 1;
      if (!Number.isInteger(index) || index < 0 || index >= deck.pages.length) {
        throw backendError("ERR_PAGES", `页码 ${page} 超出范围（共 ${deck.pages.length} 页）`);
      }
      cleanup();
      const [w, h] = deckSize(deck);
      // Offscreen but not display:none (keeps layout/fonts/charts rendering normally).
      // No background on the holder: alpha stays alpha.
      clipper = document.createElement("div");
      clipper.style.cssText = "position:fixed;left:-10000px;top:0;";
      holder = document.createElement("div");
      holder.style.cssText = `position:relative;width:${w}px;height:${h}px;overflow:hidden;`;
      clipper.appendChild(holder);
      document.body.appendChild(clipper);
      renderPage(holder, deck.pages[index], deck, state?.theme || resolveTheme(deck), {
        imageMap: state?.imageMap || {},
        iconMap: state?.iconMap || {},
        pixelRatio: shotScale,
      });
      const dropped = await embedResources(holder);
      droppedByPage.set(Number(page), dropped);
      last = await rasterize(holder, w, h, shotScale);
      lastPage = Number(page);
    },

    async capture() {
      if (!last) throw backendError("ERR_RENDER_BACKEND", "capture 前必须先 paint()");
      return last;
    },

    /** Audit extras (not part of the RenderBackend contract). */
    droppedElementsFor(page) {
      return droppedByPage.get(Number(page)) || [];
    },
    get lastPage() {
      return lastPage;
    },

    get pixelRatio() {
      return shotScale;
    },

    async dispose() {
      cleanup();
      last = null;
      lastPage = null;
    },
  };
}

/** RenderBackendFactory for the server capture endpoint (headless Chrome on the server). */
export function createCaptureRenderBackendFactory({ state, endpoint = DEFAULT_ENDPOINT } = {}) {
  return async (options) => createCaptureRenderBackend({ ...options, state, endpoint });
}

/**
 * capture backend: one POST for the requested page range (server headless), then
 * per-page capture() reuses the returned PNGs. Missing pages throw so the caller
 * can fall back to foreignObject.
 */
export function createCaptureRenderBackend({ scale = 1, target = {}, state, pages = null, endpoint = DEFAULT_ENDPOINT, timeoutMs = null } = {}) {
  const shotScale = Number(scale);
  if (![1, 2, 3].includes(shotScale)) {
    throw backendError("ERR_INVALID_OPTION", `scale 仅支持 1|2|3（当前 ${scale}）`);
  }
  const project = target?.project;
  if (!project || !project.deck) throw backendError("ERR_RENDER_BACKEND", "capture backend 需要 project（编辑快照）");
  const requested = Array.isArray(pages) && pages.length ? pages.map(Number) : null;
  if (!requested) throw backendError("ERR_PAGES", "capture backend 需要页列表（ExportService 传入）");
  const pageNums = [...new Set(requested)].filter((n) => Number.isInteger(n) && n > 0);
  if (!pageNums.length) throw backendError("ERR_PAGES", "capture backend 页列表为空");

  let pngs = null;
  let current = null;

  return {
    async prepare() {
      const bundle = serializeProject(project, { mode: "snapshot" });
      const files = bundle.files.map((f) =>
        typeof f.text === "string" ? { path: f.path, content: f.text } : { path: f.path, b64: bytesToBase64(f.bytes) }
      );
      const total = project.deck.pages?.length || 0;
      const all = pageNums.length === total && pageNums.every((n, i) => n === i + 1);
      const payload = {
        manifestName: bundle.manifestName,
        files,
        scale: shotScale,
        ...(all ? { all: true } : { pages: pageNums }),
      };
      const controller = new AbortController();
      const timeout = timeoutMs || Math.min(CAPTURE_MAX_TIMEOUT_MS, Math.max(CAPTURE_BASE_TIMEOUT_MS, pageNums.length * 10000));
      const timer = setTimeout(() => controller.abort(), timeout);
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          throw backendError("ERR_RENDER_BACKEND", `capture 端点失败 HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
        }
        const out = await res.json();
        if (!out?.ok || !Array.isArray(out.pngs)) throw backendError("ERR_RENDER_BACKEND", "capture 端点返回格式错误");
        const byPage = new Map(out.pngs.filter((p) => p?.b64).map((p) => [Number(p.page), base64ToBytes(p.b64)]));
        const missing = pageNums.find((n) => !byPage.has(n));
        if (missing) throw backendError("ERR_RENDER_BACKEND", `capture 端点缺少第 ${missing} 页`);
        pngs = byPage;
      } finally {
        clearTimeout(timer);
      }
    },

    async paint(page) {
      if (!pngs) throw backendError("ERR_RENDER_BACKEND", "paint 前必须先 prepare()");
      current = Number(page);
      if (!pngs.has(current)) throw backendError("ERR_PAGES", `第 ${page} 页不在 capture 结果中`);
    },

    async capture() {
      if (!pngs || current == null) throw backendError("ERR_RENDER_BACKEND", "capture 前必须先 paint()");
      const bytes = pngs.get(current);
      if (!bytes?.length) throw backendError("ERR_RENDER_BACKEND", `第 ${current} 页 PNG 为空`);
      return bytes;
    },

    async dispose() {
      pngs = null;
      current = null;
    },
  };
}

/**
 * Capability probe: the capture endpoint exists and a local Chrome/Edge is present.
 * Any failure/timeout (static hosting 404, no browser) → false → foreignObject.
 */
export async function probeCapture({ endpoint = DEFAULT_ENDPOINT, timeoutMs = PROBE_TIMEOUT_MS } = {}) {
  if (typeof fetch !== "function") return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(endpoint, { method: "GET", signal: controller.signal, cache: "no-store" });
    if (!res.ok) return false;
    const info = await res.json();
    return !!(info?.ok && info?.capture && info?.browser);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Forced foreignObject switch (walkthrough/testing): window.__pptdForceImageFallback or ?imgFallback=1. */
export function forceForeignObject() {
  try {
    if (globalThis.__pptdForceImageFallback) return true;
    if (typeof location !== "undefined" && new URLSearchParams(location.search).get("imgFallback") === "1") return true;
  } catch {
    /* ignore outside a browser */
  }
  return false;
}
