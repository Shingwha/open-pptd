// ============================================================================
// renderer/shape.js — 形状 → SVG（rect/roundRect/ellipse/triangle/diamond）
// ============================================================================

import { resolveColor } from "../core/theme.js";
import { SUPPORTED_SHAPES } from "../core/model.js";
import { shapePathD } from "../core/preset-geometry.js";

const SVG_NS = "http://www.w3.org/2000/svg";

/** 根据形状类型生成图形元素（坐标基于 0,0 - w,h）。 */
export function shapePath(shapeName, adjustments, w, h) {
  const doc = document;
  switch (shapeName) {
    case "rect": {
      const r = doc.createElementNS(SVG_NS, "rect");
      r.setAttribute("x", "0");
      r.setAttribute("y", "0");
      r.setAttribute("width", w);
      r.setAttribute("height", h);
      return r;
    }
    case "roundRect": {
      // PPT 标准：radius = adj/100000 × min(w,h)（与导出 prstGeom adj 语义一致）
      const adj = (adjustments && adjustments[0]) != null ? adjustments[0] : 16667;
      const rr = (adj / 100000) * Math.min(w, h);
      const r = doc.createElementNS(SVG_NS, "rect");
      r.setAttribute("x", "0");
      r.setAttribute("y", "0");
      r.setAttribute("width", w);
      r.setAttribute("height", h);
      r.setAttribute("rx", rr);
      r.setAttribute("ry", rr);
      return r;
    }
    case "ellipse": {
      const e = doc.createElementNS(SVG_NS, "ellipse");
      e.setAttribute("cx", w / 2);
      e.setAttribute("cy", h / 2);
      e.setAttribute("rx", w / 2);
      e.setAttribute("ry", h / 2);
      return e;
    }
    case "triangle": {
      const adj = (adjustments && adjustments[0]) != null ? adjustments[0] : 50000;
      const ax = (adj / 100000) * w;
      const p = doc.createElementNS(SVG_NS, "polygon");
      p.setAttribute("points", `${ax},0 ${w},${h} 0,${h}`);
      return p;
    }
    case "diamond": {
      const p = doc.createElementNS(SVG_NS, "polygon");
      p.setAttribute("points", `${w / 2},0 ${w},${h / 2} ${w / 2},${h} 0,${h / 2}`);
      return p;
    }
    default: {
      // ECMA-376 预置几何（PRESET_SHAPES）：按规范公式求值 → SVG path（与 prstGeom 导出同源）
      const d = shapePathD(shapeName, w, h, adjustments);
      if (!d) return null;
      const p = doc.createElementNS(SVG_NS, "path");
      p.setAttribute("d", d);
      return p;
    }
  }
}

function solidFill(theme, fill) {
  if (!fill) return null;
  if (typeof fill === "string") return resolveColor(theme, fill);
  // 与 writer buildFill 语义一致：省略 type 的 {color} 对象按纯色处理（旧形态兼容）
  if (fill.type === "gradient" || fill.type === "image") return null;
  return resolveColor(theme, fill.color);
}

/** 渐变填充 → CSS background（简化为线性渐变）。 */
function gradientCss(theme, fill) {
  if (fill?.type !== "gradient" || !Array.isArray(fill.stops) || fill.stops.length < 2) return null;
  const stops = fill.stops
    .map((s) => `${resolveColor(theme, s.color)} ${Math.round((s.position ?? 0) * 100)}%`)
    .join(", ");
  const angle = fill.angle ?? 0;
  return `linear-gradient(${angle}deg, ${stops})`;
}

/** 形状元素 → 定位 SVG（viewBox + preserveAspectRatio=none，缩放时按比例拉伸不变形）。 */
export function renderShape(theme, el) {
  const [x, y, w, h] = el.bounds;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", w);
  svg.setAttribute("height", h);
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.style.cssText = `position:absolute;left:${x}px;top:${y}px;overflow:visible;`;
  svg.dataset.elementId = el.elementId;
  svg.dataset.elementType = "shape";
  if (el.rotation) svg.style.transform = `rotate(${el.rotation}deg)`;
  if (el.opacity != null) svg.style.opacity = el.opacity;

  const geom = shapePath(el.shapeName, el.adjustments, w, h);
  if (!geom) {
    console.warn(`[renderer] 不支持形状 ${el.shapeName}`);
    return svg;
  }

  const solid = solidFill(theme, el.fill);
  const grad = gradientCss(theme, el.fill);
  if (solid) geom.setAttribute("fill", solid);
  else if (grad) svg.style.background = grad;
  else geom.setAttribute("fill", "#cccccc");

  if (el.border) {
    geom.setAttribute("stroke", resolveColor(theme, el.border.color) || "#000000");
    geom.setAttribute("stroke-width", el.border.width || 1);
    if (el.border.style === "dash") geom.setAttribute("stroke-dasharray", "6 4");
    else if (el.border.style === "dot") geom.setAttribute("stroke-dasharray", "2 3");
  }
  if (el.shadow) {
    const [dx = 0, dy = 0] = el.shadow.offset || [0, 0];
    const color = resolveColor(theme, el.shadow.color) || "rgba(0,0,0,0.3)";
    svg.style.filter = `drop-shadow(${dx}px ${dy}px ${el.shadow.blur ?? 6}px ${color})`;
  }
  svg.appendChild(geom);
  return svg;
}
