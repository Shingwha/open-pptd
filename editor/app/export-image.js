// ============================================================================
// app/export-image.js — image export (capture first + foreignObject fallback + per-element audit)
// ----------------------------------------------------------------------------
// Two output paths (unified by RP-C / M5; spec 08 §2 revision 1):
//   1) capture first (local serve / browser available): POST /api/export-image,
//      which serializes the **current editing session** into a temp project
//      (deck.pptd + pages + media + fonts) and lets packages/server reuse
//      renderer/headless's headless Chrome to screenshot each page. If the
//      endpoint is missing (404 in deploy mode) or there is no local Chrome/Edge,
//      or the call fails/times out → fall back to path 2.
//   2) foreignObject fallback (GitHub Pages deploy / no browser): render the whole
//      page offscreen → make resources self-contained (including the **per-element
//      audit**) → SVG <foreignObject> → canvas rasterization at 2x.
//
// Audit (kills silent white images): before serializing, scan for elements that
// cannot enter an image — cross-origin images without CORS, a canvas tainted by
// cross-origin content, tags foreignObject cannot handle — producing an
// `ExportImageResult { png, droppedElements[] }`; the UI toast reports how many
// elements could not be exported, and the per-element list goes to both the
// console and the return value.
//
// Three hard constraints from the browser security model (measured on the
// fallback path; do not revert):
//   1. The SVG must be loaded as a data: URL — a blob: URL taints the canvas
//      (toBlob throws SecurityError)
//   2. foreignObject must not contain <img> — even a data: source makes the whole
//      SVG fail to decode; bitmaps are rewritten into div + background:url(data:...)
//      carriers (cover/contain map 1:1 to object-fit)
//   3. The SVG must not retain any http reference (same-origin counts as
//      cross-origin and taints directly) — images and image backgrounds are all
//      converted to dataURLs; cross-origin images without CORS cannot be
//      converted (exported blank, counted and reported)
// Fonts: the fallback path embeds every fontLibrary entry that has bytes as
// @font-face; the capture path writes byte-bearing library fonts into the temp
// project (headless reproduces the preview fonts on site); system fonts are
// rendered by the local machine and need no embedding.
// ============================================================================

import { showToast } from "./toast.js";
import { bytesToBase64, base64ToBytes, deckSize, serializeDeck } from "../../packages/model/index.js";
import { disposeChartInstances, renderPage } from "../../packages/renderer/index.js";
import { ZipWriter, dataUrlOf, downloadBlob, safeFileName } from "../../packages/writer/index.js";
import { mediaFilesOfDeck } from "./project/images.js";

const DEFAULT_SCALE = 2; // default output multiplier (1|2|3; multiplier = canvas logical size × N pixels)
const PROBE_TIMEOUT_MS = 3000; // capture endpoint probe timeout (3s scale; on timeout fall back)
const CAPTURE_BASE_TIMEOUT_MS = 30000; // capture per-page base timeout
const CAPTURE_MAX_TIMEOUT_MS = 180000; // capture total timeout ceiling

/** Forced-fallback switch (walkthrough/testing): window.__pptdForceImageFallback or ?imgFallback=1. */
function forceFallback() {
  try {
    if (globalThis.__pptdForceImageFallback) return true;
    if (typeof location !== "undefined" && new URLSearchParams(location.search).get("imgFallback") === "1") return true;
  } catch {
    /* ignore outside a browser */
  }
  return false;
}

