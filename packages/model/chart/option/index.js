// ============================================================================
// model/chart/option/index.js — 图表数据 → ECharts option（单源编排，纯函数无 DOM）
// ----------------------------------------------------------------------------
// 预览渲染（renderer/chart.js）与导出图片化（writer SSR，规划中）共享同一份
// option 组装。按轴系家族分派：polar（pie/radar）/ cartesian（bar/line/area/
// scatter/bubble/candlestick/waterfall）/ matrix（heatmap/treemap/sunburst/sankey）。
// 官方默认值（dataLabels 默认关、图例默认表、startAngle 0 = 12 点、treemap 子节点
// HSL.L -10 等）与 writer 导出一致。
// ============================================================================

import { resolveChartSeries } from "../resolve.js";
import { baseOption, legendState, CHART_GRID } from "./shared.js";
import { buildPolar } from "./polar.js";
import { buildCartesian } from "./cartesian.js";
import { buildMatrix } from "./matrix.js";

/** 图表元素 → ECharts option。 */
export function buildChartOption(theme, el) {
  const { series, cats } = resolveChartSeries(theme, el);

  const base = baseOption(theme, el);

  if (!series.length || (cats.length === 0 && series[0]?.type !== "sankey")) {
    return { ...base, title: { text: "（暂无数据）", left: "center", top: "middle", textStyle: { color: "#9ca3af", fontSize: 13, fontWeight: "normal" } } };
  }

  const types = new Set(series.map((s) => s.type));
  const primary = series[0].type;

  // 图例（官方默认：waterfall/treemap/sunburst/sankey/heatmap 关，其余开；样式消费）
  const { legendOpt } = legendState(theme, el, types);
  const common = {
    ...base,
    legend: legendOpt,
    grid: CHART_GRID,
    tooltip: { trigger: [...types].some((t) => ["pie", "radar", "treemap", "sunburst", "sankey"].includes(t)) ? "item" : "axis" },
  };

  const ctx = { theme, el, series, cats, types, primary, common };
  return buildPolar(ctx) ?? buildMatrix(ctx) ?? buildCartesian(ctx);
}
