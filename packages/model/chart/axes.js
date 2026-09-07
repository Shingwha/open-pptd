// ============================================================================
// model/chart/axes.js — 轴配置归一化与方向/通道解析（writer/renderer 共享）
// ----------------------------------------------------------------------------
// 对齐官方 §Chart 方向规则 + §5.3 轴数组规则：次轴永远放在数值轴一侧——
// 垂直图用 series.yAxisIndex，水平图用 series.xAxisIndex。
// ============================================================================

/** 轴配置归一化：AxisConfig | AxisConfig[] → AxisConfig[]（省略 = [{}]，官方 §通用规则 5）。 */
export function toAxisArray(cfg) {
  if (cfg == null) return [{}];
  const arr = Array.isArray(cfg) ? cfg : [cfg];
  return arr.map((c) => (c && typeof c === "object" ? c : {}));
}

/** 列类型推断（官方：字符串列 → category，全数值列 → value）。 */
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

/** bar/waterfall 方向判定：y 轴为分类轴且 x 轴非分类轴 → 水平（resolveChartSeries 与 resolveChartDirection 共用）。 */
function isHorizontalChart(el, data, encode) {
  const xs = toAxisArray(el.xAxis);
  const ys = toAxisArray(el.yAxis);
  const xType = xs[0]?.type ?? inferAxisType(data, encode?.x);
  const yType = ys[0]?.type ?? inferAxisType(data, encode?.y);
  return yType === "category" && xType !== "category";
}

/**
 * 图表方向（官方 §Chart 方向规则）：bar/waterfall 由轴类型决定——
 * xAxis.type==="category"（显式或按数据推断）→ 垂直；yAxis.type==="category" → 水平。
 * 其余类型（line/area/scatter/bubble/candlestick/heatmap/radar…）恒垂直。
 * @returns {boolean} true = 水平（barDir=bar）
 */
export function resolveChartDirection(el, series) {
  const s = series.find((x) => x && (x.type === "bar" || x.type === "waterfall"));
  if (!s) return false;
  return isHorizontalChart(el, el.data, s.encode);
}

/** 供 resolve.js（resolveChartSeries 的水平柱分类通道判定）复用。 */
export { isHorizontalChart };

/**
 * 系列轴索引（官方 §5.3）：次轴永远放在数值轴一侧——
 * 垂直图用 series.yAxisIndex，水平图用 series.xAxisIndex。
 * 返回轴索引（0 = 主轴；≥1 = 第 N 个次轴，需 xAxis/yAxis 数组长度 ≥ index+1）。
 */
export function seriesAxisIndex(s, horizontal) {
  const idx = horizontal ? s.xAxisIndex : s.yAxisIndex;
  return Number.isFinite(idx) && idx > 0 ? Math.floor(idx) : 0;
}

/**
 * 系列数据通道按方向重映射（barDir=bar 时分类通道在 y、数值通道在 x）：
 * @returns {{cat: {col, vals}, val: {col, vals}}} 或 null（无分类通道）
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