export function createImageExporter({ state }) {
  /** Embedded-font @font-face (fallback path; result cached — the font set is stable within a project). */
  let fontFaceCache = null;
  function fontFaceCss() {
    if (fontFaceCache != null) return fontFaceCache;
    let css = "";
    for (const [family, f] of Object.entries(state.fontLibrary || {})) {
      if (!f?.bytes) continue;
      css += `@font-face{font-family:'${family}';src:url(data:font/ttf;base64,${bytesToBase64(f.bytes)}) format('truetype');}`;
    }
    fontFaceCache = css;
    return css;
  }

  // --------------------------------------------------------------------------
  // Path 1: capture (server endpoint + headless)
  // --------------------------------------------------------------------------
  /** Endpoint capability probe: true only when the endpoint exists and a usable browser is present (failure/timeout/no browser → false). */
  async function probeCapture() {
    if (typeof fetch !== "function") return false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    try {
      const res = await fetch("/api/export-image", { method: "GET", signal: controller.signal, cache: "no-store" });
      if (!res.ok) return false;
      const info = await res.json();
      return !!(info?.ok && info?.capture && info?.browser);
    } catch {
      return false; // 404 in deploy mode / network failure / timeout
    } finally {
      clearTimeout(timer);
    }
  }

  /** Current editing session → capture endpoint request body (PPTD files + media + font bytes). */
  function buildCapturePayload(indices, scale) {
    const total = state.deck.pages.length;
    const all = indices.length === total && indices.every((v, i) => v === i);
    const snapshot = JSON.parse(JSON.stringify(state.deck)); // snapshot: exporting does not change the editing session
    const files = mediaFilesOfDeck(snapshot, state.imageMap); // rewrite dataURLs → media/, returning bytes
    // Library fonts (those with bytes) are written into the temp project: headless loads them via deck.fonts → same fonts as the preview
    for (const [family, f] of Object.entries(state.fontLibrary || {})) {
      if (!f?.bytes) continue;
      const rel = typeof f.file === "string" && f.file ? f.file : `fonts/${safeFileName(family)}.ttf`;
      snapshot.fonts = snapshot.fonts && typeof snapshot.fonts === "object" ? snapshot.fonts : {};
      snapshot.fonts[family] = { family, subset: !!f.subset, file: rel };
      files.push({ path: rel, b64: bytesToBase64(f.bytes) });
    }
    const manifestName = state.manifestPath?.split("/").pop() || "deck.pptd";
    for (const f of serializeDeck(snapshot, { manifestName })) files.push({ path: f.path, content: f.content });
    return { manifestName, files, scale, ...(all ? { all: true } : { pages: indices.map((i) => i + 1) }) };
  }

  /** POST to the capture endpoint; any failure (non-2xx / missing page / timeout) returns null so the caller falls back. */
  async function capturePages(indices, scale) {
    const payload = buildCapturePayload(indices, scale);
    const controller = new AbortController();
    const timeout = Math.min(CAPTURE_MAX_TIMEOUT_MS, Math.max(CAPTURE_BASE_TIMEOUT_MS, payload.pages?.length * 10000 || CAPTURE_BASE_TIMEOUT_MS));
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch("/api/export-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!res.ok) return null;
      const out = await res.json();
      if (!out?.ok || !Array.isArray(out.pngs)) return null;
      const byPage = new Map(out.pngs.map((p) => [p.page, p]));
      const results = [];
      for (const i of indices) {
        const hit = byPage.get(i + 1);
        if (!hit?.b64) return null; // missing page → fall back entirely (better slow than half-done)
        results.push({ index: i, png: base64ToBytes(hit.b64), droppedElements: [], source: "capture" });
      }
      return results;
    } catch (err) {
      console.warn(`[export] capture 出图失败，回退 foreignObject：${err?.message || err}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  // --------------------------------------------------------------------------
  // Path 2: foreignObject (deploy mode / capture unavailable) + per-element audit
  // --------------------------------------------------------------------------
  /** Any URL → dataURL (same-origin / CORS-enabled cross-origin converts; otherwise throws and the caller counts it). */
  async function urlToDataUrl(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    return dataUrlOf(await blob.arrayBuffer(), blob.type || "application/octet-stream");
  }

  /** <img>/<canvas> → div background-image carrier (keeps the original inline size styles; object-fit → background-size). */
  function toCarrier(styleText, dataUrl, fit) {
    const div = document.createElement("div");
    div.style.cssText = styleText;
    div.style.backgroundImage = `url(${dataUrl})`;
    div.style.backgroundRepeat = "no-repeat";
    div.style.backgroundPosition = "center";
    div.style.backgroundSize = fit === "contain" ? "contain" : fit === "fill" ? "100% 100%" : "cover";
    return div;
  }

  /** Element id owning a node (for locating entries in the audit report). */
  function elementIdOf(node) {
    return node?.closest?.("[data-element-id]")?.dataset?.elementId || null;
  }

  /**
   * Make self-contained: rewrite bitmap elements into div background-image carriers
   * and convert image backgrounds to dataURLs; **per-element audit** — returns the
   * list of elements that cannot enter an image ({ elementId, tag, reason }),
   * killing silent white images.
   */
  async function embedResources(container) {
    const dropped = [];
    // Media tags foreignObject cannot handle (leaving them makes the whole SVG fail to decode / go blank)
    for (const node of [...container.querySelectorAll("video,iframe,object,embed,audio")]) {
      dropped.push({ elementId: elementIdOf(node), tag: node.tagName.toLowerCase(), reason: "foreignObject 不支持该元素" });
      node.remove();
    }
    // Charts: screenshot the ECharts canvas (drawn synchronously with animation:false, so init already yields a frame)
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
    // Image elements: src → dataURL → background carrier
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
        img.remove(); // cannot render anyway, and an http reference would taint the canvas
      }
    }
    // Page background image fill url() (renderPage's first child node is the background layer)
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

  /** Whole-page DOM → PNG Blob (data URL SVG → foreignObject → Nx canvas rasterization). */
  async function rasterize(container, w, h, scale) {
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
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((ok, err) =>
      canvas.toBlob((b) => (b ? ok(b) : err(new Error("PNG 编码失败"))), "image/png")
    );
  }

  /**
   * Fallback path: render one page and rasterize it.
   * @returns {Promise<ExportImageResult>} { png: Blob, droppedElements: [{elementId,tag,reason}] }
   */
  async function pageToPng(page, scale) {
    const [w, h] = deckSize(state.deck);
    // Offscreen but not display:none (keeps layout, fonts and charts rendering normally)
    const clipper = document.createElement("div");
    clipper.style.cssText = "position:fixed;left:-10000px;top:0;";
    const holder = document.createElement("div");
    holder.style.cssText = `position:relative;width:${w}px;height:${h}px;overflow:hidden;background:#fff;`;
    clipper.appendChild(holder);
    document.body.appendChild(clipper);
    try {
      // pixelRatio — charts initialize pixels at the export multiplier (echarts defaults to screen DPR, so a 1x screen exports blurry)
      renderPage(holder, page, state.deck, state.theme, {
        imageMap: state.imageMap,
        iconMap: state.iconMap,
        pixelRatio: scale,
      });
      const droppedElements = await embedResources(holder);
      const png = await rasterize(holder, w, h, scale);
      return { png, droppedElements };
    } finally {
      disposeChartInstances(clipper);
      clipper.remove();
    }
  }

  /** Whole fallback path: pageToPng per page → normalized to bytes (same shape as the capture path, for packaging/assertions). */
  async function foreignObjectPages(indices, scale) {
    const results = [];
    for (const i of indices) {
      const { png, droppedElements } = await pageToPng(state.deck.pages[i], scale);
      results.push({
        index: i,
        png: new Uint8Array(await png.arrayBuffer()),
        droppedElements,
        source: "foreignObject",
      });
    }
    return results;
  }

  // --------------------------------------------------------------------------
  // Unified entry
  // --------------------------------------------------------------------------
  /**
   * Export images. opts.pages: page indexes (0-based, default current page); opts.scale: 1|2|3 (default 2);
   * opts.mode: "zip" (default) multi-page bundle / "files" one download each.
   * Returns ExportImageResult[] (with source and droppedElements, for walkthrough/test assertions).
   */
  async function exportImages(opts = {}) {
    if (!state.deck?.pages?.length) return [];
    const scale = [1, 2, 3].includes(Number(opts.scale)) ? Number(opts.scale) : DEFAULT_SCALE;
    const total = state.deck.pages.length;
    const indices = (Array.isArray(opts.pages) && opts.pages.length ? opts.pages : [state.currentPage])
      .filter((i) => Number.isInteger(i) && i >= 0 && i < total);
    if (!indices.length) return [];
    const base = safeFileName(state.deck.title || "deck");
    showToast(indices.length > 1 ? `正在导出 ${indices.length} 页图片…` : "正在导出图片…", "info", 8000);
    try {
      // capture first: probe failure / no browser / call failure → fall back (forceFallback is for walkthroughs)
      let results = !forceFallback() && (await probeCapture()) ? await capturePages(indices, scale) : null;
      if (!results) results = await foreignObjectPages(indices, scale);

      const dropped = [];
      for (const r of results) for (const d of r.droppedElements || []) dropped.push({ page: r.index + 1, ...d });
      const pngs = results.map((r) => ({
        name: `${base}-${String(r.index + 1).padStart(2, "0")}.png`,
        bytes: r.png,
      }));

      if (pngs.length === 1 || opts.mode === "files") {
        for (const p of pngs) downloadBlob(p.bytes, p.name, "image/png");
        showToast(`已导出 ${pngs.length} 张图片${pngs.length > 1 ? "（逐张下载）" : `（${(pngs[0].bytes.length / 1024).toFixed(1)} KB）`}`, "success");
      } else {
        const zip = new ZipWriter();
        for (const p of pngs) zip.add(p.name, p.bytes);
        const bytes = zip.build();
        downloadBlob(bytes, `${base}-images.zip`, "application/zip");
        showToast(`已导出 ${pngs.length} 页图片（${(bytes.length / 1024 / 1024).toFixed(1)} MB）`, "success");
      }
      if (dropped.length) {
        console.warn(`[export] ${dropped.length} 个元素未能导出：`, dropped);
        showToast(`⚠ ${dropped.length} 个元素未能导出（清单见控制台）`, "danger", 6000);
      }
      state.lastImageExport = results; // walkthrough/tests read droppedElements
      return results;
    } catch (err) {
      showToast(`导出图片失败: ${err.message}`, "danger");
      console.error(err);
      return [];
    }
  }

  return { exportImages };
}
