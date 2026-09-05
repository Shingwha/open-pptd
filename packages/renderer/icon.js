// ============================================================================
// renderer/icon.js — 图标 → SVG（与 PPTX 导出的 SVG 文件同源）
// ----------------------------------------------------------------------------
// def 来自 ctx.iconMap[el.iconName]（{inner,w,h}，由应用层预载——编辑器
// icons.js / 画廊 preload，模式同 imageMap）；未加载/未知 → 虚线占位框。
// 导出端把同一 inner + fill 写入 ppt/media/*.svg —— PowerPoint 渲染即预览所见。
// ============================================================================

import { iconSvgBody, normalizeIconFill } from "../model/icon-svg.js";
import { createElementShell } from "./shell.js";

const SVG_NS = "http://www.w3.org/2000/svg";

/** 图标元素 → SVG（等比缩放居中，不拉伸变形）。未加载/未知图标 → 占位框。 */
export function renderIcon(theme, el, ctx = {}) {
  const def = (ctx.iconMap || {})[el.iconName];
  const svg = createElementShell(el, { tag: "svg" });
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  if (!def) {
    svg.setAttribute("viewBox", "0 0 16 16");
    const r = document.createElementNS(SVG_NS, "rect");
    r.setAttribute("x", "1");
    r.setAttribute("y", "1");
    r.setAttribute("width", "14");
    r.setAttribute("height", "14");
    r.setAttribute("fill", "none");
    r.setAttribute("stroke", "#c4cbd4");
    r.setAttribute("stroke-dasharray", "2 2");
    svg.appendChild(r);
    const t = document.createElementNS(SVG_NS, "text");
    t.setAttribute("x", "8");
    t.setAttribute("y", "9");
    t.setAttribute("text-anchor", "middle");
    t.setAttribute("font-size", "6");
    t.setAttribute("fill", "#8a94a3");
    t.textContent = "?";
    svg.appendChild(t);
    return svg;
  }

  svg.setAttribute("viewBox", `${def.vx || 0} ${def.vy || 0} ${def.w} ${def.h}`);
  // 与导出端相同的 SVG body（同一 inner/fill 解析）
  const fill = normalizeIconFill(theme, el.fill);
  const gid = `ig-${el.elementId}-${Math.random().toString(36).slice(2, 7)}`;
  svg.innerHTML = iconSvgBody(def, fill, gid);
  return svg;
}

/** 图标缩略（菜单/选择器）：等比，fill currentColor。def = {inner,w,h,vx?,vy?}。 */
export function iconThumb(def, { size = 16, color = "currentColor" } = {}) {
  if (!def) return "";
  return `<svg viewBox="${def.vx || 0} ${def.vy || 0} ${def.w} ${def.h}" width="${size}" height="${size}" fill="${color}">${def.inner}</svg>`;
}
