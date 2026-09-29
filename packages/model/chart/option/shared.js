// ============================================================================
// model/chart/option/shared.js — common ECharts option assembly fragments (pure functions, no DOM)
// ----------------------------------------------------------------------------
// This directory (model/chart/option/) is the shared option single source for preview
// rendering and export rasterization (SSR). Pure data assembly: importing echarts or
// touching window/document is forbidden (enforced by dep-graph).
// ============================================================================

import { resolveColor, colorOr, resolveFont } from "../../theme.js";
import { dashSpec } from "../../style-spec.js";
import { CHART_DEFAULTS } from "../meta.js";
import { resolveDataLabels } from "../labels.js";
import { formatChartValue } from "../format.js";

/** Theme axis/text default styles (font size from the official CHART_DEFAULTS single source). */
export const AXIS_TEXT = { color: "#6b7280", fontSize: CHART_DEFAULTS.axisSize };

/** Cartesian grid margins (px; shared by the ECharts layout and the category-label crowding estimate).
 * Defined only in model/chart/layout.js (same basis as the export manualLayout); re-exported here. */
export { CHART_GRID } from "../layout.js";

/** Theme chart styles (grid/axis/text colors follow the theme colors keys, falling back to built-in defaults). */
export function chartStyleColors(theme) {
  return {
    labelColor: colorOr(theme, theme.colors?.text, "#1f2937"),
    axisColor: colorOr(theme, theme.colors?.line, "#d8dce1"),
    gridColor: colorOr(theme, theme.colors?.line, "#f0f2f5"),
    legendColor: colorOr(theme, theme.colors?.text, "#1f2937"),
  };
}

/** Official dataLabels -> ECharts label config (including style color/fontSize).
 * For scatter/bubble p.value is an [x,y(,size)] array, so the display value is taken from
 * the y channel (matching showVal on the export side). */
export function echartsLabel(theme, el, s, { position = "top", pie = false } = {}) {
  const cfg = resolveDataLabels(el, s, s.type);
  if (!cfg) return undefined;
  const { labelColor } = chartStyleColors(theme);
  const displayValue = (p) => (Array.isArray(p.value) ? p.value[1] : p.value);
  let formatter;
  if (cfg.content === "percentage") formatter = pie ? "{d}%" : (p) => `${(p.percent ?? 0).toFixed(1)}%`;
  else if (cfg.content === "category") formatter = pie ? "{b}" : (p) => p.name;
  else formatter = (p) => (cfg.numberFormat ? formatChartValue(displayValue(p), cfg.numberFormat) : String(displayValue(p)));
  return {
    show: true,
    position,
    fontSize: cfg.fontSize || CHART_DEFAULTS.labelSize,
    color: cfg.color ? colorOr(theme, cfg.color, labelColor) : labelColor,
    formatter,
  };
}

/** Series main color (same source as writer; $key theme reference -> resolved to a concrete color). */
export function seriesColor(theme, s) {
  if (s.type === "line" || s.type === "area" || s.type === "radar") return colorOr(theme, s.lineColor, resolveColor(theme, s.color));
  return resolveColor(theme, s.color);
}

/** Official marker -> ECharts symbol (fill/border theme references resolved). */
export function markerSymbol(theme, marker, color) {
  if (!marker || marker === false) return { show: false };
  const cfg = typeof marker === "object" ? marker : {};
  const shape = { circle: "circle", rect: "rect", diamond: "diamond", triangle: "triangle" }[cfg.shape] || "circle";
  return {
    show: true,
    symbol: shape,
    symbolSize: cfg.size || CHART_DEFAULTS.markerSize,
    itemStyle: { color: colorOr(theme, cfg.fill, color), borderColor: resolveColor(theme, cfg.border?.color), borderWidth: cfg.border?.width },
  };
}

/** Chart top-level common option (font / tooltip trigger / no animation).
 * The font family name carries no inner quotes: SSR serialization (writer/chart/image.js)
 * inserts this string verbatim into a style="..." attribute, and inner double quotes cannot
 * be escaped there, producing invalid XML (which PowerPoint refuses to render); an unquoted
 * CSS family name (even with spaces) is equally valid, so canvas and svg parse it the same. */
export function baseOption(theme, el) {
  const fonts = resolveFont(theme, el.fontFamily || null);
  return {
    textStyle: { fontFamily: `${fonts.latin},${fonts.ea},sans-serif` },
    tooltip: { trigger: "axis" },
    animation: false,
  };
}

/** Legend ECharts projection (semantics in spec.legend: on/pos/size/color single source).
 * Full four-position mapping (top/bottom centered horizontally, left/right centered
 * vertically and stacked) — previously only a one-sided {pos:0} was written, so right
 * collapsed to a horizontal bar at the top, diverging from the export legendPos. */
export function legendState(theme, legend) {
  const { legendColor } = chartStyleColors(theme);
  const cfg = legend.cfg || {};
  const posOpt = legend.pos === "top" ? { top: 0, left: "center" }
    : legend.pos === "left" ? { left: 0, top: "middle", orient: "vertical" }
    : legend.pos === "right" ? { right: 0, top: "middle", orient: "vertical" }
    : { bottom: 0, left: "center" };
  const legendOpt = {
    show: legend.on,
    ...posOpt,
    textStyle: { color: cfg.color ? colorOr(theme, cfg.color, legendColor) : legendColor, fontSize: cfg.fontSize || CHART_DEFAULTS.legendSize },
    // Legend marker converges on the PowerPoint small-square look (previously a roundRect 14×8 rounded block, I25)
    icon: "rect", itemWidth: 10, itemHeight: 8,
  };
  return { legendOn: legend.on, legendOpt };
}

export { dashSpec, resolveColor };
