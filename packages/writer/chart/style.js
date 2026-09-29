// ============================================================================
// writer/chart/style.js — shared Chart XML style fragments (series fill/line/text/labels/marker)
// ----------------------------------------------------------------------------

import { el, escAttr, hexToRgbVal } from "../xml.js";
import { resolveColor, colorOr, resolveFont } from "../../model/theme.js";
import { dashSpec } from "../../model/style-spec.js";
import { parseHexColor, CHART_DEFAULTS } from "../../model/chart.js";
import { buildFill, buildLn, buildShadow, solidFillResolved } from "../drawing.js";

/** Color → a:srgbClr (HEX6 converted directly; HEX8 splits out an alpha child — parsing has a
 * single implementation in model parseHexColor, shared with cx:dataPt). */
export function srgbClrXml(color) {
  const parsed = parseHexColor(color);
  if (parsed) {
    return el("a:srgbClr", { val: parsed.rgb.toUpperCase() },
      parsed.alpha == null ? "" : el("a:alpha", { val: Math.round(parsed.alpha * 100000) }));
  }
  return el("a:srgbClr", { val: hexToRgbVal(color) });
}

/** Series fill → a:solidFill (resolveColor first turns $tokens into concrete colors, then go through
 * drawing.js solidFillResolved — the string branch of colorElement/buildFill cannot be used: it maps
 * $text/$bg/$primary/$accent to schemeClr, and HEX8 + explicit alpha means "override" rather than
 * "multiply", see drawing.js solidFillResolved). */
export function fillXml(theme, color, alpha) {
  // A gradient object (official series fill supports GradientFill) → buildFill; a string color → solidFill
  if (color && typeof color === "object") return buildFill(theme, color);
  return solidFillResolved(colorOr(theme, color, "#000000"), alpha);
}

/** Series line (a:ln: theme color resolution + HEX8 + lineStyle → prstDash). */
export function lnXml(theme, color, widthPt = 2, style = "solid") {
  const dash = dashSpec(style)?.ooxml;
  const lnAttrs = { w: Math.round(widthPt * 12700), cap: "flat", cmpd: "sng", algn: "ctr" };
  // A gradient object (official lineColor/areaColor support GradientFill) → buildFill
  if (color && typeof color === "object") {
    const kids = [buildFill(theme, color)];
    if (dash) kids.push(el("a:prstDash", { val: dash }));
    return el("a:ln", lnAttrs, kids.join(""));
  }
  const kids = [el("a:solidFill", {}, srgbClrXml(colorOr(theme, color, "#000000")))];
  if (dash) kids.push(el("a:prstDash", { val: dash }));
  return el("a:ln", lnAttrs, kids.join(""));
}

/** Text-box properties (c:txPr; label config → size/color/font overrides). */
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

/** Official dataLabels → c:dLbls (content: value/percentage/category + numberFormat + style).
 * pos: label position (OOXML dLblPos, e.g. "outEnd" for pies to match the preview's outside +
 * leader lines; omitted = PowerPoint's per-type default — inside bars/pies bestFit). */
export function dLblsXml(theme, cfg, globalFamily, pos = null) {
  const content = cfg?.content || "value";
  const kids = [];
  if (cfg?.numberFormat) kids.push(el("c:numFmt", { formatCode: cfg.numberFormat, sourceLinked: "0" }));
  kids.push(
    el("c:spPr", {}, el("a:noFill")),
    txPrXml(theme, cfg?.fontSize ? Math.round(cfg.fontSize * 100) : CHART_DEFAULTS.labelSize * 100, "tx1", { ...(cfg?.color ? { color: cfg.color } : {}), ...(cfg?.fontFamily || globalFamily ? { fontFamily: cfg?.fontFamily || globalFamily } : {}) }),
  );
  // CT_DLbls order: numFmt → spPr → txPr → dLblPos → show*
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

/** Series marker (official MarkerConfig → c:marker). */
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

/** Chart frame (official Chart.fill/border/shadow → chartSpace spPr) — the classic c: and chartEx cx:
 * spPr are isomorphic and share this single implementation. */
export function chartSpaceSpPrXml(theme, chartEl, tag = "c") {
  return (chartEl.fill || chartEl.border || chartEl.shadow)
    ? el(`${tag}:spPr`, {}, [
      chartEl.fill ? buildFill(theme, chartEl.fill) : "",
      chartEl.border ? buildLn(theme, chartEl.border) : "",
      chartEl.shadow ? buildShadow(theme, chartEl.shadow) : "",
    ].join(""))
    : "";
}

/** Rich-text character style inner (solidFill + latin/ea) — shared by c:title and cx:title/rich
 * a:rPr / a:defRPr; with no color it falls to schemeClr tx1. */
export function richCharStyleXml(theme, { color = null, fontFamily = null }) {
  const fonts = resolveFont(theme, fontFamily);
  const col = color ? resolveColor(theme, color) : null;
  return (col
    ? `<a:solidFill><a:srgbClr val="${hexToRgbVal(col)}"/></a:solidFill>`
    : `<a:solidFill><a:schemeClr val="tx1"/></a:solidFill>`) +
    `<a:latin typeface="${escAttr(fonts.latin)}"/><a:ea typeface="${escAttr(fonts.ea)}"/>`;
}
