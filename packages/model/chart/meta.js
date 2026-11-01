// packages/model/chart/meta.js — 13-type registry, official defaults and encode remapping.
// 13 series types with no top-level type; pie.innerRadius > 0 means doughnut. Coexist
// constraints live here (consumed by validateChartSeries) and encode aliases feed type-switch
// remapping. route is the sole export-route source: classic / chartex / image.
// To add a type: register here, confirm the encode channel in resolve.js, add an option
// builder under model/chart/option/, add the writer route shard and an editor panel field.

/**
 * 13-type registry (official field set + constraints + export route).
 * encode: official encode fields (trailing ? = optional); coexist: set of types allowed
 * to coexist; route: single source for the export route — classic (c:chartSpace) /
 * chartex (cx: extension, PPT 2016+) / image (no native type, SSR vector image).
 * Preview does not distinguish; the writer's derived type table, numbering convention
 * and mc-wrapping decision all consume this, so no second type list may be written.
 */
export const CHART_META = {
  bar: { label: "柱状图", route: "classic", encode: { x: "x", y: "y" }, axes: "cartesian", coexist: ["bar", "line", "area", "scatter", "bubble", "candlestick"] },
  line: { label: "折线图", route: "classic", encode: { x: "x", y: "y" }, axes: "cartesian", coexist: ["bar", "line", "area", "scatter", "bubble", "candlestick"] },
  area: { label: "面积图", route: "classic", encode: { x: "x", y: "y" }, axes: "cartesian", coexist: ["bar", "line", "area", "scatter", "bubble", "candlestick"] },
  scatter: { label: "散点图", route: "classic", encode: { x: "x", y: "y" }, axes: "cartesian", coexist: ["bar", "line", "area", "scatter", "bubble"] },
  bubble: { label: "气泡图", route: "classic", encode: { x: "x", y: "y", size: "size" }, axes: "cartesian", coexist: ["bar", "line", "area", "scatter", "bubble"] },
  candlestick: { label: "股价图", route: "classic", encode: { x: "x", high: "high", low: "low", close: "close", open: "open?" }, axes: "cartesian", coexist: ["candlestick", "bar", "line", "area"] },
  pie: { label: "饼图", route: "classic", encode: { category: "category", value: "value" }, axes: "none", coexist: ["pie"] },
  radar: { label: "雷达图", route: "classic", encode: { category: "category", y: "y" }, axes: "radar", coexist: ["radar"] },
  waterfall: { label: "瀑布图", route: "chartex", encode: { x: "x", y: "y", isTotal: "isTotal?" }, axes: "cartesian", coexist: ["waterfall"] },
  heatmap: { label: "热力图", route: "image", encode: { x: "x", y: "y", value: "value" }, axes: "cartesian", coexist: ["heatmap"] },
  treemap: { label: "矩形树图", route: "chartex", encode: { category: "category", value: "value", parent: "parent?" }, axes: "none", coexist: ["treemap"] },
  sunburst: { label: "旭日图", route: "chartex", encode: { category: "category", value: "value", parent: "parent?" }, axes: "none", coexist: ["sunburst"] },
  sankey: { label: "桑基图", route: "image", encode: { source: "source", target: "target", flow: "flow" }, axes: "none", coexist: ["sankey"] },
};

/** Chart element -> export route ('classic' | 'chartex' | 'image'; null for non-chart/unknown types).
 * Sole definition of the numbering convention: classic/chartex produce chart parts that
 * consume numbers, image consumes none. */
export function chartRouteOf(el) {
  if (!el || el.elementType !== "chart") return null;
  const t = el.series?.[0]?.type;
  return CHART_META[t]?.route || null;
}

export const CHART_TYPE_ORDER = Object.keys(CHART_META);

/** Single-series-exclusive types (the series array may hold only 1 element; consumed by validateChartSeries). */
export const SOLO_TYPES = new Set(["pie", "waterfall", "heatmap", "treemap", "sunburst", "sankey", "radar"]);

// Shared preview/export defaults (font size in pt; export sz = pt×100, preview px 1:1 with pt).
export const CHART_DEFAULTS = {
  labelSize: 9,  // dataLabels font size
  axisSize: 9,   // axis tick labels
  legendSize: 9, // legend text
  titleSize: 14, // chart title (official string | TitleConfig default 14pt)
  markerSize: 8, // preview marker symbolSize default (export writes no c:size when unset, falling back to the platform default)
  // Candlestick up/down defaults (matching native PowerPoint/Excel: up = white fill gray
  // border / down = black fill gray border; calibrated against a reference PowerPoint chart)
  candlestick: { upFill: "#FFFFFF", upBorder: "#666666", downFill: "#404040", downBorder: "#666666" },
  // These types hide the legend by default (when legend is not configured)
  legendOffTypes: ["waterfall", "treemap", "sunburst", "sankey", "heatmap"],
};

/** encode semantic-key alias table (keeps existing column references when switching type, aligning to the default column names). */
const SEMANTIC_KEYS = {
  x: ["x", "category", "date"],
  y: ["y", "value"],
  category: ["category", "x"],
  value: ["value", "y"],
  size: ["size"], high: ["high"], low: ["low"], close: ["close"], open: ["open"],
  isTotal: ["isTotal"], parent: ["parent"], source: ["source"], target: ["target"], flow: ["flow"],
};

/**
 * Remap encode by target-type metadata (shared by the chart editor and the property panel):
 * if an old column hits one of the semantic aliases its reference is kept, otherwise it
 * falls back to the target type's default column name.
 */
export function remapEncode(oldEncode, meta) {
  const out = {};
  for (const key of Object.keys(meta.encode)) {
    const cand = SEMANTIC_KEYS[key] || [key];
    const hit = cand.map((k) => oldEncode[k]).find((v) => v != null);
    out[key] = hit ?? meta.encode[key];
  }
  return out;
}
