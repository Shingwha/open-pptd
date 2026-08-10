// ============================================================================
// renderer/line.js — 线条 → SVG（直线 + 箭头 + 虚线）
// ============================================================================

import { resolveColor } from "../core/theme.js";
import { parsePoints } from "../core/geometry.js";

const SVG_NS = "http://www.w3.org/2000/svg";

export function renderLine(theme, el) {
  const [bx, by, bw, bh] = el.bounds;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", bw);
  svg.setAttribute("height", bh);
  svg.style.cssText = `position:absolute;left:${bx}px;top:${by}px;overflow:visible;`;
  svg.dataset.elementId = el.elementId;
  svg.dataset.elementType = "line";
  if (el.opacity != null) svg.style.opacity = el.opacity;

  const pts = parsePoints(el.points, el.viewBox || [1, 1], el.bounds);
  if (!pts || pts.length < 2) return svg;
  // SVG 内部坐标系以 bounds 原点为 (0,0)，需转为相对坐标（否则画到视口外不可见）
  const rel = pts.map(([px, py]) => [px - bx, py - by]);
  const [x1, y1] = rel[0];
  const [x2, y2] = rel[rel.length - 1];

  const color = resolveColor(theme, el.border?.color) || "#000000";
  const width = el.border?.width || 1;
  const dash = el.border?.style === "dash" ? "6 4" : el.border?.style === "dot" ? "2 3" : null;

  // 曲线（多点）用 path；直线用 line
  let shape;
  if (rel.length > 2 && el.curve === "smooth") {
    shape = document.createElementNS(SVG_NS, "path");
    let d = `M ${x1} ${y1}`;
    for (let i = 1; i < rel.length - 1; i++) {
      const midX = (rel[i][0] + rel[i + 1][0]) / 2;
      const midY = (rel[i][1] + rel[i + 1][1]) / 2;
      d += ` Q ${rel[i][0]} ${rel[i][1]} ${midX} ${midY}`;
    }
    d += ` T ${x2} ${y2}`;
    shape.setAttribute("d", d);
  } else {
    shape = document.createElementNS(SVG_NS, "line");
    shape.setAttribute("x1", x1);
    shape.setAttribute("y1", y1);
    shape.setAttribute("x2", x2);
    shape.setAttribute("y2", y2);
  }
  shape.setAttribute("stroke", color);
  shape.setAttribute("stroke-width", width);
  if (dash) shape.setAttribute("stroke-dasharray", dash);
  svg.appendChild(shape);

  // 箭头（终点）
  const endArrow = el.arrow?.[1];
  if (endArrow) {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    svg.appendChild(arrowHead(x2, y2, angle, color, Math.max(8, width * 5)));
  }
  const startArrow = el.arrow?.[0];
  if (startArrow) {
    const angle = Math.atan2(y1 - y2, x1 - x2);
    svg.appendChild(arrowHead(x1, y1, angle, color, Math.max(8, width * 5)));
  }
  return svg;
}

function arrowHead(x, y, angle, color, size) {
  const p = document.createElementNS(SVG_NS, "polygon");
  const tip = [x, y];
  const base1 = [x - size * Math.cos(angle - 0.45), y - size * Math.sin(angle - 0.45)];
  const base2 = [x - size * Math.cos(angle + 0.45), y - size * Math.sin(angle + 0.45)];
  p.setAttribute("points", `${tip[0]},${tip[1]} ${base1[0]},${base1[1]} ${base2[0]},${base2[1]}`);
  p.setAttribute("fill", color);
  return p;
}
