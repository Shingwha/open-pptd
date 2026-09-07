// ============================================================================
// model/chart/layout.js — 图表布局语义单源（writer 导出与 renderer 预览共同投影）
// ----------------------------------------------------------------------------
// 绘图区布局模型（I19）：预览 ECharts grid 与导出 c:plotArea manualLayout 的
// 唯一几何定义处。此前预览固定网格、导出写 <c:layout/> 让 PowerPoint 自动布局，
// 两端绘图区几何各一套体系（01/02 页饼图/柱状图大小明显背离）。
// chartEx（waterfall/treemap/sunburst）平台无 plotArea 布局控制，plot 字段仅
// 经典图表导出消费；预览侧 waterfall 仍消费 grid。

import { CHART_DEFAULTS } from "./meta.js";
import { toAxisArray, resolveChartDirection } from "./axes.js";

/** 笛卡尔系基础边距（px）——绘图区布局模型的共同基底，轴标签拥挤估算
 * （option/axes.js）同样以此为基准。唯一定义处，option/shared.js 转 re-export。 */
export const CHART_GRID = { left: 48, right: 24, top: 28, bottom: 36 };

/** 让位系数（COM 截图校准的约定值，改动需 02/08 页双端对照回归）：
 * PowerPoint 在 manualLayout inner 矩形内给饼/雷达内接圆留的标签余量比例。 */
const PIE_FILL = 0.95;
const RADAR_FILL = 0.9;

/**
 * 绘图区布局单源（预览 grid 与导出 manualLayout 共同投影，唯一定义处）。
 * 输入 el.bounds（px；预览壳与 SSR 图片化、graphicFrame ext 三端同一尺寸口径）。
 * 输出：
 *   grid  — ECharts px 边距（预览与 SSR 共用；含标题 +24、竖排笛卡尔类目轴标题 +18 让位）
 *   plot  — chartSpace 0-1 分数矩形（writer 写 manualLayout layoutTarget=inner）
 *   pie/radar — ECharts %（radius 相对 min(w,h)/2，center 相对容器）
 * 让位条件与历史预览行为逐项对齐：标题让位全类型；类目轴标题让位仅竖排
 * bar/line/area/candlestick（scatter/bubble 数值 x 轴、waterfall/heatmap 走
 * chartEx 或矩阵家族，历史上不让位）；饼/雷达无轴标签，左右收窄为对称 24px。
 */
export function resolvePlotLayout(el, series) {
  const [, , bw0, bh0] = el.bounds || [];
  const W = Number(bw0) > 0 ? Number(bw0) : 640;
  const H = Number(bh0) > 0 ? Number(bh0) : 360;
  const primary = series[0]?.type || "";
  const types = new Set(series.map((s) => s.type));

  const titleText = typeof el.title === "string" ? el.title : el.title?.text || "";
  const legendDefaultOff = new Set(CHART_DEFAULTS.legendOffTypes);
  const legendOn = el.legend !== false && !(el.legend === undefined && [...types].every((t) => legendDefaultOff.has(t)));
  const legendPos = typeof el.legend === "object" && el.legend.position ? el.legend.position : "bottom";

  let xTitle = false;
  if (!["pie", "radar", "waterfall", "scatter", "bubble", "heatmap", "treemap", "sunburst", "sankey"].includes(primary)) {
    const horizontal = resolveChartDirection(el, series);
    if (!horizontal) {
      const xCfg = toAxisArray(el.xAxis)[0] || {};
      const xt = typeof xCfg.title === "string" ? xCfg.title : xCfg.title?.text;
      xTitle = !!xt;
    }
  }

  const polar = primary === "pie" || primary === "radar";
  const grid = polar
    ? { ...CHART_GRID, left: 24, top: CHART_GRID.top + (titleText ? 24 : 0) }
    : { ...CHART_GRID, top: CHART_GRID.top + (titleText ? 24 : 0), bottom: CHART_GRID.bottom + (xTitle ? 18 : 0) };

  const bw = Math.max(1, W - grid.left - grid.right);
  const bh = Math.max(1, H - grid.top - grid.bottom);
  const pct2 = (v) => Math.round(v * 100) / 100;
  const inscribed = (fill) => pct2(fill * Math.min(bw, bh) / Math.min(W, H) * 100);

  return {
    grid,
    plot: { x: grid.left / W, y: grid.top / H, w: bw / W, h: bh / H },
    pie: {
      radiusPct: inscribed(PIE_FILL),
      centerX: pct2((grid.left + bw / 2) / W * 100),
      centerY: pct2((grid.top + bh / 2) / H * 100),
    },
    radar: { radiusPct: inscribed(RADAR_FILL) },
    flags: { hasTitle: !!titleText, legendOn, legendPos, primary },
  };
}

/**
 * 柱状布局语义单源（writer 导出与 renderer 预览共同投影，唯一定义处）。
 * 规范表示 = OOXML 口径：类目节距 = n×柱宽 + (n-1)×|overlap|%柱宽（组内）+ gapWidth%柱宽（组间）。
 *   - barWidth → gapWidth=(1-bw)/bw×100（bw=1 即满槽）；categoryGap → ×750（校准约定，
 *     文档默认 0.2×750=150 恰与 OOXML schema 默认自洽）；未配置 → 150
 *   - barGap → overlap=-×100；堆叠/百分比堆叠 → overlap=100；未配置 → null（导出省略元素，
 *     PowerPoint 落 schema 默认 0，语义相同）
 * 渲染端投影：echarts.barWidthPct = 100/(n + gapWidth/100 + (n-1)×|overlap|/100)、
 * barGapPct = |overlap|（堆叠柱共用同一柱位，n 取 1）。预览必须显式传换算结果，
 * 禁止透传 undefined 让 ECharts 用自家默认（gap 30%/categoryGap 20%），否则分组柱
 * 总宽超出类目槽、溢出到相邻类目，预览与导出漂移。
 */
export function resolveBarLayout(chartEl, series) {
  const bars = series.filter((s) => s.type === "bar");
  const stacked = series.some((s) => s.stack && s.stack !== "percent" && (s.type === "bar" || s.type === "area"));
  const percent = series.some((s) => s.stack === "percent");
  const gapWidth = chartEl.barWidth != null
    ? Math.round((1 - chartEl.barWidth) / chartEl.barWidth * 100)
    : chartEl.categoryGap != null ? Math.round(chartEl.categoryGap * 750) : 150;
  const overlap = stacked || percent ? 100 : chartEl.barGap != null ? -Math.round(chartEl.barGap * 100) : null;
  const n = stacked || percent ? 1 : Math.max(1, bars.length);
  const barWidthPct = 100 / (n + gapWidth / 100 + ((n - 1) * Math.abs(overlap ?? 0)) / 100);
  return {
    gapWidth,
    overlap,
    hasGapWidthConfig: chartEl.barWidth != null || chartEl.categoryGap != null,
    stacked,
    percent,
    echarts: { barWidthPct, barGapPct: Math.abs(overlap ?? 0) },
  };
}
