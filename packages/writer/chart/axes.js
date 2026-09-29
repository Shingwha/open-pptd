// ============================================================================
// writer/chart/axes.js — axis XML (full official AxisConfig → catAx/valAx; axis-array rules)
// ----------------------------------------------------------------------------

import { el, esc, hexToRgbVal } from "../xml.js";
import { resolveColor, resolveFont } from "../../model/theme.js";
import { toAxisArray, seriesAxisIndex, CHART_DEFAULTS } from "../../model/chart.js";
import { txPrXml, srgbClrXml } from "./style.js";

/** LineStyleConfig | boolean → a:ln element (shared by axisLine/gridLine). null = emit nothing. */
function axisLnXml(theme, cfg, fallbackColor, fallbackWidth = 0.75) {
  if (cfg === false) return null; // the caller decides to omit or use noFill
  const o = typeof cfg === "object" ? cfg : {};
  const color = o.color ? resolveColor(theme, o.color) : resolveColor(theme, fallbackColor) || "#6b7280";
  const kids = [el("a:solidFill", {}, srgbClrXml(color))];
  const dash = { dash: "dash", dot: "dot" }[o.style];
  if (dash) kids.push(el("a:prstDash", { val: dash }));
  // arrow (official axisLine.arrow → headEnd/tailEnd; CT_LineProperties order puts headEnd first)
  const arrow = typeof cfg === "object" ? cfg.arrow : null;
  const head = arrow === "start" || arrow === "both" || arrow === true ? "start" : null;
  const tail = arrow === "end" || arrow === "both" || arrow === true ? "end" : null;
  const arrowEl = (which) => el(`a:${which}End`, { type: "triangle", w: "med", len: "med" });
  if (head) kids.push(arrowEl("head"));
  if (tail) kids.push(arrowEl("tail"));
  return el("a:ln", { w: Math.round((o.width ?? fallbackWidth) * 12700), cap: "flat", cmpd: "sng", algn: "ctr" }, kids.join(""));
}

/** Axis title (string | TitleConfig → c:title; schema position: after axPos).
 * A configured fontFamily takes effect (aligned with chartEx axis-title semantics); when unset it
 * keeps the +mn-lt/+mn-ea theme references unchanged. */
function axisTitleXml(theme, title, chartFontFamily = null) {
  const cfg = typeof title === "string" ? { text: title } : title || null;
  if (!cfg || !cfg.text) return "";
  const sz = cfg.fontSize ? Math.round(cfg.fontSize * 100) : CHART_DEFAULTS.axisSize * 100;
  const kids = [el("a:bodyPr"), el("a:lstStyle")];
  const rPrKids = [];
  const col = cfg.color ? resolveColor(theme, cfg.color) : null;
  rPrKids.push(col ? el("a:solidFill", {}, el("a:srgbClr", { val: hexToRgbVal(col) })) : el("a:solidFill", {}, el("a:schemeClr", { val: "tx1" })));
  const ff = cfg.fontFamily || chartFontFamily || null;
  if (ff) {
    const fonts = resolveFont(theme, ff);
    rPrKids.push(el("a:latin", { typeface: fonts.latin }), el("a:ea", { typeface: fonts.ea }));
  } else {
    rPrKids.push(el("a:latin", { typeface: "+mn-lt" }), el("a:ea", { typeface: "+mn-ea" }));
  }
  kids.push(
    el("a:p", {}, [
      el("a:pPr"),
      el("a:r", {}, [
        el("a:rPr", { lang: "zh-CN", sz }, rPrKids.join("")),
        el("a:t", {}, esc(cfg.text)),
      ].join("")),
    ].join(""))
  );
  return el("c:title", {}, [el("c:tx", {}, el("c:rich", {}, kids.join(""))), el("c:layout")].join(""));
}

