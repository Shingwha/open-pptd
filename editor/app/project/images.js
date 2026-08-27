// ============================================================================
// app/project/images.js — 图片资源：预读 / 映射重建 / dataURL 落盘
// ----------------------------------------------------------------------------
// 项目内相对路径图片统一经 HTTP 预读为 dataURL 进 imageMap，预览渲染
// （img.src = map[el.src]）与导出（buildPptx 走 imageMap）共用同一数据源。
// dataURL 内嵌图片无需预读；保存时落为 media/ 文件并重写 el.src。
// ============================================================================

import { decodeDataUrl, extToMime } from "../../../packages/writer/util.js";
import { bytesToBase64 } from "../../../packages/model/bytes.js";
import { walkElements } from "../../../packages/model/walk.js";
import { readImageAsDataUrl } from "./handle-io.js";

/** dataURL → { mime, ext, bytes }（mime 由解码结果推断，与 writer 侧共享实现）。 */
function decodeDataUrlInfo(dataUrl) {
  const decoded = decodeDataUrl(dataUrl);
  if (!decoded) return null;
  return { mime: extToMime(decoded.ext), ext: decoded.ext, bytes: decoded.bytes };
}

/**
 * 图片 → media/ 文件条目（{path, b64}）的核心收集逻辑（保存写回 / zip 打包 /
 * 项目包导出共用，见 #7 合并）：
 *   - dataURL 内嵌：落为 media/<elementId>.<ext> 并重写 el.src
 *   - 相对路径引用（此前保存已落盘化 / 项目自带）：按 imageMap 里的 dataURL
 *     补齐字节——保证 zip 打包完整；写回模式为同内容幂等覆盖
 * @param {Array} pages 页面数组（编辑器状态或快照）
 * @param {object} imageMap src → dataURL 映射
 * @param {(rel: string, dataUrl: string) => void} [onRelPath]
 *        dataURL 落盘化产生新相对路径时回调（编辑器用来同步预览映射；快照导出不需要）
 */
function collectMediaFiles(pages, imageMap, onRelPath = null) {
  const out = [];
  const seen = new Set();
  walkElements(pages, (el) => {
    if (el.elementType !== "image" || !el.src) return;
    const dataUrl = el.src.startsWith("data:")
      ? el.src
      : String(imageMap[el.src] || "").startsWith("data:")
        ? imageMap[el.src]
        : null;
    if (!dataUrl || seen.has(dataUrl)) return;
    seen.add(dataUrl);
    const info = decodeDataUrlInfo(dataUrl);
    if (!info) return; // svg/webp 等 PPT 不支持格式：保留内嵌，不落盘
    if (el.src.startsWith("data:")) {
      const rel = `media/${el.elementId}.${info.ext}`;
      onRelPath?.(rel, dataUrl); // 编辑器：新路径 → 原 dataURL，预览保持可用
      el.src = rel;
      out.push({ path: rel, b64: bytesToBase64(info.bytes) });
    } else {
      out.push({ path: el.src, b64: bytesToBase64(info.bytes) });
    }
  });
  return out;
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
    walkElements(state.deck.pages, (el) => {
      if (el.elementType !== "image" || !el.src || el.src.startsWith("data:")) return;
      if (state.imageMap[el.src] || seen.has(el.src)) return;
      seen.add(el.src);
      todo.push(el.src);
    });
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
    const todo = [];
    walkElements(state.deck.pages, (el) => {
      if (el.elementType !== "image" || !el.src || el.src.startsWith("data:")) return;
      if (state.imageMap[el.src] || seen.has(el.src)) return;
      seen.add(el.src);
      todo.push(el.src);
    });
    for (const src of todo) {
      const mime = extToMime(/\.([a-z0-9]+)$/i.exec(src)?.[1]);
      if (!mime) continue;
      const dataUrl = await readImageAsDataUrl(handle, src, mime);
      if (dataUrl) state.imageMap[src] = dataUrl;
    }
  }

  /** 重建图片映射：dataURL 引用自映射；相对路径引用保留已有映射。 */
  function rebuildImageMap() {
    const next = {};
    walkElements(state.deck.pages, (el) => {
      if (el.elementType !== "image" || !el.src) return;
      if (el.src.startsWith("data:")) next[el.src] = el.src;
      else if (state.imageMap[el.src]) next[el.src] = state.imageMap[el.src];
    });
    state.imageMap = next;
  }

  /** 保存写回 / zip 打包：操作编辑器状态（预览映射同步更新）。 */
  function persistDataUrlImages() {
    return collectMediaFiles(state.deck.pages, state.imageMap, (rel, dataUrl) => {
      state.imageMap[rel] = dataUrl;
    });
  }

  return { preloadRemoteImages, preloadHandleImages, rebuildImageMap, persistDataUrlImages };
}

/**
 * 导出项目包用：对 deck 快照做图片收集（dataURL 内嵌 → media/<elementId>.<ext>
 * 并重写快照内 src；相对路径引用按 imageMap 里的 dataURL 补齐字节）。
 * 操作快照而非编辑器状态——导出不改变当前编辑现场。
 */
export function mediaFilesOfDeck(deckSnapshot, imageMap = {}) {
  return collectMediaFiles(deckSnapshot.pages || [], imageMap);
}
