// ============================================================================
// renderer/gradient.js — GradientFill → CSS / SVG 渐变（渲染端统一入口）
// ----------------------------------------------------------------------------
// 角度规格（references/pptd.md）：angle 0 = 左→右，顺时针增大（90 = 上→下）。
// CSS linear-gradient 的 0deg = 朝上、顺时针增大 → CSS 角度 = PPTD 角度 + 90。
// 形状（SVG path）不能用 CSS 渐变，走 svgGradient 生成 <defs> 渐变由 url(#id) 引用；
// 背景 / 文字（background-clip:text）/ 图表框走 gradientCss。
// ============================================================================

import { resolveColor } from "../model/theme.js";
import { svgGradientDef } from "../model/svg-gradient.js";

function valid(fill) {
  return fill?.type === "gradient" && Array.isArray(fill.stops) && fill.stops.length >= 2;
}

/** PPTD 渐变角度 → CSS linear-gradient 角度（度）。 */
function gradientCssAngle(angle) {
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

/**
 * GradientFill → SVG 渐变定义（形状 path 用）。返回 { id, def }：def 由调用方放进
 * <defs>，路径用 fill="url(#id)" 引用；无效渐变返回 null。生成逻辑统一在
 * model/svg-gradient.js（与图标同源）：linear userSpaceOnUse 矩形全长投影，
 * radial objectBoundingBox 圆。
 */
export function svgGradient(theme, fill, w, h) {
  const id = `pptd-grad-${++uid}`;
  return svgGradientDef({ theme, fill, id, w, h });
}
