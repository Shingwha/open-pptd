// ============================================================================
// icon-svg.js — 图标 → SVG 字符串（预览渲染与 PPTX 导出同源）
// ----------------------------------------------------------------------------
// 图标数据 def = normalizeIconSvg() 的产物 {inner, w, h}（Font Awesome 路径，
// 已剥根 svg/注释/currentColor）。本模块是唯一生成图标 SVG 的地方：
// 预览端 innerHTML 渲染，导出端写入 media/*.svg —— 预览 = 导出。
//
// fill 注入：逐形状注入（FA inner 经 normalize 后无 fill 属性），比根 svg
// 继承更确定——PowerPoint 的 SVG 引擎对 paint server 继承无规范保证。
// ============================================================================

import { resolveColor } from "./theme.js";
import { svgGradientDef } from "./svg-gradient.js";

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

/** FA inner 里的形状开标签（normalize 后无任何 fill 属性，可安全注入）。 */
const SHAPE_OPEN = /<(path|circle|ellipse|rect|polygon|polyline)(?=[\s/>])/g;

/**
 * 图标 SVG 内部内容（<defs> + 带注入 fill 的 FA inner）。预览端与导出端共用。
 * @param {object} def normalizeIconSvg 产物（{inner, w, h}）
 * @param {object} fill normalizeIconFill 的输出
 * @param {string} [gid] 渐变 id（多图标同页时需唯一；导出单文件可省略）
 */
export function iconSvgBody(def, fill, gid = "ig") {
  if (fill?.type === "gradient") {
    // 与形状同一渐变生成器（model/svg-gradient.js）：矩形全长投影，非正方形上
    // 角度不畸变——此前 icon 自带半向量实现，与形状渐变方向不一致
    const g = svgGradientDef({ fill, id: gid, w: def.w, h: def.h, x: def.vx || 0, y: def.vy || 0 });
    const paint = `url(#${gid})`;
    return `<defs>${g.def}</defs>${def.inner.replace(SHAPE_OPEN, `<$1 fill="${paint}"`)}`;
  }
  const color = fill?.color || "#333333";
  return def.inner.replace(SHAPE_OPEN, `<$1 fill="${color}"`);
}

/** 完整 SVG 文件字符串（写入 PPTX media/*.svg）。viewBox 含原点（FA 部分图标内容越出声明框，已扩展）；
 *  显式 width/height 让 PowerPoint 正确计算固有尺寸（缺失时 PPT 会非等比拉伸铺满图片框）。 */
export function iconToSvg(def, fill, gid = "ig") {
  return `<svg viewBox="${def.vx || 0} ${def.vy || 0} ${def.w} ${def.h}" width="${def.w}" height="${def.h}" xmlns="http://www.w3.org/2000/svg">${iconSvgBody(def, fill, gid)}</svg>\n`;
}
