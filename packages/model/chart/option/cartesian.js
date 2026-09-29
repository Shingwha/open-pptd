// ============================================================================
// model/chart/option/cartesian.js — cartesian-family option (bar/line/area/scatter/bubble/
// candlestick + waterfall simulated with two bars; pure functions)
// ----------------------------------------------------------------------------

import { resolveColor, colorOr } from "../../theme.js";
import { dashSpec } from "../../style-spec.js";
import { CHART_DEFAULTS } from "../meta.js";
import { resolveChartDirection, seriesAxisIndex, seriesChannels } from "../axes.js";
import { hexA, waterfallColorOf } from "../colors.js";
import { formatChartValue } from "../format.js";
import { resolveDataLabels } from "../labels.js";
import { cartesianAxes } from "./axes.js";
import { echartsLabel, markerSymbol, seriesColor } from "./shared.js";

/** waterfall: simulated with two stacked bars (transparent base + colored segment). The axes
 * go through the shared cartesianAxes (previously it assembled hard-coded axes and ignored the
 * xAxis/yAxis config — I28). */
function waterfallOption(ctx) {
  const { theme, el, series, cats, common } = ctx;
  const s = series[0];
  const rows = el.data?.rows || [];
  const isTotalCol = s._cols.isTotal;
  const vals = s._values.y ?? [];
  let base = 0;
  const data = rows.map((r, i) => {
    const isTotal = isTotalCol != null ? r[isTotalCol] === true : false;
    const y = Number(vals[i] ?? 0);
    const start = isTotal ? 0 : base;
    base = isTotal ? y : base + y;
    return { start, end: start + y, y, isTotal };
  });
  // Three-category color single source waterfallColorOf (same semantics in preview and chartEx export, including the default palette)
  const colorOf = (d) => waterfallColorOf(theme, s, d.isTotal, d.y);
  const label = echartsLabel(theme, el, s, { position: "top" });
  const barWidth = el.barWidth != null ? `${el.barWidth * 100}%` : undefined;
  const wfLabelCfg = resolveDataLabels(el, s, "waterfall");
  const catLabel = wfLabelCfg?.content === "category";
  const fmt = (p) => {
    if (catLabel) return p.name;
    const v = data[p.dataIndex].y;
    return wfLabelCfg?.numberFormat ? formatChartValue(v, wfLabelCfg.numberFormat) : String(v);
  };
  const axes = cartesianAxes(theme, el, cats, series, { horizontal: false });
  // Colored-segment label faces outward from the floating bar: an increase labels above the
  // top, a decrease below the bottom, matching the endpoint labels of a PowerPoint chartEx waterfall
  return {
    ...common,
    series: [
      // Two stacked bars: transparent base = min(start,end), colored segment = |y|, all
      // stacked as positive values. start cannot be used as the base: ECharts accumulates a
      // stack group on both sides by sign, so the colored segment of a negative delta would be
      // pushed below the zero axis and the waterfall bridge would degenerate into an ordinary
      // negative bar (a preview/export fork)
      { type: "bar", stack: "wf", silent: true, barWidth, data: data.map((d) => Math.min(d.start, d.end)), itemStyle: { color: "transparent" }, tooltip: { show: false } },
      {
        type: "bar", stack: "wf", barWidth,
        data: data.map((d) => ({ value: Math.abs(d.y), label: { position: d.y >= 0 ? "top" : "bottom" } })),
        itemStyle: { color: (p) => colorOf(data[p.dataIndex]) },
        label: label ? { ...label, formatter: fmt } : undefined,
      },
    ],
    xAxis: axes.xAxis,
    yAxis: axes.yAxis,
  };
}

