// ============================================================================
// renderer/line.js — 线条 → SVG（直线 / 折线 sharp·round / 贝塞尔 smooth + 箭头）
// ----------------------------------------------------------------------------
// 官方语义：points 首尾为经过点，中间为贝塞尔控制点（smooth）；
// sharp=直线段折线，round=圆角连接折线，smooth=贝塞尔曲线。
// 2 点时三者等价（直线）。
// ============================================================================

import { resolveColor } from "../core/theme.js";
import { parsePoints, smoothSegments } from "../core/geometry.js";
import { createElementShell } from "./shell.js";

const SVG_NS = "http://www.w3.org/2000/svg";

export function renderLine(theme, el) {
  const [bx, by] = el.bounds;
  const svg = createElementShell(el, { tag: "svg" });

  const pts = parsePoints(el.points, el.viewBox || [1, 1], el.bounds);
  if (!pts || pts.length < 2) return svg;
  // SVG 内部坐标系以 bounds 原点为 (0,0)，需转为相对坐标（否则画到视口外不可见）
  const rel = pts.map(([px, py]) => [px - bx, py - by]);
  const [x1, y1] = rel[0];
  const [x2, y2] = rel[rel.length - 1];

  const color = resolveColor(theme, el.border?.color) || "#000000";
  const width = el.border?.width || 1;
  const dash = el.border?.style === "dash" ? "6 4" : el.border?.style === "dot" ? "2 3" : null;
  const curve = el.curve || "round";

  // 曲线（多点）用 path；直线用 line
  let shape;
  if (rel.length > 2) {
    shape = document.createElementNS(SVG_NS, "path");
    if (curve === "smooth") {
      // 贝塞尔：首尾为经过点，中间为控制点（分段与 writer 共用 smoothSegments，末锚点必达）
      let d = `M ${x1} ${y1}`;
      for (const s of smoothSegments(rel)) {
        if (s.cmd === "Q") {
          d += ` Q ${s.pts[0][0]} ${s.pts[0][1]} ${s.pts[1][0]} ${s.pts[1][1]}`;
        } else if (s.cmd === "C") {
          d += ` C ${s.pts[0][0]} ${s.pts[0][1]} ${s.pts[1][0]} ${s.pts[1][1]} ${s.pts[2][0]} ${s.pts[2][1]}`;
        } else {
          d += ` L ${s.pts[0][0]} ${s.pts[0][1]}`;
        }
      }
      shape.setAttribute("d", d);
    } else {
      // sharp / round：经过全部点的折线（仅连接样式不同）
      shape.setAttribute("d", `M ${x1} ${y1} L ${rel.slice(1).map(([px, py]) => `${px} ${py}`).join(" L ")}`);
      shape.setAttribute("stroke-linejoin", curve === "round" ? "round" : "miter");
    }
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

  // 箭头方向 = 路径端点切线（曲线取最后一段方向，折线取末段方向）
  const endAngle = Math.atan2(y2 - rel[rel.length - 2][1], x2 - rel[rel.length - 2][0]);
  const startAngle = Math.atan2(rel[1][1] - y1, rel[1][0] - x1);
  const endArrow = el.arrow?.[1];
  if (endArrow) {
    svg.appendChild(arrowHead(x2, y2, endAngle, color, Math.max(8, width * 5)));
  }
  const startArrow = el.arrow?.[0];
  if (startArrow) {
    svg.appendChild(arrowHead(x1, y1, startAngle, color, Math.max(8, width * 5)));
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
