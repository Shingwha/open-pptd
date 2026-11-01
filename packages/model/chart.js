// packages/model/chart.js — chart model public entry (barrel shared by renderer and writer).
// Domain modules under chart/: meta (type registry/defaults/encode remap), resolve
// (normalization/validation), layout (plot + bar semantics), axes, colors, labels, data,
// tree, format (numberFormat), title-legend, spec (effective semantics).
// Register new exports in the matching module and list them here; consumers always import
// this file, never a chart/ internals path.

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