/** Cartesian-family dispatch entry (returns an option on a hit, otherwise null). */
export function buildCartesian(ctx) {
  const { theme, el, series, cats, primary, common, barLayout, bubble } = ctx;
  if (primary === "waterfall") return waterfallOption(ctx);

  const known = ["bar", "line", "area", "scatter", "bubble", "candlestick"];
  if (!known.includes(primary)) return null;

  const stackedPercent = series.some((s) => s.stack === "percent");
  const horizontal = resolveChartDirection(el, series);
  const axes = cartesianAxes(theme, el, cats, series, { horizontal, percentMax: stackedPercent, scatter: primary === "scatter" || primary === "bubble" });
  // The bottom yield for a category-axis title is handled centrally by the layout model
  // resolvePlotLayout (already included in common.grid)

  if (primary === "scatter" || primary === "bubble") {
    return {
      ...common,
      tooltip: { trigger: "item", formatter: (p) => `${p.seriesName}<br/>x: ${p.value[0]}<br/>y: ${p.value[1]}${p.value[2] != null ? `<br/>size: ${p.value[2]}` : ""}` },
      xAxis: axes.xAxis,
      yAxis: axes.yAxis,
      series: series.map((s) => {
        const data = (s._values.x ?? []).map((xv, j) => {
          const pt = [Number(xv ?? 0), Number(s._values.y?.[j] ?? 0)];
          if (s.type === "bubble") pt.push(Number(s._values.size?.[j] ?? 0));
          return pt;
        });
        const m = markerSymbol(theme, s.marker ?? { shape: "circle" }, seriesColor(theme, s));
        // Bubble diameter comes from the same normalization as the export (spec.bubble.diameterFn; global extremes + sizeScale mapping)
        const sizeFn = s.type === "bubble" && bubble ? bubble.diameterFn(s) : null;
        return {
          type: "scatter",
          name: s.name,
          xAxisIndex: seriesAxisIndex(s, true),
          yAxisIndex: seriesAxisIndex(s, false),
          symbolSize: s.type === "bubble" ? (v) => sizeFn(v[2]) : (typeof m === "object" && m.symbolSize) || 10,
          itemStyle: { color: seriesColor(theme, s), borderColor: resolveColor(theme, s.border?.color), borderWidth: s.border?.width },
          label: echartsLabel(theme, el, s, { position: "top" }),
          data,
        };
      }),
    };
  }

  // bar / line / area / candlestick
  // Bar width / intra-group gap: projection from the spec.barLayout single source (same result as the writer export)
  const seriesOptions = series.map((s) => {
    const color = seriesColor(theme, s);
    // Value channel taken by direction (horizontal bar: values on x; otherwise: values on y) — same source as writer seriesChannels
    const chs = s.type === "bar" ? seriesChannels(s, horizontal) : null;
    const valVals = chs ? chs.val.vals : s._values.y;
    const data = (valVals ?? []).map((v) => (v == null ? null : Number(v)));
    const commonSer = {
      name: s.name,
      data,
      stack: s.stack === "percent" ? "total" : s.stack || undefined,
      itemStyle: { color },
      // Stacked-bar label sits inside (matching the PowerPoint stacked-chart default of inside; top would float to the top of the whole stack)
      label: echartsLabel(theme, el, s, { position: s.stack ? "inside" : "top" }),
      xAxisIndex: seriesAxisIndex(s, true),
      yAxisIndex: seriesAxisIndex(s, false),
    };
    if (s.type === "bar") {
      return {
        type: "bar",
        barWidth: `${barLayout.echarts.barWidthPct}%`,
        barGap: `${barLayout.echarts.barGapPct}%`,
        ...commonSer,
        itemStyle: { color, borderColor: resolveColor(theme, s.border?.color), borderWidth: s.border?.width },
      };
    }
    if (s.type === "line") {
      const label = echartsLabel(theme, el, s, { position: "top" });
      // symbol "none" is roughly showSymbol:false and ECharts then renders no data label; when a
      // label is configured but no marker is, use a 1px transparent dot to carry the label
      // (invisible when rendered, label position matches the export)
      const hasLabel = label != null;
      return {
        type: "line",
        smooth: !!s.smooth,
        symbol: s.marker ? markerSymbol(theme, s.marker, color).symbol : hasLabel ? "circle" : "none",
        ...(hasLabel && !s.marker ? { symbolSize: 1, itemStyle: { color: "transparent" } } : {}),
        lineStyle: { color, width: s.width ?? 2, type: dashSpec(s.lineStyle)?.cssBorder || "solid" },
        connectNulls: s.nullHandling === "connect", ...commonSer,
        label,
      };
    }
    if (s.type === "area") {
      return {
        type: "line", smooth: !!s.smooth, symbol: "none",
        lineStyle: { color, width: s.width ?? 2, type: dashSpec(s.lineStyle)?.cssBorder || "solid" },
        connectNulls: s.nullHandling === "connect",
        areaStyle: { color: s.areaColor || hexA(color, 0.22) },
        ...commonSer,
      };
    }
    if (s.type === "candlestick") {
      const open = s._values.open ?? null;
      const high = s._values.high ?? [];
      const low = s._values.low ?? [];
      const close = s._values.close ?? [];
      const up = s.upBars || {};
      const down = s.downBars || {};
      const cs = CHART_DEFAULTS.candlestick;
      return {
        ...commonSer,
        type: "candlestick",
        // Candlestick bar width goes through the resolveBarLayout projection (same default as
        // the writer stock gapWidth 150, converging the two sides — previously ECharts used
        // ~80% slot width while PPT used 40%)
        barWidth: `${barLayout.echarts.barWidthPct}%`,
        // Up/down default colors come from the same source as the export (CHART_DEFAULTS.candlestick, calibrated on chart46)
        itemStyle: {
          color: colorOr(theme, up.fill, cs.upFill),
          color0: colorOr(theme, down.fill, cs.downFill),
          borderColor: colorOr(theme, up.border?.color, cs.upBorder),
          borderColor0: colorOr(theme, down.border?.color, cs.downBorder),
        },
        data: high.map((hv, j) => {
          const o = open ? Number(open[j] ?? 0) : Number(close[j] ?? 0);
          return [o, Number(close[j] ?? 0), Number(low[j] ?? 0), Number(hv ?? 0)];
        }),
      };
    }
    return commonSer;
  });

  // Candlestick legend aligned with PowerPoint: a native stock chart expands one series into
  // open/high/low/close legend entries (the preview previously showed only the series name,
  // diverging from the export). Empty-data helper series carry the legend entries (they take
  // no part in interaction) while the real series are excluded via legend.data; high/low are
  // keyed with the up/down colors
  const csSeries = series.find((s) => s.type === "candlestick");
  let legendData = null;
  if (csSeries) {
    const cols = el.data?.cols || [];
    const channels = csSeries._cols.open != null ? ["open", "high", "low", "close"] : ["high", "low", "close"];
    const csUp = colorOr(theme, (csSeries.upBars || {}).fill, CHART_DEFAULTS.candlestick.upFill);
    const csDown = colorOr(theme, (csSeries.downBars || {}).fill, CHART_DEFAULTS.candlestick.downFill);
    const hiName = String(cols[csSeries._cols.high] ?? "最高");
    const loName = String(cols[csSeries._cols.low] ?? "最低");
    const helperNames = channels.map((ch) => String(cols[csSeries._cols[ch]] ?? ch));
    seriesOptions.push(...helperNames.map((name) => ({
      type: "line", name, data: [],
      silent: true, legendHoverLink: false, tooltip: { show: false }, emphasis: { disabled: true },
      lineStyle: { opacity: 0 },
      itemStyle: { color: name === hiName ? csUp : name === loName ? csDown : "#9ca3af" },
    })));
    legendData = [...helperNames, ...series.filter((s) => s.type !== "candlestick").map((s) => s.name)];
  }

  return {
    ...common,
    xAxis: axes.xAxis,
    yAxis: axes.yAxis,
    series: seriesOptions,
    ...(legendData ? { legend: { ...common.legend, data: legendData } } : {}),
  };
}
