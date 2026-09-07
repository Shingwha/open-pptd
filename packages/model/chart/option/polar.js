// ============================================================================
// model/chart/option/polar.js — 极坐标系 option（pie / radar；纯函数）
// ----------------------------------------------------------------------------

import { resolveColor } from "../../theme.js";
import { dashSpec } from "../../style-spec.js";
import { themeChartPalette } from "../../theme.js";
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
        // 半径/中心由布局模型投影（manualLayout inner 矩形内接），此前写死
        // 72%/center 46% 与 PowerPoint 自动布局背离（02 页 PPT 饼显著更大）
        radius: [inner * 100 + "%", `${layout.pie.radiusPct}%`],
        center: [`${layout.pie.centerX}%`, `${layout.pie.centerY}%`],
        startAngle: 90 + (s.startAngle || 0), // 官方 0 = 12 点；ECharts 90 = 3 点
        avoidLabelOverlap: true,
        label: echartsLabel(theme, el, s, { position: "outside", pie: true }),
        itemStyle: { borderColor: s.border?.color ? resolveColor(theme, s.border.color) : undefined, borderWidth: s.border?.width },
        data: cats.map((c, i) => ({
          name: c,
          value: s._values.value?.[i] ?? 0,
          // 官方 fill：数组按点循环；单色 = 所有点同色；缺省 = 主题色循环
          itemStyle: { color: fills ? resolveColor(theme, fills[i % fills.length]) || pal[i % 6] : s.color || pal[i % 6] },
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
        axisLine: { show: spoke.axisLine !== false, lineStyle: { color: spoke.axisLine && typeof spoke.axisLine === "object" && spoke.axisLine.color ? resolveColor(theme, spoke.axisLine.color) || gridColor : gridColor, width: 1 } },
        splitLine: { show: spoke.gridLine !== false, lineStyle: { color: spoke.gridLine && typeof spoke.gridLine === "object" && spoke.gridLine.color ? resolveColor(theme, spoke.gridLine.color) || gridColor : gridColor, width: 1 } },
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
          areaStyle: s.areaColor ? { color: typeof s.areaColor === "string" ? resolveColor(theme, s.areaColor) || seriesColor(theme, s) : seriesColor(theme, s) } : undefined,
          label: echartsLabel(theme, el, s, { position: "top" }),
        })),
      }],
    };
  }
  return null;
}
