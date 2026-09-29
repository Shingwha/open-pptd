// ============================================================================
// model/chart/layout.js — chart layout semantics single source (writer export and renderer preview both project from it)
// ----------------------------------------------------------------------------
// Plot-area layout model (I19): the only place the geometry of the preview ECharts
// grid and the export c:plotArea manualLayout is defined. Previously the preview used
// a fixed grid while the export wrote <c:layout/> to let PowerPoint lay out
// automatically, so the two sides used unrelated plot-area geometry (page 01/02 pie
// and bar charts clearly diverged in size).
// chartEx (waterfall/treemap/sunburst) has no platform plotArea layout control, so the
// plot field is consumed by classic chart export only; on the preview side waterfall
// still consumes grid.

import { toAxisArray, resolveChartDirection } from "./axes.js";
import { resolveTitleLike, resolveLegend } from "./title-legend.js";

/** Cartesian base margins (px) — the common basis of the plot-area layout model, also
 * used as the reference by the axis-label crowding estimate (option/axes.js). Single
 * definition; option/shared.js re-exports it. */
export const CHART_GRID = { left: 48, right: 24, top: 28, bottom: 36 };

/** Yield coefficients (convention values calibrated on COM screenshots; changing them
 * requires a page 02/08 cross-side regression):
 * the label margin ratio PowerPoint leaves inside the manualLayout inner rectangle for
 * the pie/radar inscribed circle. */
const PIE_FILL = 0.95;
const RADAR_FILL = 0.9;

/**
 * Plot-area layout single source (the preview grid and the export manualLayout both
 * project from it; single definition).
 * Input el.bounds (px; the preview shell, SSR rasterization and graphicFrame ext all use
 * the same size convention). chrome: the pre-resolved effective title/legend config
 * (passed by resolveChartSpec to avoid re-parsing); when called directly (legacy path)
 * it is resolved internally.
 * Output:
 *   grid  — ECharts px margins (shared by preview and SSR; includes +24 for a title and
 *           +18 yield for a vertical cartesian category-axis title)
 *   plot  — chartSpace 0-1 fractional rectangle (writer writes manualLayout layoutTarget=inner)
 *   pie/radar — ECharts % (radius relative to min(w,h)/2, center relative to the container)
 * The yield conditions match the historical preview behavior item by item: title yield for
 * all types; category-axis-title yield only for vertical bar/line/area/candlestick
 * (scatter/bubble use a numeric x axis, waterfall/heatmap go through chartEx or the matrix
 * family and historically do not yield); pie/radar have no axis labels, their left/right
 * margins narrow symmetrically to 24px.
 */
export function resolvePlotLayout(el, series, chrome = null) {
  const [, , bw0, bh0] = el.bounds || [];
  const W = Number(bw0) > 0 ? Number(bw0) : 640;
  const H = Number(bh0) > 0 ? Number(bh0) : 360;
  const primary = series[0]?.type || "";
  const types = new Set(series.map((s) => s.type));

  const titleText = chrome ? chrome.titleText : resolveTitleLike(el.title).text;
  const legend = chrome ? chrome.legend : resolveLegend(el, types);
  const legendOn = legend.on;
  const legendPos = legend.pos;

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
  // treemap/sunburst have no axes and no legend (off by default), so PPT fills the whole
  // space below the title/legend bands (I26: previously the ECharts treemap defaulted to
  // 80% width/height centered, leaving margins in the preview while PPT filled the space)
  const treeLike = primary === "treemap" || primary === "sunburst";
  // heatmap: the colorbar occupies a right band (40 with colorbar / 24 without); a
  // historical calibration value that stands on its own (previously this grid was
  // hard-coded in option/matrix.js, bypassing the layout model)
  const heatmapGrid = primary === "heatmap"
    ? { left: 48, right: series[0]?.colorbar !== false ? 40 : 24, top: 16, bottom: 36 }
    : null;
  const grid = treeLike
    ? {
        left: 2, right: 2,
        top: titleText ? CHART_GRID.top + 24 : 4,
        bottom: legendOn && legendPos === "bottom" ? 40 : 4,
      }
    : heatmapGrid
      ? heatmapGrid
      : polar
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
 * Bar layout semantics single source (writer export and renderer preview both project
 * from it; single definition).
 * Canonical form = the OOXML convention: category pitch = n×barWidth + (n-1)×|overlap|%
 * barWidth (within group) + gapWidth% barWidth (between groups).
 *   - barWidth -> gapWidth=(1-bw)/bw×100 (bw=1 means a full slot); categoryGap -> ×750
 *     (calibration convention; the doc default 0.2×750=150 is exactly consistent with the
 *     OOXML schema default); unset -> 150
 *   - barGap -> overlap=-×100; stacked/percent-stacked -> overlap=100; unset -> null (the
 *     export omits the element and PowerPoint falls back to the schema default 0, same semantics)
 * Render-side projection: echarts.barWidthPct = 100/(n + gapWidth/100 + (n-1)×|overlap|/100),
 * barGapPct = |overlap| (stacked bars share one slot, n = 1). The preview must pass the
 * converted result explicitly; passing undefined through would let ECharts use its own
 * defaults (gap 30% / categoryGap 20%), making grouped bars exceed the category slot and
 * overflow into neighboring categories, drifting from the export.
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
