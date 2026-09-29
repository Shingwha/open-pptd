// ============================================================================
// app/export-image.js — 导出图片（capture 优先 + foreignObject 回退 + 逐元素体检）
// ----------------------------------------------------------------------------
// 两条出图路径（RP-C / M5 统一；spec 08 §2 修订 1）：
//   1) capture 优先（本地 serve / 有浏览器）：POST /api/export-image，把**当前
//      编辑现场**序列化成临时项目（deck.pptd + pages + media + fonts），由
//      packages/server 复用 renderer/headless 的无头 Chrome 逐页截图。探测不到
//      端点（部署态 404）或本机无 Chrome/Edge、或调用失败/超时 → 回退路径 2。
//   2) foreignObject 回退（部署态 GitHub Pages / 无浏览器）：离屏渲染整页 →
//      资源自包含化（含**逐元素体检**）→ SVG <foreignObject> → canvas 2x 栅格化。
//
// 体检（消灭静默白图）：序列化前扫出无法进入图片的元素——无 CORS 的外链图、
// 被跨域污染的 canvas、foreignObject 不支持的标签——产出
// `ExportImageResult { png, droppedElements[] }`，UI toast 明示「N 个元素未能导出」，
// 逐元素清单同时进 console 与返回值。
//
// 浏览器安全模型的三个硬约束（回退路径实测结论，勿改回）：
//   1. SVG 必须以 data: URL 加载——blob: URL 会污染 canvas（toBlob 抛 SecurityError）
//   2. foreignObject 里不能有 <img>——即使 data: 源也会让整张 SVG 解码失败；
//      位图一律改写为 div + background:url(data:...) 载体（cover/contain 与
//      object-fit 语义一一对应）
//   3. SVG 内不得残留任何 http 引用（同源也算跨域，直接污染）——图片与图片
//      背景全部转 dataURL；无 CORS 授权的外链图转不了（导出为空白，计数提示）
// 字体：回退路径 fontLibrary 有字节的全部内嵌 @font-face；capture 路径把有字节的
// 库字体写进临时项目（headless 现场复现预览字体），系统字体由本机渲染无需内嵌。
// ============================================================================

import { showToast } from "./toast.js";
import { bytesToBase64, base64ToBytes, deckSize, serializeDeck } from "../../packages/model/index.js";
import { disposeChartInstances, renderPage } from "../../packages/renderer/index.js";
import { ZipWriter, dataUrlOf, downloadBlob, safeFileName } from "../../packages/writer/index.js";
import { mediaFilesOfDeck } from "./project/images.js";

const DEFAULT_SCALE = 2; // 输出倍率缺省（1|2|3；倍率含义 = 画布逻辑尺寸 × N 像素）
const PROBE_TIMEOUT_MS = 3000; // capture 端点探测超时（3s 级，超时即回退）
const CAPTURE_BASE_TIMEOUT_MS = 30000; // capture 单页基准超时
const CAPTURE_MAX_TIMEOUT_MS = 180000; // capture 总超时上限

/** 强制回退开关（走查/测试用）：window.__pptdForceImageFallback 或 ?imgFallback=1。 */
function forceFallback() {
  try {
    if (globalThis.__pptdForceImageFallback) return true;
    if (typeof location !== "undefined" && new URLSearchParams(location.search).get("imgFallback") === "1") return true;
  } catch {
    /* 非浏览器环境忽略 */
  }
  return false;
}

