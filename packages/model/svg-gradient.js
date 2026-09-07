// ============================================================================
// svg-gradient.js — GradientFill → SVG <defs> 渐变定义（预览与导出媒体同源）
// ----------------------------------------------------------------------------
// 角度规格（references/pptd.md）：angle 0 = 左→右、顺时针增大（90 = 上→下）。
// linear 用 userSpaceOnUse、按矩形全长投影取渐变向量（与 CSS 渐变线公式一致，
// 非正方形上角度不畸变）；radial 为 objectBoundingBox 圆（cx/cy 50%、r 50%）。
// 形状（renderer/svgGradient）与图标（model/iconSvgBody）共用本生成器——
// 此前 icon 自带一份 objectBoundingBox 半向量实现，非正方形上渐变方向与形状不一致。
// ============================================================================

import { resolveColor } from "./theme.js";

function valid(fill) {
  return fill?.type === "gradient" && Array.isArray(fill.stops) && fill.stops.length >= 2;
}

/** 色标 → <stop>（#RRGGBBAA 拆 stop-color + stop-opacity；theme 传入时先解析 $token）。 */
function stopXml(theme, s) {
  let color = theme ? resolveColor(theme, s.color) || s.color : s.color;
  let opacity = "";
  const m = /^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})$/.exec(color || "");
  if (m) {
    color = `#${m[1]}`;
    opacity = ` stop-opacity="${(parseInt(m[2], 16) / 255).toFixed(3)}"`;
  }
  return `<stop offset="${Math.round((s.position ?? 0) * 100)}%" stop-color="${color}"${opacity}/>`;
}

/**
 * GradientFill → SVG 渐变定义。返回 { id, def }；无效渐变返回 null。
 * @param {object} opts
 *   - theme: 主题（解析 $token 色标；icon 场景色已解析可不传）
 *   - fill:  GradientFill
 *   - id:    渐变 id（调用方保证唯一，引用 fill="url(#id)"）
 *   - w, h:  用户坐标系矩形尺寸（linear 渐变向量投影用）
 *   - x, y:  用户坐标系矩形原点（默认 0,0；icon viewBox 原点可能非零）
 */
export function svgGradientDef({ theme = null, fill, id, w, h, x = 0, y = 0 }) {
  if (!valid(fill)) return null;
  const stops = fill.stops.map((s) => stopXml(theme, s)).join("");
  if (fill.gradientType === "radial") {
    return { id, def: `<radialGradient id="${id}" cx="50%" cy="50%" r="50%">${stops}</radialGradient>` };
  }
  const rad = ((Number(fill.angle) || 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const half = (Math.abs(w * cos) + Math.abs(h * sin)) / 2;
  const f = (v) => Math.round(v * 100) / 100;
  const def =
    `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" ` +
    `x1="${f(cx - half * cos)}" y1="${f(cy - half * sin)}" x2="${f(cx + half * cos)}" y2="${f(cy + half * sin)}">` +
    `${stops}</linearGradient>`;
  return { id, def };
}