/**
 * Single-axis XML (full official AxisConfig).
 * @param {object} p {theme, id, crossId, kind: "cat"|"val", pos, cfg, secondary, tickLabels, crosses, fontFamily}
 *   secondary: secondary axis — the category axis gets delete=1 (data is not duplicated; it only pairs the axis); the value axis switches sides
 *   fontFamily: chart.fontFamily (axis-title fontFamily fallback)
 */
function axisXml(theme, { id, crossId, kind, pos, cfg = {}, secondary = false, tickLabels = true, crosses = "autoZero", valNumFmt = null, fontFamily = null }) {
  const show = cfg.show !== false;
  const kids = [
    el("c:axId", { val: id }),
    // CT_Scaling order: logBase → orientation → max → min
    el("c:scaling", {}, [
      cfg.reverse ? el("c:orientation", { val: "maxMin" }) : el("c:orientation", { val: "minMax" }),
      kind === "val" && cfg.max != null ? el("c:max", { val: cfg.max }) : "",
      kind === "val" && cfg.min != null ? el("c:min", { val: cfg.min }) : "",
    ].join("")),
    el("c:delete", { val: show && !secondary ? "0" : "1" }),
    el("c:axPos", { val: pos }),
    axisTitleXml(theme, cfg.title, fontFamily),
  ];
  // majorGridlines (value axis; gridLine: false → not emitted)
  const gridCfg = kind === "val" ? cfg.gridLine : null;
  if (kind === "val" && gridCfg !== false) {
    const ln = axisLnXml(theme, gridCfg, theme.colors?.line || "#e5e7eb", 0.5);
    kids.push(el("c:majorGridlines", {}, ln ? el("c:spPr", {}, ln) : ""));
  }
  // numFmt (value-axis label.numberFormat; with percentStacked the value axis is a 0-1 share, and
  // the default General would show decimals like 0.2, so 0% matches the preview/native PowerPoint)
  const numFmt = (kind === "val" && cfg.label && typeof cfg.label === "object" && cfg.label.numberFormat)
    ? cfg.label.numberFormat
    : kind === "val" && valNumFmt ? valNumFmt
    : null;
  kids.push(el("c:numFmt", { formatCode: numFmt || "General", sourceLinked: numFmt ? "0" : "0" }));
  kids.push(el("c:majorTickMark", { val: "none" }), el("c:minorTickMark", { val: "none" }));
  // tickLblPos: label: false → none
  kids.push(el("c:tickLblPos", { val: tickLabels && cfg.label !== false ? "nextTo" : "none" }));
  // spPr: axisLine (draws the theme line by default; false → noFill to hide)
  const axisLn = cfg.axisLine === false ? el("a:ln", {}, el("a:noFill")) : axisLnXml(theme, cfg.axisLine, theme.colors?.line || "#d8dce1", 0.75);
  if (axisLn) kids.push(el("c:spPr", {}, axisLn));
  // txPr (label style)
  kids.push(txPrXml(theme, CHART_DEFAULTS.axisSize * 100, "tx1", cfg.label && typeof cfg.label === "object" ? cfg.label : null));
  kids.push(el("c:crossAx", { val: crossId }));
  // A secondary value axis must use crosses=max (crossing at the category axis maximum makes the side
  // switch work); autoZero makes PowerPoint cross at category 0, conflicting with axPos and scrambling
  // the secondary-axis layout (ticks misaligned, line mapping broken)
  kids.push(el("c:crosses", { val: crosses }));
  if (kind === "val") kids.push(el("c:crossBetween", { val: "between" }));
  else kids.push(el("c:auto", { val: "1" }), el("c:lblAlgn", { val: "ctr" }), el("c:lblOffset", { val: "100" }), el("c:noMultiLvlLbl", { val: "0" }));
  return el(`c:${kind === "cat" ? "catAx" : "valAx"}`, {}, kids.join(""));
}

/**
 * radar axis group (spokeAxis already reduced to two AxisConfigs; radar has no secondary axis, fixed cat(1)+val(2)).
 */
