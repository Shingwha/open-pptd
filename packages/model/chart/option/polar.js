// packages/model/chart/option/polar.js — polar-coordinate option (pie / radar; pure functions).
// Pie radius/center project from the layout model; radar honors spokeAxis config.
// Shared by preview rendering and export rasterization (SSR); no DOM access.

import { resolveColor, colorOr, themeChartPalette } from "../../theme.js";
import { dashSpec } from "../../style-spec.js";
import { chartStyleColors, echartsLabel, markerSymbol, seriesColor } from "./shared.js";

export function buildPolar(ctx) {
  const { theme, el, series, cats, primary, common, layout } = ctx;
  if (primary === "pie") {
    const s = series[0];
    const inner = s.innerRadius || 0;
    const fills = Array.isArray(s.fill) ? s.fill : null;
    const pal = themeChartPalette(theme);
    return {
      ...common,
      tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
      series: [{
        type: "pie",
        // Radius/center projected by the layout model (inscribed in the manualLayout inner
        // rectangle) so the preview matches PowerPoint's automatic layout
        radius: [inner * 100 + "%", `${layout.pie.radiusPct}%`],
        center: [`${layout.pie.centerX}%`, `${layout.pie.centerY}%`],
        startAngle: 90 + (s.startAngle || 0), // official 0 = 12 o'clock; ECharts 90 = 3 o'clock
        avoidLabelOverlap: true,
        // PowerPoint puts doughnut labels inside the ring band by default (no dLblPos support;
        // the export omits the element), so the preview follows with inside — a light label is
        // only readable on the ring; a solid pie keeps outside + leader line (export outEnd)
        label: echartsLabel(theme, el, s, { position: inner > 0 ? "inside" : "outside", pie: true }),
        itemStyle: { borderColor: s.border?.color ? resolveColor(theme, s.border.color) : undefined, borderWidth: s.border?.width },
        data: cats.map((c, i) => ({
          name: c,
          value: s._values.value?.[i] ?? 0,
          // fill: an array cycles per point; a single color makes all points the same; unset = theme cycle
          itemStyle: { color: fills ? colorOr(theme, fills[i % fills.length], pal[i % 6]) : s.color || pal[i % 6] },
        })),
      }],
    };
  }
  if (primary === "radar") {
    const max = Math.max(1, ...series.flatMap((s) => s._values.y ?? []).filter((v) => v != null).map(Number));
    const spoke = el.spokeAxis && typeof el.spokeAxis === "object" ? el.spokeAxis : {};
    const { gridColor, labelColor } = chartStyleColors(theme);
    return {
      ...common,
      radar: {
        indicator: cats.map((c) => ({ name: c, max: spoke.max ?? Math.ceil(max * 1.2), min: spoke.min ?? 0 })),
        radius: `${layout.radar.radiusPct}%`,
        splitNumber: 4,
        axisName: { color: labelColor, fontSize: 11 },
        axisLine: { show: spoke.axisLine !== false, lineStyle: { color: spoke.axisLine && typeof spoke.axisLine === "object" && spoke.axisLine.color ? colorOr(theme, spoke.axisLine.color, gridColor) : gridColor, width: 1 } },
        splitLine: { show: spoke.gridLine !== false, lineStyle: { color: spoke.gridLine && typeof spoke.gridLine === "object" && spoke.gridLine.color ? colorOr(theme, spoke.gridLine.color, gridColor) : gridColor, width: 1 } },
        splitArea: { show: false },
      },
      series: [{
        type: "radar",
        data: series.map((s, i) => ({
          name: s.name,
          value: (s._values.y ?? []).map((v) => (v == null ? 0 : Number(v))),
          lineStyle: { color: seriesColor(theme, s), width: s.width ?? 2, type: dashSpec(s.lineStyle)?.cssBorder || "solid" },
          itemStyle: { color: seriesColor(theme, s) },
          symbol: s.marker ? markerSymbol(theme, s.marker, seriesColor(theme, s)).symbol : "none",
          areaStyle: s.areaColor ? { color: typeof s.areaColor === "string" ? colorOr(theme, s.areaColor, seriesColor(theme, s)) : seriesColor(theme, s) } : undefined,
          label: echartsLabel(theme, el, s, { position: "top" }),
        })),
      }],
    };
  }
  return null;
}