export function createImageExporter({ state }) {
  /** 内嵌字体 @font-face（回退路径用；结果缓存——同项目内字体集稳定）。 */
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
  // 路径 1：capture（server 端点 + headless）
  // --------------------------------------------------------------------------
  /** 端点能力探测：存在且本机有可用浏览器才返回 true（失败/超时/无浏览器 → false）。 */
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
      return false; // 部署态 404 / 网络失败 / 超时
    } finally {
      clearTimeout(timer);
    }
  }

  /** 当前编辑现场 → capture 端点请求体（PPTD 文件 + media + fonts 字节）。 */
  function buildCapturePayload(indices, scale) {
    const total = state.deck.pages.length;
    const all = indices.length === total && indices.every((v, i) => v === i);
    const snapshot = JSON.parse(JSON.stringify(state.deck)); // 快照：导出不改变编辑现场
    const files = mediaFilesOfDeck(snapshot, state.imageMap); // 重写 dataURL → media/，返回字节
    // 库字体（有字节的）写入临时项目：headless 侧按 deck.fonts 资源表加载 → 与预览同字体
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

  /** POST capture 端点；任何失败（非 2xx / 缺页 / 超时）返回 null 由调用方回退。 */
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
        if (!hit?.b64) return null; // 缺页 → 整体回退（宁可慢，不要半成品）
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
  // 路径 2：foreignObject（部署态 / capture 不可用）+ 逐元素体检
  // --------------------------------------------------------------------------
  /** 任意 URL → dataURL（同源 / 允许 CORS 的外链可转；否则抛错由调用方计数）。 */
  async function urlToDataUrl(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    return dataUrlOf(await blob.arrayBuffer(), blob.type || "application/octet-stream");
  }

  /** <img>/<canvas> → div 背景图载体（保留原内联尺寸样式；object-fit → background-size）。 */
  function toCarrier(styleText, dataUrl, fit) {
    const div = document.createElement("div");
    div.style.cssText = styleText;
    div.style.backgroundImage = `url(${dataUrl})`;
    div.style.backgroundRepeat = "no-repeat";
    div.style.backgroundPosition = "center";
    div.style.backgroundSize = fit === "contain" ? "contain" : fit === "fill" ? "100% 100%" : "cover";
    return div;
  }

  /** 节点所属元素 id（体检报告定位用）。 */
  function elementIdOf(node) {
    return node?.closest?.("[data-element-id]")?.dataset?.elementId || null;
  }

  /**
   * 自包含化：位图元素改写为 div 背景图载体、图片背景转 dataURL；**逐元素体检**——
   * 返回无法进入图片的元素清单（{ elementId, tag, reason }），消灭静默白图。
   */
  async function embedResources(container) {
    const dropped = [];
    // foreignObject 不支持的媒体标签（留着会让整张 SVG 解码失败/整块空白）
    for (const node of [...container.querySelectorAll("video,iframe,object,embed,audio")]) {
      dropped.push({ elementId: elementIdOf(node), tag: node.tagName.toLowerCase(), reason: "foreignObject 不支持该元素" });
      node.remove();
    }
    // 图表：ECharts canvas 截图（animation:false 同步绘制，init 即成帧）
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
    // 图片元素：src → dataURL → 背景图载体
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
        img.remove(); // 留着也无法渲染，还会因 http 引用污染 canvas
      }
    }
    // 页面背景 image fill 的 url()（renderPage 的首子节点即背景层）
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

  /** 整页 DOM → PNG Blob（data URL SVG → foreignObject → N 倍 canvas 栅格化）。 */
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
   * 回退路径：渲染一页并栅格化。
   * @returns {Promise<ExportImageResult>} { png: Blob, droppedElements: [{elementId,tag,reason}] }
   */
  async function pageToPng(page, scale) {
    const [w, h] = deckSize(state.deck);
    // 视口外但不 display:none（保证布局、字体与图表的正常渲染）
    const clipper = document.createElement("div");
    clipper.style.cssText = "position:fixed;left:-10000px;top:0;";
    const holder = document.createElement("div");
    holder.style.cssText = `position:relative;width:${w}px;height:${h}px;overflow:hidden;background:#fff;`;
    clipper.appendChild(holder);
    document.body.appendChild(clipper);
    try {
      // pixelRatio——图表按导出倍率初始化像素（echarts 默认跟屏幕 DPR，1x 屏导出会糊）
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

  /** 回退路径整体：逐页 pageToPng → 统一为字节（与 capture 路径同形，便于打包/断言）。 */
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
  // 统一入口
  // --------------------------------------------------------------------------
  /**
   * 导出图片。opts.pages：页码数组（0 起，缺省当前页）；opts.scale：1|2|3 倍率（缺省 2）；
   * opts.mode："zip"（缺省）多页打包 / "files" 逐张下载。
   * 返回 ExportImageResult[]（含 source 与 droppedElements，供走查/测试断言）。
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
      // capture 优先：探测失败 / 无浏览器 / 调用失败 → 回退（forceFallback 供走查强制回退）
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
      state.lastImageExport = results; // 走查/测试读取 droppedElements
      return results;
    } catch (err) {
      showToast(`导出图片失败: ${err.message}`, "danger");
      console.error(err);
      return [];
    }
  }

  return { exportImages };
}
