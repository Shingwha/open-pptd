// ============================================================================
// renderer/shape.js — 形状 → SVG（预置几何多路径 + 自定义路径）
// ----------------------------------------------------------------------------
// 预置几何：按 ECMA-376 公式求值出全部路径（主填充 + 明暗面 + 描边细节），
// 与 prstGeom 导出同源；自定义路径（shapeName:"custom"）：viewBox + SVG path
// 直接渲染，与 a:custGeom 导出同源。
// ============================================================================

import { resolveColor } from "../core/theme.js";
import { shapePaths } from "../core/preset-geometry.js";

const SVG_NS = "http://www.w3.org/2000/svg";

function solidFill(theme, fill) {
  if (!fill) return null;
  if (typeof fill === "string") return resolveColor(theme, fill);
  // 严格官方形态：对象必须 {type: "solid", color}；渐变/图片/旧 {color} 形态均不支持
  if (fill.type !== "solid") return null;
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

/** 明暗面调色（预览近似 PowerPoint 的 fill 修饰符）：向白/黑混合。 */
function shadeColor(hex, modifier) {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex || "");
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const mix = (c, target, t) => Math.round(c + (target - c) * t);
  const t = modifier === "lighten" ? 0.45 : modifier === "darken" ? 0.45 : modifier === "lightenLess" ? 0.22 : 0.22;
  const target = modifier.startsWith("lighten") ? 255 : 0;
  return "#" + [mix(r, target, t), mix(g, target, t), mix(b, target, t)].map((v) => v.toString(16).padStart(2, "0")).join("");
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
  if (el.rotation || el.flip?.[0] || el.flip?.[1]) {
    const t = [];
    if (el.rotation) t.push(`rotate(${el.rotation}deg)`);
    if (el.flip?.[0] || el.flip?.[1]) t.push(`scale(${el.flip[0] ? -1 : 1}, ${el.flip[1] ? -1 : 1})`);
    svg.style.transform = t.join(" ");
  }
  if (el.opacity != null) svg.style.opacity = el.opacity;

  // 填充基色：规格 fill 默认不应用（透明，与 writer 无填充导出一致）；
  // 渐变因 SVG path 不能直接用 CSS 渐变，暂保留灰底近似（后续改 SVG gradient）；无 fill 为透明
  const solid = solidFill(theme, el.fill);
  const grad = gradientCss(theme, el.fill);
  const base = solid || (grad ? "#cccccc" : null);

  // 自定义路径：SVG path 直接画（viewBox 拉伸）
  if (el.shapeName === "custom") {
    if (!el.path) {
      console.warn(`[renderer] custom 形状缺少 path（${el.elementId}）`);
      return svg;
    }
    const geom = document.createElementNS(SVG_NS, "path");
    geom.setAttribute("d", el.path);
    const [vw = w, vh = h] = el.viewBox || [w, h];
    if (w / vw !== 1 || h / vh !== 1) {
      geom.setAttribute("transform", `scale(${w / vw} ${h / vh})`);
      geom.setAttribute("vector-effect", "non-scaling-stroke");
    }
    geom.setAttribute("fill", base || "none");
    if (el.border) {
      geom.setAttribute("stroke", resolveColor(theme, el.border.color) || "#000000");
      geom.setAttribute("stroke-width", el.border.width || 1);
      if (el.border.style === "dash") geom.setAttribute("stroke-dasharray", "6 4");
      else if (el.border.style === "dot") geom.setAttribute("stroke-dasharray", "2 3");
    }
    svg.appendChild(geom);
    applyShadow(svg, theme, el.shadow);
    return svg;
  }

  const strokeColor = el.border ? resolveColor(theme, el.border.color) || "#000000" : null;
  const strokeWidth = el.border?.width || 1;
  const strokeDash = el.border?.style === "dash" ? "6 4" : el.border?.style === "dot" ? "2 3" : null;
  // 只描引导线/内线路径：无 border → 不描（与 writer 无 border 写 a:ln noFill 一致，
  // 不再用填充色暗化近似 PowerPoint 的 lnRef 回退线）
  const strokeFor = (p) => ((p.stroke || p.fill === "none") ? strokeColor : null);

  const paths = shapePaths(el.shapeName, w, h, el.adjustments);
  if (!paths) {
    console.warn(`[renderer] 不支持形状 ${el.shapeName}`);
    return svg;
  }

  for (const p of paths) {
    const geom = document.createElementNS(SVG_NS, "path");
    geom.setAttribute("d", p.d);
    if (p.fill === "none") {
      geom.setAttribute("fill", "none");
    } else if (p.fill && p.fill !== "null") {
      // 明暗面：填充色向黑/白混合（预览近似 PowerPoint 明暗效果）；无填充时不绘制
      if (!base) {
        geom.setAttribute("fill", "none");
      } else {
        geom.setAttribute("fill", grad ? base : shadeColor(base, p.fill));
        geom.setAttribute("opacity", grad ? "0.5" : "1");
      }
    } else {
      geom.setAttribute("fill", base || "none");
    }
    const sc = strokeFor(p);
    if (sc) {
      geom.setAttribute("stroke", sc);
      geom.setAttribute("stroke-width", p.fill === "none" ? Math.max(1.2, strokeWidth) : strokeWidth);
      if (strokeDash) geom.setAttribute("stroke-dasharray", strokeDash);
    }
    svg.appendChild(geom);
  }

  if (grad && base) svg.style.background = grad;
  applyShadow(svg, theme, el.shadow);
  return svg;
}

function applyShadow(svg, theme, shadow) {
  if (!shadow) return;
  const [dx = 0, dy = 0] = shadow.offset || [0, 0];
  const color = resolveColor(theme, shadow.color) || "rgba(0,0,0,0.3)";
  svg.style.filter = `drop-shadow(${dx}px ${dy}px ${shadow.blur ?? 6}px ${color})`;
}
