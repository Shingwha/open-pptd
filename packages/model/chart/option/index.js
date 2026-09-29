// ============================================================================
// model/chart/option/index.js — chart spec -> ECharts option (preview dialect projection, pure functions)
// ----------------------------------------------------------------------------
// The spec single source is chart/spec.js (resolveChartSpec: normalized series/title/
// legend/layout/bubble); this directory projects the spec into an ECharts option and
// makes no semantic decisions. Dispatch is by axis family: polar (pie/radar) /
// cartesian (bar/line/area/scatter/bubble/candlestick/waterfall) / matrix
// (heatmap/treemap/sunburst/sankey). Shared by preview rendering (renderer/chart.js)
// and export rasterization (writer SSR); every official default comes from the spec result.
// ============================================================================

import { resolveChartSpec } from "../spec.js";
import { resolveColor, resolveFont } from "../../theme.js";
import { baseOption, legendState } from "./shared.js";
import { buildPolar } from "./polar.js";
import { buildCartesian } from "./cartesian.js";
import { buildMatrix } from "./matrix.js";

/** Chart element -> ECharts option (convenience entry; reuse the spec when re-rendering the same element). */
export function buildChartOption(theme, el) {
  return buildOptionFromSpec(resolveChartSpec(theme, el));
}

/** spec -> ECharts option. */
export function buildOptionFromSpec(spec) {
  const { theme, el, series, cats, types, primary, title, legend, layout, bubble } = spec;

  const base = baseOption(theme, el);

  // Title projection (style semantics in spec.title; top-centered, color defaults to the theme text color)
  if (title.text) {
    const fonts = resolveFont(theme, title.fontFamily);
    const titleColor = (title.color ? resolveColor(theme, title.color) : null)
      || resolveColor(theme, theme.colors?.text) || "#1f2937";
    base.title = {
      text: title.text,
      left: "center", top: 0,
      textStyle: { color: titleColor, fontSize: title.size, fontFamily: `${fonts.latin},${fonts.ea},sans-serif` },
    };
  }

  if (!series.length || (cats.length === 0 && primary !== "sankey")) {
    return { ...base, title: base.title || { text: "（暂无数据）", left: "center", top: "middle", textStyle: { color: "#9ca3af", fontSize: 13, fontWeight: "normal" } } };
  }

  // Legend projection (legendState only converts position/style for ECharts; semantics live in spec.legend)
  const { legendOpt } = legendState(theme, legend);
  const common = {
    ...base,
    legend: legendOpt,
    grid: layout.grid,
    tooltip: { trigger: types.some((t) => ["pie", "radar", "treemap", "sunburst", "sankey"].includes(t)) ? "item" : "axis" },
  };

  const ctx = { theme, el, series, cats, types, primary, common, layout, barLayout: spec.barLayout, bubble };
  const built = buildPolar(ctx) ?? buildMatrix(ctx) ?? buildCartesian(ctx);
  // Single-source contract: preview / render screenshots / front-end image export all
  // assume "no animation, the first frame is the final frame". A top-level animation:false
  // does not cover every series — the ECharts treemap defaultOption hard-codes
  // animation:true, so new labels fade in via ChartView._animateLabels opacity 0->1 and a
  // synchronous capture (screenshot / canvas.toDataURL) catches transparent text. Hence the
  // per-series fallback, instead of relying on each type's defaultOption defaults.
  for (const s of built?.series || []) s.animation = false;
  return built;
}
