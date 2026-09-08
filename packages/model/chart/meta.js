// ============================================================================
// model/chart/meta.js — 13 类型注册表与官方默认值（渲染器与 writer 共享，唯一实现）
// ----------------------------------------------------------------------------
// 对齐官方（references/pptd.md §Chart 1009-1500 行）：
//   - 13 种系列类型，无顶层 type；pie.innerRadius > 0 = 环形（官方无 doughnut 类型）
//   - 类型共存约束（§5.4）由 CHART_META.coexist 表达，validateChartSeries（resolve.js）消费
//   - encode 语义键别名表供类型切换重映射（remapEncode，编辑器/属性面板共用）
// ============================================================================

/**
 * 13 类型注册表（官方字段集 + 约束 + 导出路由）。
 * encode: 官方 encode 字段（? 结尾 = 可选）；coexist: 允许共存的类型集合；
 * route: 导出路由单源——classic（c:chartSpace）/ chartex（cx: 扩展，PPT 2016+）/
 * image（无原生类型，SSR 矢量图）。预览不区分；writer 派生类型表、编号口径、
 * mc 包装判定全部消费此处，禁止再各写一份类型清单。
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

/** 图表元素 → 导出路由（'classic' | 'chartex' | 'image'；非图表/未知类型 null）。
 * 编号口径唯一定义：classic/chartex 产出 chart part 消耗编号，image 不消耗。 */
export function chartRouteOf(el) {
  if (!el || el.elementType !== "chart") return null;
  const t = el.series?.[0]?.type;
  return CHART_META[t]?.route || null;
}

export const CHART_TYPE_ORDER = Object.keys(CHART_META);

/** 单系列独占类型（系列数组只能有 1 个元素；§5.4，validateChartSeries 消费）。 */
export const SOLO_TYPES = new Set(["pie", "waterfall", "heatmap", "treemap", "sunburst", "sankey", "radar"]);

// —— 预览/导出共享默认值（单源；字号单位 pt，导出 sz = pt×100，预览 px 与 pt 1:1）——
// 此前三类文字的默认字号两端各写一份且已漂移（标签 10/9、轴 11/9、图例 11/9）。
export const CHART_DEFAULTS = {
  labelSize: 9,  // dataLabels 字号
  axisSize: 9,   // 坐标轴刻度文字
  legendSize: 9, // 图例文字
  titleSize: 14, // 图表标题（官方 string | TitleConfig 缺省 14pt）
  markerSize: 8, // 预览 marker symbolSize 缺省（导出端未配置不写 c:size，落平台默认）
  // K 线涨跌缺省（对照 PowerPoint/Excel 原生：up=白底灰边 / down=黑底灰边，chart46 校准；
  // 此前预览 color0/borderColor 写 #000000 系，与导出两端不一致）
  candlestick: { upFill: "#FFFFFF", upBorder: "#666666", downFill: "#404040", downBorder: "#666666" },
  // 这些类型默认不显示图例（legend 未配置时）
  legendOffTypes: ["waterfall", "treemap", "sunburst", "sankey", "heatmap"],
};

/** encode 语义键别名表（类型切换时保留已有列引用，自动对齐默认列名）。 */
const SEMANTIC_KEYS = {
  x: ["x", "category", "date"],
  y: ["y", "value"],
  category: ["category", "x"],
  value: ["value", "y"],
  size: ["size"], high: ["high"], low: ["low"], close: ["close"], open: ["open"],
  isTotal: ["isTotal"], parent: ["parent"], source: ["source"], target: ["target"], flow: ["flow"],
};

/**
 * 按目标类型元数据重映射 encode（图表编辑器/属性面板共用）：
 * 旧列的语义别名命中则保留引用，否则回退目标类型默认列名。
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
