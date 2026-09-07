// ============================================================================
// model/chart/layout.js — 柱状布局语义单源（writer 导出与 renderer 预览共同投影）
// ----------------------------------------------------------------------------

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
