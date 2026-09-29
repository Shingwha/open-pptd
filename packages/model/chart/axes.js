// ============================================================================
// model/chart/axes.js — axis config normalization and direction/channel resolution (shared by writer/renderer)
// ----------------------------------------------------------------------------
// Aligned with official §Chart direction rules + §5.3 axis-array rules: a secondary
// axis always sits on the value-axis side — vertical charts use series.yAxisIndex,
// horizontal charts use series.xAxisIndex.
// ============================================================================

/** Axis config normalization: AxisConfig | AxisConfig[] -> AxisConfig[] (omitted = [{}], official §general rules 5). */
export function toAxisArray(cfg) {
  if (cfg == null) return [{}];
  const arr = Array.isArray(cfg) ? cfg : [cfg];
  return arr.map((c) => (c && typeof c === "object" ? c : {}));
}

/** Column type inference (official: string column -> category, all-numeric column -> value). */
export function inferAxisType(data, colName) {
  const ci = (data?.cols || []).indexOf(colName);
  if (ci < 0) return "category";
  for (const r of data?.rows || []) {
    const v = r?.[ci];
    if (v == null || v === "") continue;
    if (typeof v !== "number" && Number.isNaN(Number(v))) return "category";
  }
  return "value";
}

/** bar/waterfall direction test: y axis is a category axis and x axis is not -> horizontal (shared by resolveChartSeries and resolveChartDirection). */
function isHorizontalChart(el, data, encode) {
  const xs = toAxisArray(el.xAxis);
  const ys = toAxisArray(el.yAxis);
  const xType = xs[0]?.type ?? inferAxisType(data, encode?.x);
  const yType = ys[0]?.type ?? inferAxisType(data, encode?.y);
  return yType === "category" && xType !== "category";
}

/**
 * Chart direction (official §Chart direction rules): bar/waterfall is decided by axis
 * types — xAxis.type==="category" (explicit or inferred from data) -> vertical;
 * yAxis.type==="category" -> horizontal. All other types
 * (line/area/scatter/bubble/candlestick/heatmap/radar…) are always vertical.
 * @returns {boolean} true = horizontal (barDir=bar)
 */
export function resolveChartDirection(el, series) {
  const s = series.find((x) => x && (x.type === "bar" || x.type === "waterfall"));
  if (!s) return false;
  return isHorizontalChart(el, el.data, s.encode);
}

/** Reused by resolve.js (the horizontal-bar category-channel test in resolveChartSeries). */
export { isHorizontalChart };

/**
 * Series axis index (official §5.3): a secondary axis always sits on the value-axis
 * side — vertical charts use series.yAxisIndex, horizontal charts use series.xAxisIndex.
 * Returns the axis index (0 = primary axis; ≥1 = the Nth secondary axis, which requires
 * the xAxis/yAxis array length to be ≥ index+1).
 */
export function seriesAxisIndex(s, horizontal) {
  const idx = horizontal ? s.xAxisIndex : s.yAxisIndex;
  return Number.isFinite(idx) && idx > 0 ? Math.floor(idx) : 0;
}

/**
 * Remap series data channels by direction (with barDir=bar the category channel is on y
 * and the value channel on x):
 * @returns {{cat: {col, vals}, val: {col, vals}}} or null (no category channel)
 */
export function seriesChannels(s, horizontal) {
  if (horizontal) {
    if (s._cols.y == null || s._cols.x == null) return null;
    return { cat: { col: s._cols.y, vals: s._values.y }, val: { col: s._cols.x, vals: s._values.x } };
  }
  const catCol = s._cols.category ?? s._cols.x;
  const valCol = s._cols.y ?? s._cols.value;
  if (catCol == null || valCol == null) return null;
  return { cat: { col: catCol, vals: s._cats }, val: { col: valCol, vals: s._values.y ?? s._values.value } };
}
