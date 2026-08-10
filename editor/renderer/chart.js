// ============================================================================
// renderer/chart.js — 图表预览（ECharts，数据模型来自 core/chart.js）
// ============================================================================

import * as echarts from "../vendor/echarts.mjs";
import { resolveChartSeries, CHART_META, shouldShowDataLabels, DEFAULT_CHART_PALETTE } from "../core/chart.js";
import { resolveColor, resolveFont } from "../core/theme.js";

const AXIS_TEXT = { color: "#6b7280", fontSize: 11 };

/** 主题图表样式（网格/轴/文字色跟随主题 colors 键，缺省用内置默认）。 */
function chartStyleColors(theme) {
  return {
    labelColor: resolveColor(theme, theme.colors?.text) || "#1f2937",
    axisColor: resolveColor(theme, theme.colors?.line) || "#d8dce1",
    gridColor: resolveColor(theme, theme.colors?.line) || "#f0f2f5",
    legendColor: resolveColor(theme, theme.colors?.text) || "#1f2937",
  };
}

export function buildChartOption(theme, el) {
  const { series, cats, valuesBySeries } = resolveChartSeries(theme, el);
  // 图表字体：官方 Chart.fontFamily（C3 对齐），缺省 = 官方默认字体
  const fonts = resolveFont(theme, null);
  const { labelColor, axisColor, gridColor, legendColor } = chartStyleColors(theme);

  const base = {
    color: series.map((s) => s.color),
    textStyle: { fontFamily: `"${fonts.latin}","${fonts.ea}",sans-serif` },
    legend: series.length > 1
      ? { bottom: 0, textStyle: { color: legendColor, fontSize: 11 }, icon: "roundRect", itemWidth: 14, itemHeight: 8 }
      : undefined,
    tooltip: { trigger: series.length > 1 || series[0]?.type !== "pie" && series[0]?.type !== "doughnut" ? "axis" : "item" },
  };

  const types = new Set(series.map((s) => s.type));
  const primary = series[0]?.type;

  // 无数据
  if (!series.length || cats.length === 0) {
    return { ...base, title: { text: "（暂无数据）", left: "center", top: "middle", textStyle: { color: "#9ca3af", fontSize: 13, fontWeight: "normal" } } };
  }

  if (primary === "pie" || primary === "doughnut") {
    const s = series[0];
    const inner = primary === "doughnut" ? 0.55 : 0;
    const showLabels = shouldShowDataLabels(el, primary);
    return {
      ...base,
      tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
      legend: { bottom: 0, textStyle: { color: legendColor, fontSize: 11 } },
      series: [{
        type: "pie",
        radius: [inner, "72%"],
        center: ["50%", "46%"],
        avoidLabelOverlap: true,
        // 标签：分类名 + 百分比
        label: {
          show: showLabels,
          formatter: "{b} {d}%",
          fontSize: 10,
          color: labelColor,
          lineHeight: 14,
        },
        data: cats.map((c, i) => ({ name: c, value: valuesBySeries[0][i] ?? 0 })),
      }],
    };
  }

  if (primary === "scatter") {
    const xData = cats.map((c) => Number(c)); // cats 来自 encode.x（数值列）
    return {
      ...base,
      tooltip: { trigger: "item", formatter: (p) => `x: ${p.value[0]}<br/>y: ${p.value[1]}` },
      grid: { left: 48, right: 24, top: 24, bottom: 36 },
      xAxis: { type: "value", axisLine: { lineStyle: { color: axisColor } }, splitLine: { lineStyle: { color: gridColor } }, axisLabel: AXIS_TEXT },
      yAxis: { type: "value", axisLine: { lineStyle: { color: axisColor } }, splitLine: { lineStyle: { color: gridColor } }, axisLabel: AXIS_TEXT },
      series: series.map((sr, i) => ({
        type: "scatter",
        name: sr.name,
        symbolSize: 10,
        itemStyle: { color: sr.color },
        label: shouldShowDataLabels(el, "scatter")
          ? { show: true, position: "top", fontSize: 10, color: labelColor }
          : undefined,
        data: xData.map((xv, j) => [xv, Number(valuesBySeries[i][j] ?? 0)]),
      })),
    };
  }

  if (primary === "radar") {
    return {
      ...base,
      tooltip: { trigger: "item" },
      radar: {
        indicator: cats.map((c) => ({ name: c, max: radarMax(valuesBySeries) })),
        radius: "62%",
        // 减少网格环数 + 细浅网格线，避免"线条太密"
        splitNumber: 4,
        axisName: { color: labelColor, fontSize: 11 },
        axisLine: { lineStyle: { color: gridColor, width: 1 } },
        splitLine: { lineStyle: { color: gridColor, width: 1 } },
        splitArea: { show: false },
      },
      series: [{
        type: "radar",
        data: series.map((s, i) => ({
          name: s.name,
          value: valuesBySeries[i].map((v) => v ?? 0),
          lineStyle: { color: s.color, width: 2.5 },
          itemStyle: { color: s.color },
          label: shouldShowDataLabels(el, "radar")
            ? { show: true, fontSize: 10, color: labelColor }
            : undefined,
          // 单系列带面积填充（跟随主题色、半透明），多系列只画线避免互相遮挡
          areaStyle: series.length === 1 ? { color: hexA(s.color, 0.22) } : undefined,
        })),
      }],
    };
  }

  // cartesian: bar / line / area
  const isStacked = series.some((s) => s.stack);
  const stackedPercent = series.some((s) => s.stack === "percent");
  const horizontal = series[0]?.encode && series[0]._catCol >= 0 && primary === "bar" && false;

  return {
    ...base,
    grid: { left: 48, right: 24, top: 28, bottom: 36 },
    xAxis: {
      type: "category",
      data: cats,
      axisLine: { lineStyle: { color: axisColor } },
      axisLabel: AXIS_TEXT,
    },
    yAxis: {
      type: "value",
      axisLine: { show: false },
      splitLine: { lineStyle: { color: gridColor } },
      axisLabel: AXIS_TEXT,
      ...(stackedPercent ? { max: 100, axisLabel: { ...AXIS_TEXT, formatter: "{value}%" } } : {}),
    },
    series: series.map((s, i) => ({
      type: s.type === "area" ? "line" : s.type,
      name: s.name,
      data: valuesBySeries[i].map((v) => (v == null ? null : Number(v))),
      smooth: s.smooth || s.type === "line" || false,
      stack: s.stack === "percent" ? "total" : s.stack || undefined,
      areaStyle: s.type === "area" ? { color: hexA(s.color, 0.22) } : undefined,
      itemStyle: { color: s.color },
      label: shouldShowDataLabels(el, s.type)
        ? { show: true, position: "top", fontSize: 10, color: labelColor }
        : undefined,
      lineStyle: s.type === "line" || s.type === "area" ? { color: s.color, width: 2.5 } : undefined,
      symbol: s.type === "line" || s.type === "area" ? "circle" : undefined,
      symbolSize: 6,
      barGap: "10%",
    })),
  };
}

function radarMax(valuesBySeries) {
  let max = 0;
  for (const arr of valuesBySeries) for (const v of arr) if (v != null) max = Math.max(max, Number(v));
  return max > 0 ? Math.ceil(max * 1.2) : 100;
}

function hexA(hex, alpha) {
  const h = String(hex || "#888888").replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** 图表元素 → 定位 DOM（ECharts 实例）。 */
export function renderChart(theme, el) {
  const [x, y, w, h] = el.bounds;
  const box = document.createElement("div");
  box.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;background:#fff;`;
  box.dataset.elementId = el.elementId;
  box.dataset.elementType = "chart";
  box.dataset.chartEl = "1";
  if (el.opacity != null) box.style.opacity = el.opacity;
  const option = buildChartOption(theme, el);
  const chart = echarts.init(box, null, { renderer: "canvas" });
  chart.setOption(option, true);
  box._chartInstance = chart;
  return box;
}

/** 页面重渲染前释放图表实例。 */
export function disposeChartInstances(container) {
  for (const node of container.querySelectorAll("[data-chart-el]")) {
    const inst = echarts.getInstanceByDom(node);
    if (inst) inst.dispose();
  }
}
