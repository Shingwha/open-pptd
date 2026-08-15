// ============================================================================
// app/project/images.js — 图片资源：预读 / 映射重建 / dataURL 落盘
// ----------------------------------------------------------------------------
// 项目内相对路径图片统一经 HTTP 预读为 dataURL 进 imageMap，预览渲染
// （img.src = map[el.src]）与导出（buildPptx 走 imageMap）共用同一数据源。
// dataURL 内嵌图片无需预读；保存时落为 media/ 文件并重写 el.src。
// ============================================================================

import { decodeDataUrl, extToMime } from "../../writer/util.js";
import { readImageAsDataUrl } from "./handle-io.js";

/** Uint8Array → base64（分块拼接防栈溢出；预读/落盘/导出共用）。 */
function bytesToBase64(bytes) {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export function createImageStore(state) {
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

  /** 把项目内相对路径图片预读为 dataURL 进 imageMap（句柄模式，不经 HTTP）。 */
  async function preloadHandleImages(handle) {
    if (!handle) return;
    const seen = new Set();
    for (const page of state.deck.pages) {
      for (const el of page.elements || []) {
        if (el.elementType !== "image" || !el.src || el.src.startsWith("data:")) continue;
        if (state.imageMap[el.src] || seen.has(el.src)) continue;
        seen.add(el.src);
        const mime = extToMime(/\.([a-z0-9]+)$/i.exec(el.src)?.[1]);
        if (!mime) continue;
        const dataUrl = await readImageAsDataUrl(handle, el.src, mime);
        if (dataUrl) state.imageMap[el.src] = dataUrl;
      }
    }
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

  /**
   * 图片 → media/ 文件条目（{path, b64}），保存写回与 zip 打包共用：
   *   - dataURL 内嵌：落为 media/<elementId>.<ext> 并重写 el.src（预览映射同步更新）
   *   - 相对路径引用（此前保存已落盘化 / 项目自带）：按 imageMap 里的 dataURL
   *     补齐字节——保证 zip 打包完整；写回模式为同内容幂等覆盖
   */
  function persistDataUrlImages() {
    const out = [];
    const seen = new Set();
    for (const page of state.deck.pages) {
      for (const el of page.elements || []) {
        if (el.elementType !== "image" || !el.src) continue;
        const dataUrl = el.src.startsWith("data:")
          ? el.src
          : String(state.imageMap[el.src] || "").startsWith("data:")
            ? state.imageMap[el.src]
            : null;
        if (!dataUrl || seen.has(dataUrl)) continue;
        seen.add(dataUrl);
        const info = decodeDataUrlInfo(dataUrl);
        if (!info) continue; // svg/webp 等 PPT 不支持格式：保留内嵌，不落盘
        if (el.src.startsWith("data:")) {
          const rel = `media/${el.elementId}.${info.ext}`;
          state.imageMap[rel] = dataUrl; // 新路径 → 原 dataURL，预览保持可用
          el.src = rel;
          out.push({ path: rel, b64: bytesToBase64(info.bytes) });
        } else {
          out.push({ path: el.src, b64: bytesToBase64(info.bytes) });
        }
      }
    }
    return out;
  }

  return { preloadRemoteImages, preloadHandleImages, rebuildImageMap, persistDataUrlImages };
}

/**
 * 导出项目包用：对 deck 快照做与 persistDataUrlImages 同构的图片收集
 * （dataURL 内嵌 → media/<elementId>.<ext> 并重写快照内 src；相对路径引用按
 * imageMap 里的 dataURL 补齐字节）。操作快照而非编辑器状态——导出不改变
 * 当前编辑现场。
 */
export function mediaFilesOfDeck(deckSnapshot, imageMap = {}) {
  const files = [];
  const seen = new Set();
  for (const page of deckSnapshot.pages || []) {
    for (const el of page.elements || []) {
      if (el.elementType !== "image" || !el.src) continue;
      const mapped = imageMap[el.src];
      const dataUrl = el.src.startsWith("data:")
        ? el.src
        : typeof mapped === "string" && mapped.startsWith("data:")
          ? mapped
          : null;
      if (!dataUrl || seen.has(dataUrl)) continue;
      seen.add(dataUrl);
      const decoded = decodeDataUrl(dataUrl);
      if (!decoded) continue; // 不支持格式：保留内嵌
      if (el.src.startsWith("data:")) {
        const rel = `media/${el.elementId}.${decoded.ext}`;
        files.push({ path: rel, b64: bytesToBase64(decoded.bytes) });
        el.src = rel;
      } else {
        files.push({ path: el.src, b64: bytesToBase64(decoded.bytes) });
      }
    }
  }
  return files;
}
