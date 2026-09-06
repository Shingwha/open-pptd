// ============================================================================
// app/export-image.js — 导出图片（纯前端，本地 serve 与线上部署行为一致）
// ----------------------------------------------------------------------------
// 复用预览渲染管线（renderer/page.js，与编辑器画布/CLI render 同一渲染器）：
// 离屏渲染整页 → 资源自包含化 → 序列化进 SVG <foreignObject> → canvas 2x
// 栅格化 → PNG。单页直下 PNG，全部页循环后 ZipWriter 打包 zip。
//
// 浏览器安全模型的三个硬约束（实测结论，勿改回）：
//   1. SVG 必须以 data: URL 加载——blob: URL 会污染 canvas（toBlob 抛 SecurityError）
//   2. foreignObject 里不能有 <img>——即使 data: 源也会让整张 SVG 解码失败；
//      位图一律改写为 div + background:url(data:...) 载体（cover/contain 与
//      object-fit 语义一一对应）
//   3. SVG 内不得残留任何 http 引用（同源也算跨域，直接污染）——图片与图片
//      背景全部转 dataURL；无 CORS 授权的外链图转不了（导出为空白，计数提示）
// 字体：fontLibrary 有字节的全部内嵌 @font-face；系统字体由本机渲染无需内嵌。
// ============================================================================

import { renderPage, disposeChartInstances } from "../../packages/renderer/page.js";
import { ZipWriter } from "../../packages/writer/zip.js";
import { showToast } from "./toast.js";

const DEFAULT_SCALE = 2; // 输出倍率缺省（1|2|3；倍率含义 = 画布逻辑尺寸 × N 像素）

/** Uint8Array → base64（分块，避免 apply 栈溢出）。 */
function bytesToBase64(bytes) {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function downloadBlob(bytes, name, mime) {
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function createImageExporter({ state }) {
  const deckSize = () =>
    Array.isArray(state.deck?.size) && state.deck.size.length === 2 ? state.deck.size : [960, 540];

  /** 内嵌字体 @font-face（结果缓存；deck 切换后 fontLibrary 变化由导出时机自然刷新——同项目内字体集稳定）。 */
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

  /** 任意 URL → dataURL（同源 / 允许 CORS 的外链可转；否则抛错由调用方计数）。 */
  function urlToDataUrl(url) {
    return fetch(url).then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.blob();
    }).then(
      (blob) =>
        new Promise((ok, err) => {
          const r = new FileReader();
          r.onload = () => ok(r.result);
          r.onerror = err;
          r.readAsDataURL(blob);
        })
    );
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

  /**
   * 自包含化：位图元素改写为 div 背景图载体、图片背景转 dataURL。
   * 返回失败计数（无 CORS 的外链图，导出图中为空白）。
   */
  async function embedResources(container) {
    let failed = 0;
    // 图表：ECharts canvas 截图（animation:false 同步绘制，init 即成帧）
    for (const cv of [...container.querySelectorAll("canvas")]) {
      cv.replaceWith(toCarrier(cv.style.cssText, cv.toDataURL("image/png"), "fill"));
    }
    // 图片元素：src → dataURL → 背景图载体
    for (const img of [...container.querySelectorAll("img")]) {
      if (img.src.startsWith("data:")) {
        img.replaceWith(toCarrier(img.style.cssText, img.src, img.style.objectFit || "cover"));
        continue;
      }
      try {
        const dataUrl = await urlToDataUrl(img.src);
        img.replaceWith(toCarrier(img.style.cssText, dataUrl, img.style.objectFit || "cover"));
      } catch {
        failed += 1;
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
        failed += 1;
        bgNode.style.backgroundImage = "";
      }
    }
    return failed;
  }

  /** 文本框可视自适应高度（与 present.js 同规则，但不写回模型——导出只调显示）。 */
  function autoGrowTexts(page, container) {
    for (const el of page.elements || []) {
      if (el.elementType !== "text") continue;
      const node = container.querySelector(`[data-element-id="${CSS.escape(el.elementId)}"]`);
      const inner = node?.firstElementChild;
      if (!inner) continue;
      const need = inner.scrollHeight;
      if (need > el.bounds[3] + 1) node.style.height = `${need}px`;
    }
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

  /** 渲染一页并栅格化；返回 { blob, failed }。 */
  async function pageToPng(page, scale) {
    const [w, h] = deckSize();
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
      autoGrowTexts(page, holder);
      const failed = await embedResources(holder);
      const blob = await rasterize(holder, w, h, scale);
      return { blob, failed };
    } finally {
      disposeChartInstances(clipper);
      clipper.remove();
    }
  }

  /**
   * 导出图片。opts.pages：页码数组（0 起，缺省当前页）；opts.scale：1|2|3 倍率（缺省 2）；
   * opts.mode："zip"（缺省）多页打包 / "files" 逐张下载。纯浏览器渲染，导出当前编辑现场。
   */
  async function exportImages(opts = {}) {
    if (!state.deck?.pages?.length) return;
    const scale = [1, 2, 3].includes(Number(opts.scale)) ? Number(opts.scale) : DEFAULT_SCALE;
    const total = state.deck.pages.length;
    const indices = (Array.isArray(opts.pages) && opts.pages.length ? opts.pages : [state.currentPage])
      .filter((i) => Number.isInteger(i) && i >= 0 && i < total);
    if (!indices.length) return;
    const base = (state.deck.title || "deck").replace(/[\\/:*?"<>|]/g, "_");
    showToast(indices.length > 1 ? `正在导出 ${indices.length} 页图片…` : "正在导出图片…", "info", 8000);
    try {
      const pngs = [];
      let failedImgs = 0;
      for (const i of indices) {
        const { blob, failed } = await pageToPng(state.deck.pages[i], scale);
        failedImgs += failed;
        pngs.push({ name: `${base}-${String(i + 1).padStart(2, "0")}.png`, bytes: new Uint8Array(await blob.arrayBuffer()) });
      }
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
      if (failedImgs) showToast(`⚠ ${failedImgs} 张外链图片无法内嵌（无跨域授权），导出图中为空白`, "danger", 6000);
    } catch (err) {
      showToast(`导出图片失败: ${err.message}`, "danger");
      console.error(err);
    }
  }

  return { exportImages };
}
