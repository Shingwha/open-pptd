// ============================================================================
// renderer/icon.js — 图标 → SVG（与 PPTX 导出的 SVG 文件同源）
// ----------------------------------------------------------------------------
// 渲染 editor/core/icon-svg.js 生成的 SVG body（同一份 d + fill-rule + fill），
// 导出端把同一字符串写入 ppt/media/*.svg —— PowerPoint 渲染即预览所见。
// ============================================================================

import { ICONS } from "../core/icon-library.js";
import { resolveIconName } from "../core/icon-name.js";
import { iconSvgBody, normalizeIconFill } from "../core/icon-svg.js";
import { createElementShell } from "./shell.js";

const SVG_NS = "http://www.w3.org/2000/svg";

/** 图标元素 → SVG（等比缩放居中，不拉伸变形）。未知图标 → 占位框。 */
export function renderIcon(theme, el) {
  const def = ICONS[resolveIconName(el.iconName)];
  const svg = createElementShell(el, { tag: "svg" });
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  if (!def) {
    // 未知图标：占位框提示
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

  // 与导出端相同的 SVG body（同一 d/fill-rule/fill 解析）
  const fill = normalizeIconFill(theme, el.fill);
  const gid = `ig-${el.elementId}-${Math.random().toString(36).slice(2, 7)}`;
  svg.innerHTML = iconSvgBody(def, fill, gid);
  return svg;
}

/** 图标缩略（菜单/选择器）：16×16 等比，fill currentColor。 */
export function iconThumb(key, { size = 16, color = "currentColor" } = {}) {
  const def = ICONS[key];
  if (!def) return "";
  const fr = def.fr ? ` fill-rule="${def.fr}"` : "";
  return `<svg viewBox="0 0 16 16" width="${size}" height="${size}" fill="${color}"><path${fr} d="${def.d}"/></svg>`;
}