export function buildRadarAxesXml(theme, catCfg, valCfg, fontFamily = null) {
  return axisXml(theme, { id: 1, crossId: 2, kind: "cat", pos: "b", cfg: catCfg, fontFamily }) +
    axisXml(theme, { id: 2, crossId: 1, kind: "val", pos: "l", cfg: valCfg, fontFamily });
}

/**
 * Whole-chart axis group (axis-array rules): primary (1,2); any series with index>0 →
 * secondary (3,4) (the value axis switches sides + the category axis is hidden).
 * @param {object} p {theme, el, series, horizontal, axes: "catVal"|"valVal", valNumFmt}
 *   valNumFmt: primary value-axis default format (percentStacked → "0%"); a user label.numberFormat wins
 */
export function buildAxesXml(theme, el, series, horizontal, mode = "catVal", { valNumFmt = null } = {}) {
  const maxIdx = Math.max(0, ...series.map((s) => seriesAxisIndex(s, horizontal)));
  // Axis config: vertical charts = xAxis→category / yAxis→value; horizontal = yAxis→category / xAxis→value
  const xAxes = toAxisArray(el.xAxis);
  const yAxes = toAxisArray(el.yAxis);
  const catCfg = horizontal ? yAxes[0] : xAxes[0];
  const valCfg = horizontal ? xAxes[0] : yAxes[0];
  const catPos = horizontal ? "l" : "b";
  const valPos = horizontal ? "b" : "l";
  const secValPos = horizontal ? "t" : "r";
  const out = [];
  const ff = el.fontFamily || null;
  if (mode === "valVal") {
    // scatter/bubble: dual value axes
    out.push(axisXml(theme, { id: 1, crossId: 2, kind: "val", pos: "b", cfg: xAxes[0], fontFamily: ff }));
    out.push(axisXml(theme, { id: 2, crossId: 1, kind: "val", pos: "l", cfg: yAxes[0], fontFamily: ff }));
    for (let i = 1; i <= maxIdx; i++) {
      const id = 1 + i * 2;
      out.push(axisXml(theme, { id, crossId: id + 1, kind: "val", pos: "t", cfg: xAxes[i] || {}, crosses: "max", fontFamily: ff }));
      out.push(axisXml(theme, { id: id + 1, crossId: id, kind: "val", pos: "r", cfg: yAxes[i] || {}, crosses: "max", fontFamily: ff }));
    }
    return out.join("");
  }
  // catVal (bar/line/area/candlestick/radar etc.)
  out.push(axisXml(theme, { id: 1, crossId: 2, kind: "cat", pos: catPos, cfg: catCfg, fontFamily: ff }));
  out.push(axisXml(theme, { id: 2, crossId: 1, kind: "val", pos: valPos, cfg: valCfg, valNumFmt, fontFamily: ff }));
  for (let i = 1; i <= maxIdx; i++) {
    // Secondary-axis ID assignment must match groupAxisId's convention (category=1+i*2, value=2+i*2):
    // chart groups reference [1+i*2, 2+i*2] with category first and value second; if a valAx grabbed
    // 1+i*2, PowerPoint would parse the value axis as a category axis and flip the secondary axis
    const catId = 1 + i * 2;
    const valId = 2 + i * 2;
    // Secondary axis: value axis switches sides (crosses=max) + the category axis is hidden (pairing only, delete=1)
    out.push(axisXml(theme, { id: valId, crossId: catId, kind: "val", pos: secValPos, cfg: horizontal ? xAxes[i] || {} : yAxes[i] || {}, secondary: false, crosses: "max", fontFamily: ff }));
    out.push(axisXml(theme, { id: catId, crossId: valId, kind: "cat", pos: catPos, cfg: horizontal ? yAxes[i] || {} : xAxes[i] || {}, secondary: true, fontFamily: ff }));
  }
  return out.join("");
}
