// packages/model/chart/spec.js — chart effective semantics single source (resolveChartSpec).
// Chart element -> fully resolved config: normalized series, title, legend, layout, bubble
// sizes and every other default. The preview (option/) and export (writer/) only do dialect
// conversion and hold no semantics of their own. Pure functions; consumers go through the
// model/chart.js barrel.

import { resolveChartSeries } from "./resolve.js";
import { resolvePlotLayout, resolveBarLayout } from "./layout.js";
import { resolveTitleLike, resolveLegend } from "./title-legend.js";

/** Chart element -> effective config spec. */
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
 * Bubble size effective semantics:
 *   - glo/ghi: global extremes across all bubble series (normalizing each series separately
 *     would break cross-series size comparability)
 *   - diameterFn(s): raw value -> target diameter px (the preview symbolSize)
 *   - writes: the value written on export, 100×(d/dmax)², in bubble series order
 *     (PowerPoint diameter ∝ √size with sizeRepresents=area; raw values in data coordinates
 *     make bubbles huge and overlapping)
 *   - bubbleScale: solved from the largest target bubble vs the plot-area short side
 *     (calibration: scale=100 -> largest diameter ≈ 0.51×short side; >150 hits the platform
 *     clamp at 0.83)
 * Pure function: it does not rewrite the series normalization result.
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
