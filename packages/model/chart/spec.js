// ============================================================================
// model/chart/spec.js — 图表有效语义单源（resolveChartSpec）
// ----------------------------------------------------------------------------
// 图表元素 → 完全解析的「有效配置」：归一化系列、标题、图例、布局、气泡尺寸
// 等全部默认值在此落定。预览（option/ 投影 ECharts）与导出（writer/ 投影
// OOXML）只做方言转换、不再自持语义——此前标题抽取 7 处、图例开关 3+1 处、
// 方位映射 3 处（chartex 缺省 t vs classic b 真实分叉）、气泡归一化两份且
// writer 直接变异 model 归一化结果（s._values.size）。
// 纯函数；消费方一律经 model/chart.js barrel。
// ============================================================================

import { resolveChartSeries } from "./resolve.js";
import { resolvePlotLayout, resolveBarLayout } from "./layout.js";
import { resolveTitleLike, resolveLegend } from "./title-legend.js";

/** 图表元素 → 有效配置 spec。 */
export function resolveChartSpec(theme, el) {
  const { series, cats, warn } = resolveChartSeries(theme, el);
  const types = [...new Set(series.map((s) => s.type))];
  const title = resolveTitleLike(el.title, { fallbackFontFamily: el.fontFamily || null });
  const legend = resolveLegend(el, types);
  const layout = resolvePlotLayout(el, series, { titleText: title.text, legend });
  return {
    theme,
    el,
    series,
    cats,
    warn,
    types,
    primary: types[0] || "",
    title,
    legend,
    layout,
    barLayout: resolveBarLayout(el, series),
    bubble: resolveBubbleLayout(el, series, layout),
  };
}

/**
 * 气泡尺寸有效语义（I22 单源）：
 *   - glo/ghi：全 chart 气泡系列全局极值（系列各自归一会破坏跨系列大小可比性）
 *   - diameterFn(s)：原始值 → 目标直径 px（预览 symbolSize 直接消费）
 *   - writes：导出写值 100×(d/dmax)²，按 bubble 系列序对齐（PowerPoint 直径 ∝
 *     √size、sizeRepresents=area；原始值直进数据坐标气泡会巨大互相覆盖）
 *   - bubbleScale：由目标最大泡占绘图区短边比反解（标定：scale=100 → 最大泡
 *     直径 ≈ 0.51×短边，>150 触发平台截断 0.83）
 * 纯函数：不改写系列归一化结果（此前 writer 直接改 s._values.size）。
 */
function resolveBubbleLayout(chartEl, series, layout) {
  const bubbleSeries = series.filter((s) => s.type === "bubble");
  if (!bubbleSeries.length) return null;
  const allSizes = bubbleSeries.flatMap((s) => (s._values.size || []).filter((v) => v != null).map(Number)).filter(Number.isFinite);
  const glo = Math.min(0, ...allSizes);
  const ghi = Math.max(1, ...allSizes);
  const span = ghi - glo || 1;
  const tOf = (v, scale) =>
    scale === "linear" ? (v - glo) / span
    : scale === "log" ? Math.log1p((v - glo) * 10) / Math.log1p(span * 10)
    : Math.sqrt((v - glo) / span);
  const diameterFn = (s) => {
    const [minR, maxR] = s.sizeRange || [6, 48];
    const scale = s.sizeScale || "sqrt";
    return (v) => (v == null || !Number.isFinite(Number(v))) ? null : minR + tOf(Number(v), scale) * (maxR - minR);
  };
  let dMax = 0;
  const diameters = bubbleSeries.map((s) => (s._values.size || []).map(diameterFn(s)));
  for (const ds of diameters) for (const d of ds) if (d != null && d > dMax) dMax = d;
  const writes = diameters.map((ds) => ds.map((d) => (d == null ? null : Math.round(100 * (d / dMax) * (d / dMax) * 1000) / 1000)));
  const [, , PW, PH] = chartEl.bounds;
  const plotMinDim = Math.max(1, Math.min(layout.plot.w * PW, layout.plot.h * PH));
  const bubbleScale = Math.round(Math.min(150, Math.max(20, (dMax / plotMinDim) * 156)));
  return { glo, ghi, diameterFn, writes, bubbleScale };
}
