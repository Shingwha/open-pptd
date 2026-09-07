// ============================================================================
// writer/chart/style.js — Chart XML 公共样式片段（系列填充/线条/文本/标签/marker）
// ----------------------------------------------------------------------------

import { el, hexToRgbVal } from "../xml.js";
import { resolveColor, resolveFont } from "../../model/theme.js";
import { dashSpec } from "../../model/style-spec.js";
import { buildFill, solidFillResolved } from "../drawing.js";
import { CHART_DEFAULTS } from "../../model/chart.js";

/** 颜色 → a:srgbClr（HEX6 直接转；HEX8 拆出 alpha 子元素）。 */
export function srgbClrXml(color) {
  const c = String(color || "#000000");
  if (/^#[0-9a-fA-F]{8}$/.test(c)) {
    const alpha = Math.round((parseInt(c.slice(7), 16) / 255) * 100000);
    return el("a:srgbClr", { val: hexToRgbVal(c.slice(0, 7)) }, el("a:alpha", { val: alpha }));
  }
  return el("a:srgbClr", { val: hexToRgbVal(c) });
}

/** 系列填充 → a:solidFill（先 resolveColor 解析 $token 为具体色，再走 drawing.js
 * 的 solidFillResolved——不能直接用 colorElement/buildFill 的字符串分支：
 * 它们会把 $text/$bg/$primary/$accent 映射成 schemeClr，且 HEX8+显式 alpha 的
 * 语义是"覆盖"而非"相乘"，见 drawing.js solidFillResolved 注释）。 */
export function fillXml(theme, color, alpha) {
  // 渐变对象（官方系列 fill 支持 GradientFill）→ buildFill；字符串色 → solidFill
  if (color && typeof color === "object") return buildFill(theme, color);
  return solidFillResolved(resolveColor(theme, color) || "#000000", alpha);
}

/** 系列线条（a:ln，主题色解析 + HEX8 + lineStyle → prstDash）。 */
export function lnXml(theme, color, widthPt = 2, style = "solid") {
  const dash = dashSpec(style)?.ooxml;
  const lnAttrs = { w: Math.round(widthPt * 12700), cap: "flat", cmpd: "sng", algn: "ctr" };
  // 渐变对象（官方 lineColor/areaColor 支持 GradientFill）→ buildFill
  if (color && typeof color === "object") {
    const kids = [buildFill(theme, color)];
    if (dash) kids.push(el("a:prstDash", { val: dash }));
    return el("a:ln", lnAttrs, kids.join(""));
  }
  const kids = [el("a:solidFill", {}, srgbClrXml(resolveColor(theme, color) || "#000000"))];
  if (dash) kids.push(el("a:prstDash", { val: dash }));
  return el("a:ln", lnAttrs, kids.join(""));
}

/** 文本框属性（c:txPr；label 配置 → 字号/颜色/字体覆盖）。 */
export function txPrXml(theme, size = 900, color = "tx1", label = null) {
  const fonts = resolveFont(theme, label?.fontFamily || null);
  const defRPrKids = [];
  const lblColor = label && typeof label === "object" && label.color ? resolveColor(theme, label.color) : null;
  if (lblColor) defRPrKids.push(el("a:solidFill", {}, el("a:srgbClr", { val: hexToRgbVal(lblColor) })));
  else defRPrKids.push(el("a:solidFill", {}, el("a:schemeClr", { val: color })));
  defRPrKids.push(
    el("a:latin", { typeface: fonts.latin }),
    el("a:ea", { typeface: fonts.ea }),
    el("a:cs", { typeface: fonts.ea })
  );
  const sz = label && typeof label === "object" && label.fontSize != null ? Math.round(label.fontSize * 100) : size;
  return (
    el("c:txPr", {}, [
      el("a:bodyPr"),
      el("a:lstStyle"),
      el("a:p", {}, el("a:pPr", {}, el("a:defRPr", { sz }, defRPrKids.join("")))),
    ].join(""))
  );
}

/** 官方 dataLabels → c:dLbls（content: value/percentage/category + numberFormat + 样式）。
 * pos：标签位置（OOXML dLblPos，如饼图 "outEnd" 对齐预览的外置+引导线；省略 = PowerPoint
 * 按图表类型默认——柱内/饼内 bestFit）。 */
export function dLblsXml(theme, cfg, globalFamily, pos = null) {
  const content = cfg?.content || "value";
  const kids = [];
  if (cfg?.numberFormat) kids.push(el("c:numFmt", { formatCode: cfg.numberFormat, sourceLinked: "0" }));
  kids.push(
    el("c:spPr", {}, el("a:noFill")),
    txPrXml(theme, cfg?.fontSize ? Math.round(cfg.fontSize * 100) : CHART_DEFAULTS.labelSize * 100, "tx1", { ...(cfg?.color ? { color: cfg.color } : {}), ...(cfg?.fontFamily || globalFamily ? { fontFamily: cfg?.fontFamily || globalFamily } : {}) }),
  );
  // CT_DLbls 顺序：numFmt → spPr → txPr → dLblPos → show*
  if (pos) kids.push(el("c:dLblPos", { val: pos }));
  kids.push(
    el("c:showLegendKey", { val: "0" }),
    el("c:showVal", { val: content === "value" ? "1" : "0" }),
    el("c:showCatName", { val: content === "category" ? "1" : "0" }),
    el("c:showSerName", { val: "0" }),
    el("c:showPercent", { val: content === "percentage" ? "1" : "0" }),
    el("c:showBubbleSize", { val: "0" }),
  );
  if (content === "category" && cfg?.separator) kids.push(el("c:separator", { val: cfg.separator }));
  return el("c:dLbls", {}, kids.join(""));
}

/** 系列 marker（官方 MarkerConfig → c:marker）。 */
export function markerXml(theme, marker, color) {
  if (!marker || marker === false) return "";
  const cfg = typeof marker === "object" ? marker : {};
  const shape = { circle: "circle", rect: "square", diamond: "diamond", triangle: "triangle" }[cfg.shape] || "circle";
  const kids = [el("c:symbol", { val: shape })];
  if (cfg.size != null) kids.push(el("c:size", { val: Math.max(2, Math.round(cfg.size)) }));
  const fill = cfg.fill || color;
  if (fill) kids.push(el("c:spPr", {}, fillXml(theme, fill)));
  return el("c:marker", {}, kids.join(""));
}
