// ============================================================================
// core/chart.js — 图表模型归一化（渲染器与 writer 共享，唯一实现）
// ----------------------------------------------------------------------------
// 第一版教训：seriesDefaults merge 在渲染与导出各写一份 → 预览与导出不一致。
// 这里只实现一次：resolveChartSeries() 输出归一化系列，ECharts 与 OOXML 都消费它。
// ============================================================================



/** 图表默认系列色板（官方色循环 C3 对齐前使用；主题 colors 不再承载系列色）。 */
export const DEFAULT_CHART_PALETTE = [
  "#002E5D", "#3A6EA5", "#7FB2D9", "#C9A227",
  "#B5503C", "#5C8A6A", "#7B6BA8", "#8A8F98",
];

export const CHART_META = {
  bar: { label: "柱状图", axes: "cartesian", encode: { x: "x", y: "y" } },
  line: { label: "折线图", axes: "cartesian", encode: { x: "x", y: "y" } },
  area: { label: "面积图", axes: "cartesian", encode: { x: "x", y: "y" } },
  pie: { label: "饼图", axes: "none", encode: { category: "x", value: "y" } },
  doughnut: { label: "环形图", axes: "none", encode: { category: "x", value: "y" } },
  scatter: { label: "散点图", axes: "bothValue", encode: { x: "x", y: "y" } },
  radar: { label: "雷达图", axes: "radar", encode: { category: "x", y: "y" } },
};

export const CHART_TYPE_ORDER = ["bar", "line", "area", "pie", "doughnut", "scatter", "radar"];

/** seriesDefaults + series[i] 浅合并：标量覆盖；对象浅合并；数组整体替换。type/encode 不来自 defaults。 */
export function mergeSeriesDefault(defaults, series) {
  if (!defaults) return { ...series };
  const out = { ...defaults, ...series };
  for (const key of Object.keys(defaults)) {
    const dv = defaults[key];
    const sv = series[key];
    if (dv && typeof dv === "object" && !Array.isArray(dv) && sv && typeof sv === "object" && !Array.isArray(sv)) {
      out[key] = { ...dv, ...sv };
    }
  }
  return out;
}

function colIndex(data, name) {
  return (data.cols || []).indexOf(name);
}

/**
 * 归一化图表：合并 seriesDefaults、补充 encode/name/颜色。
 * @returns {{series: Array, cats: Array, valuesBySeries: Array<Array>}}
 *  cats: 分类列值；valuesBySeries: 每系列数值数组（与 series 对齐）。
 */
export function resolveChartSeries(theme, el) {
  const data = el.data || { cols: [], rows: [] };
  const seriesDefaults = el.seriesDefaults || {};
  const palette = DEFAULT_CHART_PALETTE;
  const series = [];
  const valuesBySeries = [];

  (el.series || []).forEach((s, i) => {
    const type = s.type;
    const meta = CHART_META[type];
    if (!meta) {
      console.warn(`[chart] 不支持的图表类型 ${type}`);
      return;
    }
    const merged = mergeSeriesDefault(seriesDefaults[type], s);
    const encode = { ...meta.encode, ...(merged.encode || {}) };

    const catCol = encode.category != null ? colIndex(data, encode.category)
      : encode.x != null ? colIndex(data, encode.x) : 0;
    const valCol = encode.value != null ? colIndex(data, encode.value)
      : encode.y != null ? colIndex(data, encode.y) : -1;

    const name = merged.name || (valCol >= 0 ? data.cols[valCol] : `系列${i + 1}`);
    const color = merged.fill || palette[i % palette.length];

    const cats = [];
    const values = [];
    for (const row of data.rows || []) {
      if (catCol >= 0) cats.push(String(row[catCol] ?? ""));
      values.push(row[valCol] ?? null);
    }

    series.push({
      ...merged,
      type,
      name,
      encode,
      color,
      _catCol: catCol,
      _valCol: valCol,
    });
    valuesBySeries.push(values);
  });

  // 分类（取第一个有 cat 的系列）
  let cats = [];
  for (const s of series) {
    const catCol = s._catCol;
    if (catCol >= 0) {
      cats = (data.rows || []).map((row) => String(row[catCol] ?? ""));
      break;
    }
  }

  return { series, cats, valuesBySeries, data };
}

/** 图表数据 → xlsx 表格布局（行：表头 + 数据）。 */
export function chartDataTable(el) {
  const data = el.data || { cols: [], rows: [] };
  const cols = data.cols || [];
  const table = [cols.slice()];
  for (const row of data.rows || []) {
    table.push(cols.map((_, i) => row[i] ?? null));
  }
  return table;
}

/**
 * 是否显示数据标签（预览 ECharts label 与导出 c:dLbls 共用）。
 * 元素显式 dataLabels 优先；缺省时柱/饼/环/雷达/散点/线/面积默认开启。
 */
export function shouldShowDataLabels(el, type) {
  if (el && el.dataLabels != null) return !!el.dataLabels;
  return true;
}

/** 判断某列是否为数值列（供数据编辑器与导出用）。 */
export function isNumericColumn(table, colIdx) {
  for (let r = 1; r < table.length; r++) {
    const v = table[r][colIdx];
    if (v != null && v !== "") return typeof v === "number" || !isNaN(Number(v));
  }
  return true;
}
