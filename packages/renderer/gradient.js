// ============================================================================
// renderer/gradient.js — GradientFill → CSS / SVG 渐变（渲染端统一入口）
// ----------------------------------------------------------------------------
// 角度规格（references/pptd.md）：angle 0 = 左→右，顺时针增大（90 = 上→下）。
// CSS linear-gradient 的 0deg = 朝上、顺时针增大 → CSS 角度 = PPTD 角度 + 90。
// 形状（SVG path）不能用 CSS 渐变，走 svgGradient 生成 <defs> 渐变由 url(#id) 引用；
// 背景 / 文字（background-clip:text）/ 图表框走 gradientCss。
// ============================================================================

import { resolveColor } from "../model/theme.js";

function valid(fill) {
  return fill?.type === "gradient" && Array.isArray(fill.stops) && fill.stops.length >= 2;
}

/** PPTD 渐变角度 → CSS linear-gradient 角度（度）。 */
export function gradientCssAngle(angle) {
  return ((Number(angle) || 0) + 90) % 360;
}

/** GradientFill → CSS background 声明（linear / radial）；无效渐变返回 null。 */
export function gradientCss(theme, fill) {
  if (!valid(fill)) return null;
  const stops = fill.stops
    .map((s) => `${resolveColor(theme, s.color) || s.color} ${Math.round((s.position ?? 0) * 100)}%`)
    .join(", ");
  if (fill.gradientType === "radial") return `radial-gradient(circle, ${stops})`;
  return `linear-gradient(${gradientCssAngle(fill.angle)}deg, ${stops})`;
}

let uid = 0;

/** 色标 → SVG <stop>（#RRGGBBAA 拆成 stop-color + stop-opacity）。 */
function stopXml(theme, s) {
  let color = resolveColor(theme, s.color) || s.color;
  let opacity = "";
  const m = /^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})$/.exec(color || "");
  if (m) {
    color = `#${m[1]}`;
    opacity = ` stop-opacity="${(parseInt(m[2], 16) / 255).toFixed(3)}"`;
  }
  return `<stop offset="${Math.round((s.position ?? 0) * 100)}%" stop-color="${color}"${opacity}/>`;
}

/**
 * GradientFill → SVG 渐变定义。返回 { id, def }：def 由调用方放进 <defs>，
 * 路径用 fill="url(#id)" 引用；无效渐变返回 null。
 * linear：userSpaceOnUse，按角度在 (w,h) 坐标系内取矩形投影全长作渐变向量
 * （w,h 取路径所在用户坐标系：预置几何 = bounds，custom = viewBox）；
 * radial：objectBoundingBox 圆（随形状拉伸，近似 OOXML path="circle"）。
 */
export function svgGradient(theme, fill, w, h) {
  if (!valid(fill)) return null;
  const id = `pptd-grad-${++uid}`;
  const stops = fill.stops.map((s) => stopXml(theme, s)).join("");
  if (fill.gradientType === "radial") {
    return { id, def: `<radialGradient id="${id}" cx="50%" cy="50%" r="50%">${stops}</radialGradient>` };
  }
  const rad = ((Number(fill.angle) || 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cx = w / 2;
  const cy = h / 2;
  const half = (Math.abs(w * cos) + Math.abs(h * sin)) / 2;
  const f = (v) => Math.round(v * 100) / 100;
  const def =
    `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" ` +
    `x1="${f(cx - half * cos)}" y1="${f(cy - half * sin)}" x2="${f(cx + half * cos)}" y2="${f(cy + half * sin)}">` +
    `${stops}</linearGradient>`;
  return { id, def };
}
