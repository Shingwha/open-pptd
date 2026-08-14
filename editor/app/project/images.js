// ============================================================================
// app/project/images.js — 图片资源：预读 / 映射重建 / dataURL 落盘
// ----------------------------------------------------------------------------
// 项目内相对路径图片统一经 HTTP 预读为 dataURL 进 imageMap，预览渲染
// （img.src = map[el.src]）与导出（buildPptx 走 imageMap）共用同一数据源。
// dataURL 内嵌图片无需预读；保存时落为 media/ 文件并重写 el.src。
// ============================================================================

import { decodeDataUrl, extToMime } from "../../writer/util.js";

export function createImageStore(state) {
  /** Uint8Array → base64（分块拼接防栈溢出；预读与落盘共用）。 */
  function bytesToBase64(bytes) {
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }

  function dataUrlOf(buf, mime) {
    return `data:${mime};base64,${bytesToBase64(new Uint8Array(buf))}`; // fetch 返回 ArrayBuffer，需先包装
  }

  /** 把项目内相对路径图片预读为 dataURL 进 imageMap。 */
  async function preloadRemoteImages() {
    if (!state.manifestPath) return;
    const base = state.manifestPath.replace(/[^/]*$/, "");
    const todo = [];
    const seen = new Set();
    for (const page of state.deck.pages) {
      for (const el of page.elements || []) {
        if (el.elementType !== "image" || !el.src || el.src.startsWith("data:")) continue;
        if (state.imageMap[el.src] || seen.has(el.src)) continue;
        seen.add(el.src);
        todo.push(el.src);
      }
    }
    await Promise.all(
      todo.map(async (src) => {
        try {
          const res = await fetch(base + src);
          if (!res.ok) return;
          const mime = extToMime(/\.([a-z0-9]+)$/i.exec(src)?.[1]);
          if (!mime) return;
          state.imageMap[src] = dataUrlOf(await res.arrayBuffer(), mime);
        } catch (err) {
          console.warn(`[io] 图片预载失败 ${src}: ${err.message}`); // 静默降级，渲染层有占位提示
        }
      })
    );
  }

  /** 重建图片映射：dataURL 引用自映射；相对路径引用保留已有映射。 */
  function rebuildImageMap() {
    const next = {};
    for (const page of state.deck.pages) {
      for (const el of page.elements || []) {
        if (el.elementType !== "image" || !el.src) continue;
        if (el.src.startsWith("data:")) next[el.src] = el.src;
        else if (state.imageMap[el.src]) next[el.src] = state.imageMap[el.src];
      }
    }
    state.imageMap = next;
  }

  /** dataURL → { mime, ext, bytes }（mime 由解码结果推断，与 writer 侧共享实现）。 */
  function decodeDataUrlInfo(dataUrl) {
    const decoded = decodeDataUrl(dataUrl);
    if (!decoded) return null;
    return { mime: extToMime(decoded.ext), ext: decoded.ext, bytes: decoded.bytes };
  }

  /** 收集 deck 中所有 dataURL 图片（去重），供落盘/打包。 */
  function collectDataUrlImages() {
    const seen = new Set();
    const out = [];
    for (const page of state.deck.pages) {
      for (const el of page.elements || []) {
        if (el.elementType === "image" && el.src && el.src.startsWith("data:") && !seen.has(el.src)) {
          seen.add(el.src);
          const info = decodeDataUrlInfo(el.src);
          if (!info) continue; // svg/webp 等 PPT 不支持格式：保留内嵌，不落盘
          out.push({ el, src: el.src, ...info });
        }
      }
    }
    return out;
  }

  /**
   * dataURL 图片 → media/ 文件条目（{path, b64}），并重写 el.src / 建立新路径映射。
   * 返回条目直接 push 进保存文件列表（HTTP 写回与 zip 打包共用）。
   */
  function persistDataUrlImages() {
    return collectDataUrlImages().map((img) => {
      const rel = `media/${img.el.elementId}.${img.ext}`;
      state.imageMap[rel] = img.src; // 新路径 → 原 dataURL，预览保持可用
      img.el.src = rel;
      return { path: rel, b64: bytesToBase64(img.bytes) };
    });
  }

  return { preloadRemoteImages, rebuildImageMap, persistDataUrlImages };
}
