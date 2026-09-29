// ============================================================================
// model/chart.js — chart model public entry (barrel; shared by renderer and writer, single implementation)
// ----------------------------------------------------------------------------
// Split by domain (chart/ directory; this file only re-exports, the public export
// surface is unchanged from before the split):
//   chart/meta.js    13-type registry, official defaults, encode remapping
//   chart/resolve.js normalization (seriesDefaults merge / encode lookup / default color / coexistence validation)
//   chart/layout.js  layout-semantics single source (bar barWidth/barGap + plot resolvePlotLayout -> OOXML + ECharts projection)
//   chart/axes.js    axis config normalization, direction detection, series axis index and data channels
//   chart/colors.js  color lookup and derivation (theme color cycle / HEX8 / HSL.L hierarchy derivation / HEX parsing)
//   chart/labels.js  data label resolution (§3.3 chain)
//   chart/data.js    ChartData table utilities (xlsx embed, numeric column detection, column letters)
//   chart/tree.js    treemap/sunburst parent-child table -> tree parsing (preview nesting and export leaf path share it)
//   chart/format.js  sole numberFormat interpreter (preview/SSR; vocabulary anchor)
//   chart/title-legend.js effective title/legend config (string|Config -> single form)
//   chart/spec.js    chart effective-semantics single source resolveChartSpec (preview/export common projection)
// Register new exports in the matching domain module and list them here; consumers
// always import this file, never a chart/ internals path.
// ============================================================================

export { CHART_META, CHART_TYPE_ORDER, CHART_DEFAULTS, remapEncode, chartRouteOf } from "./chart/meta.js";
export { validateChartSeries, mergeSeriesDefault, resolveChartSeries } from "./chart/resolve.js";
export { resolveBarLayout, resolvePlotLayout } from "./chart/layout.js";
export { toAxisArray, inferAxisType, resolveChartDirection, seriesAxisIndex, seriesChannels } from "./chart/axes.js";
export { hexA, darkenByLightness, hierarchyColor, parseHexColor, luminanceOf, labelColorOn, waterfallColorOf } from "./chart/colors.js";
export { DATA_LABEL_CONTENTS, resolveDataLabels } from "./chart/labels.js";
export { chartDataTable, isNumericColumn, colLetter } from "./chart/data.js";
export { parseHierarchy, resolveTreeLevels } from "./chart/tree.js";
export { NUMBER_FORMAT_CODES, formatChartValue } from "./chart/format.js";
export { resolveTitleLike, resolveLegend } from "./chart/title-legend.js";
export { resolveChartSpec } from "./chart/spec.js";
