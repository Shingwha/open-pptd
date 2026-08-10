// ============================================================================
// renderer/image.js — 图片元素 → DOM（fit: cover/contain/fill + 边框 + 阴影）
// ============================================================================

import { resolveColor } from "../core/theme.js";

/** 图片元素 → 定位 DOM（fit: cover/contain/fill + 边框 + 阴影）。
 * @param {object} ctx 渲染上下文 { imageMap: { [src]: dataUrl } }（文件夹模式相对路径 → dataURL）
 */
export function renderImage(theme, el, ctx = {}) {
  const [x, y, w, h] = el.bounds;
  const box = document.createElement("div");
  box.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;overflow:hidden;`;
  box.dataset.elementId = el.elementId;
  box.dataset.elementType = "image";
  if (el.rotation) box.style.transform = `rotate(${el.rotation}deg)`;
  if (el.opacity != null) box.style.opacity = el.opacity;

  const img = document.createElement("img");
  // 本地文件夹模式：src 相对路径 → 经 imageMap 解析为 dataURL（调用方传入，不再读全局）
  const map = ctx.imageMap || {};
  img.src = map[el.src] || el.src;
  img.style.cssText = `width:100%;height:100%;display:block;object-fit:${el.fit?.mode || "cover"};`;
  img.onerror = () => {
    img.style.display = "none";
    box.textContent = "[图片加载失败]";
    box.style.display = "flex";
    box.style.alignItems = "center";
    box.style.justifyContent = "center";
    box.style.color = "#999";
    box.style.fontSize = "12px";
  };
  box.appendChild(img);
  if (el.border) {
    box.style.border = `${el.border.width || 1}px ${el.border.style || "solid"} ${resolveColor(theme, el.border.color) || "#000"}`;
  }
  if (el.shadow) {
    const [dx = 0, dy = 0] = el.shadow.offset || [0, 0];
    box.style.boxShadow = `${dx}px ${dy}px ${el.shadow.blur ?? 6}px ${resolveColor(theme, el.shadow.color) || "rgba(0,0,0,0.3)"}`;
  }
  return box;
}
