// ============================================================================
// icon-svg.js — 图标 → SVG 字符串（预览渲染与 PPTX 导出同源）
// ----------------------------------------------------------------------------
// 导出方式：图标作为 SVG 图片嵌入 PPTX（p:pic + a:blip > asvg:svgBlip），
// 与 PowerPoint「插入 → 图标」的原生存储格式完全一致（实测官方文件验证）。
// PowerPoint 用内置 SVG 引擎（MSOSVG.DLL）渲染，与浏览器渲染同一份 SVG，
// 因此预览 = 导出，零转换误差（弧/填充规则等全部由两端原生 SVG 引擎处理）。
//
// 本模块是唯一生成 SVG 的地方：预览端 innerHTML 渲染，导出端写入 media/*.svg。
// ============================================================================

import { resolveColor } from "./theme.js";
import { escAttr } from "./escape.js";

/** 图标填充解析 → {type:'solid', color:hex} 或 {type:'gradient', gradientType, stops:[{color,position}], angle}。 */
export function normalizeIconFill(theme, fill) {
  if (typeof fill === "string") return { type: "solid", color: resolveColor(theme, fill) || "#333333" };
  if (!fill) return { type: "solid", color: resolveColor(theme, "$text") || "#333333" };
  if (fill.type === "gradient" && Array.isArray(fill.stops) && fill.stops.length >= 2) {
    return {
      type: "gradient",
      gradientType: fill.gradientType === "radial" ? "radial" : "linear",
      angle: fill.angle ?? 0,
      stops: fill.stops.map((s) => ({
        color: resolveColor(theme, s.color) || "#333333",
        position: s.position ?? 0,
      })),
    };
  }
  const color = fill.type === "solid" ? fill.color : fill.color ?? "$text";
  return { type: "solid", color: resolveColor(theme, color) || "#333333" };
}

/**
 * 图标 SVG 内部内容（<path> 及可选 <defs>）。预览端与导出端共用。
 * @param {object} def ICONS[key]（含 d / fr）
 * @param {object} fill normalizeIconFill 的输出
 * @param {string} [gid] 渐变 id（多图标同页时需唯一；导出单文件可省略）
 */
export function iconSvgBody(def, fill, gid = "ig") {
  const fr = def.fr ? ` fill-rule="${def.fr}"` : "";
  const d = escAttr(def.d);
  if (fill?.type === "gradient") {
    const stops = fill.stops
      .map(
        (s) =>
          `<stop offset="${Math.round((s.position ?? 0) * 100)}%" stop-color="${s.color}"/>`
      )
      .join("");
    // 径向：圆心居中；线性：angle 0 = 左→右、顺时针（references/pptd.md），方向向量 (cos θ, sin θ)
    const grad =
      fill.gradientType === "radial"
        ? `<radialGradient id="${gid}" cx="50%" cy="50%" r="50%">${stops}</radialGradient>`
        : (() => {
            const rad = ((fill.angle || 0) * Math.PI) / 180;
            const dx = Math.cos(rad);
            const dy = Math.sin(rad);
            return (
              `<linearGradient id="${gid}" x1="${(0.5 - dx / 2).toFixed(4)}" y1="${(0.5 - dy / 2).toFixed(4)}" ` +
              `x2="${(0.5 + dx / 2).toFixed(4)}" y2="${(0.5 + dy / 2).toFixed(4)}">${stops}</linearGradient>`
            );
          })();
    return `<defs>${grad}</defs><path${fr} d="${d}" fill="url(#${gid})"/>`;
  }
  const color = fill?.color || "#333333";
  return `<path${fr} d="${d}" fill="${color}"/>`;
}

/** 完整 SVG 文件字符串（写入 PPTX media/*.svg）。 */
export function iconToSvg(def, fill, gid = "ig") {
  return `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">${iconSvgBody(def, fill, gid)}</svg>\n`;
}

