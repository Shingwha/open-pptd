// ============================================================================
// renderer/chart.js — 图表预览（ECharts，数据模型来自 core/chart.js）
// ----------------------------------------------------------------------------
// C3 对齐官方：13 类型全部原生支持（ECharts）；与 writer 同源消费
// resolveChartSeries 归一化输出；官方默认值（dataLabels 默认关、barGap 0、
// pie startAngle 0 = 12 点、treemap 子节点 HSL.L -10 等）与导出一致。
// ============================================================================

import * as echarts from "../vendor/echarts.mjs";
import { resolveChartSeries, CHART_META, resolveDataLabels, DEFAULT_CHART_PALETTE, hexA, darkenByLightness } from "../core/chart.js";
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

/** 官方 dataLabels → ECharts label 配置。 */
function echartsLabel(theme, el, s, { position = "top", pie = false } = {}) {
  const cfg = resolveDataLabels(el, s, s.type);
  if (!cfg) return undefined;
  const { labelColor } = chartStyleColors(theme);
  let formatter;
  if (cfg.content === "percentage") formatter = pie ? "{d}%" : (p) => `${(p.percent ?? 0).toFixed(1)}%`;
  else if (cfg.content === "category") formatter = pie ? "{b}" : (p) => p.name;
  else formatter = (p) => (cfg.numberFormat ? fmtNum(p.value, cfg.numberFormat) : String(p.value));
  return { show: true, position, fontSize: 10, color: labelColor, formatter };
}

function fmtNum(v, format) {
  const n = Number(v);
  if (Number.isNaN(n)) return String(v ?? "");
  if (format === "0%") return `${Math.round(n * 100)}%`;
  if (format === "0.0%") return `${(n * 100).toFixed(1)}%`;
  if (format === "0.0") return n.toFixed(1);
  if (format === "0.0E+00") return n.toExponential(1);
  if (format === "#,##0") return n.toLocaleString("en-US");
  return String(Math.round(n));
}

/** 系列主体色（与 writer 同源）。 */
function seriesColor(s) {
  if (s.type === "line" || s.type === "area" || s.type === "radar") return s.lineColor || s.color;
  return s.color;
}

/** 官方 marker → ECharts symbol。 */
function markerSymbol(marker, color) {
  if (!marker || marker === false) return { show: false };
  const cfg = typeof marker === "object" ? marker : {};
  const shape = { circle: "circle", rect: "rect", diamond: "diamond", triangle: "triangle" }[cfg.shape] || "circle";
  return {
    show: true,
    symbol: shape,
    symbolSize: cfg.size || 8,
    itemStyle: { color: cfg.fill || color, borderColor: cfg.border?.color, borderWidth: cfg.border?.width },
  };
}

/** 图表数据 → ECharts 笛卡尔轴配置。 */
function cartesianAxes(el, cats, { horizontal = false, percentMax = false } = {}) {
  const { axisColor, gridColor } = chartStyleColors(el._theme);
  const xAxisCfg = el.xAxis;
  const yAxisCfg = el.yAxis;
  const mkAxis = (cfg, def) => {
    if (cfg === false) return { show: false };
    const o = typeof cfg === "object" ? cfg : {};
    return {
      type: o.type || def.type,
      min: o.min,
      max: o.max,
      inverse: o.reverse,
      name: typeof o.title === "string" ? o.title : o.title?.text,
      axisLine: { show: o.axisLine !== false, lineStyle: { color: axisColor } },
      axisLabel: o.label === false ? { show: false } : { ...AXIS_TEXT, ...(typeof o.label === "object" ? { color: o.label.color, fontSize: o.label.fontSize, formatter: o.label.numberFormat ? (v) => fmtNum(v, o.label.numberFormat) : undefined } : {}) },
      splitLine: o.gridLine === false ? { show: false } : { lineStyle: { color: gridColor, type: typeof o.gridLine === "object" ? (o.gridLine.style === "dash" ? "dashed" : o.gridLine.style === "dot" ? "dotted" : "solid") : "solid" } },
    };
  };
  const xAxis = horizontal
    ? mkAxis(xAxisCfg, { type: "value" })
    : { type: "category", data: cats, axisLine: { lineStyle: { color: axisColor } }, axisLabel: AXIS_TEXT };
  const yAxis = horizontal
    ? { type: "category", data: cats, axisLine: { lineStyle: { color: axisColor } }, axisLabel: AXIS_TEXT }
    : { ...mkAxis(yAxisCfg, { type: "value" }), ...(percentMax ? { max: 100, axisLabel: { ...AXIS_TEXT, formatter: "{value}%" } } : {}) };
  return { xAxis, yAxis };
}

/** 构建图表 option。 */
export function buildChartOption(theme, el) {
  el._theme = theme;
  const { series, cats, warn } = resolveChartSeries(theme, el);
  const fonts = resolveFont(theme, null);
  const { labelColor, legendColor } = chartStyleColors(theme);

  const base = {
    textStyle: { fontFamily: `"${fonts.latin}","${fonts.ea}",sans-serif` },
    tooltip: { trigger: "axis" },
    animation: false,
  };

  if (!series.length || cats.length === 0) {
    return { ...base, title: { text: "（暂无数据）", left: "center", top: "middle", textStyle: { color: "#9ca3af", fontSize: 13, fontWeight: "normal" } } };
  }

  const types = new Set(series.map((s) => s.type));
  const primary = series[0].type;

  // 图例（官方默认：waterfall/treemap/sunburst/sankey/heatmap 关，其余开）
  const legendDefaultOff = new Set(["waterfall", "treemap", "sunburst", "sankey", "heatmap"]);
  const legendOn = el.legend !== false && !(el.legend === undefined && [...types].every((t) => legendDefaultOff.has(t)));
  const legendPos = typeof el.legend === "object" && el.legend.position ? el.legend.position : "bottom";
  const legendOpt = {
    show: legendOn,
    ...(legendPos !== "bottom" ? { [legendPos]: 0 } : { bottom: 0 }),
    textStyle: { color: legendColor, fontSize: 11 },
    icon: "roundRect", itemWidth: 14, itemHeight: 8,
  };

  const grid = { left: 48, right: 24, top: 28, bottom: 36 };
  const common = { ...base, legend: legendOpt, grid, tooltip: { trigger: [...types].some((t) => ["pie", "radar"].includes(t)) ? "item" : "axis" } };

  if (primary === "pie") {
    const s = series[0];
    const inner = s.innerRadius || 0;
    const fills = Array.isArray(s.fill) ? s.fill : null;
    return {
      ...common,
      tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
      series: [{
        type: "pie",
        radius: [inner * 100 + "%", "72%"],
        center: ["50%", "46%"],
        startAngle: 90 + (s.startAngle || 0), // 官方 0 = 12 点；ECharts 90 = 3 点
        avoidLabelOverlap: true,
        label: echartsLabel(theme, el, s, { position: "outside", pie: true }),
        data: cats.map((c, i) => ({
          name: c,
          value: s._values.value?.[i] ?? 0,
          itemStyle: { color: fills ? fills[i % fills.length] : DEFAULT_CHART_PALETTE[i % DEFAULT_CHART_PALETTE.length] },
        })),
      }],
    };
  }

  if (primary === "radar") {
    const s0 = series[0];
    const max = Math.max(1, ...series.flatMap((s) => s._values.y ?? []).filter((v) => v != null).map(Number));
    const min = s0._theme?.spokeAxis?.min ?? 0;
    const spoke = el.spokeAxis && typeof el.spokeAxis === "object" ? el.spokeAxis : {};
    const { gridColor } = chartStyleColors(theme);
    return {
      ...common,
      radar: {
        indicator: cats.map((c) => ({ name: c, max: spoke.max ?? Math.ceil(max * 1.2) })),
        radius: "62%",
        splitNumber: 4,
        axisName: { color: labelColor, fontSize: 11 },
        axisLine: { show: spoke.axisLine !== false, lineStyle: { color: gridColor, width: 1 } },
        splitLine: { show: spoke.gridLine !== false, lineStyle: { color: gridColor, width: 1 } },
        splitArea: { show: false },
      },
      series: [{
        type: "radar",
        data: series.map((s, i) => ({
          name: s.name,
          value: (s._values.y ?? []).map((v) => (v == null ? 0 : Number(v))),
          lineStyle: { color: seriesColor(s), width: s.width ?? 2, type: s.lineStyle === "dash" ? "dashed" : s.lineStyle === "dot" ? "dotted" : "solid" },
          itemStyle: { color: seriesColor(s) },
          symbol: s.marker ? markerSymbol(s.marker, seriesColor(s)).symbol : "none",
          areaStyle: s.areaColor ? { color: typeof s.areaColor === "string" ? s.areaColor : seriesColor(s) } : undefined,
          label: echartsLabel(theme, el, s, { position: "top" }),
        })),
      }],
    };
  }

  // cartesian 系：bar/line/area/scatter/bubble/candlestick
  const stackedPercent = series.some((s) => s.stack === "percent");
  const isStacked = series.some((s) => s.stack && s.stack !== "percent");
  const horizontal = false; // 官方：xAxis.type==="category" 竖排；yAxis.type==="category" 横排（C3 细化）
  const axes = cartesianAxes(el, cats, { horizontal, percentMax: stackedPercent });

  if (primary === "scatter" || primary === "bubble") {
    return {
      ...common,
      tooltip: { trigger: "item", formatter: (p) => `${p.seriesName}<br/>x: ${p.value[0]}<br/>y: ${p.value[1]}${p.value[2] != null ? `<br/>size: ${p.value[2]}` : ""}` },
      xAxis: { type: "value", axisLine: { lineStyle: { color: axes.xAxis.axisLine.lineStyle.color } }, splitLine: { lineStyle: { color: axes.xAxis.splitLine.lineStyle.color } }, axisLabel: AXIS_TEXT },
      yAxis: { type: "value", axisLine: { lineStyle: { color: axes.yAxis.axisLine.lineStyle.color } }, splitLine: { lineStyle: { color: axes.yAxis.splitLine.lineStyle.color } }, axisLabel: AXIS_TEXT },
      series: series.map((s) => {
        const data = (s._values.x ?? []).map((xv, j) => {
          const pt = [Number(xv ?? 0), Number(s._values.y?.[j] ?? 0)];
          if (s.type === "bubble") pt.push(Number(s._values.size?.[j] ?? 0));
          return pt;
        });
        const m = markerSymbol(s.marker ?? { shape: "circle" }, seriesColor(s));
        return {
          type: "scatter",
          name: s.name,
          symbolSize: s.type === "bubble" ? undefined : (typeof m === "object" && m.symbolSize) || 10,
          itemStyle: { color: seriesColor(s), borderColor: s.border?.color, borderWidth: s.border?.width },
          label: echartsLabel(theme, el, s, { position: "top" }),
          data,
        };
      }),
    };
  }

  // bar / line / area / candlestick
  const seriesOptions = series.map((s, i) => {
    const color = seriesColor(s);
    const data = (s._values.y ?? []).map((v) => (v == null ? null : Number(v)));
    const commonSer = {
      name: s.name,
      data,
      stack: s.stack === "percent" ? "total" : s.stack || undefined,
      itemStyle: { color },
      label: echartsLabel(theme, el, s, { position: "top" }),
    };
    if (s.type === "bar") {
      return { type: "bar", barGap: el.barGap ?? 0, ...commonSer, itemStyle: { color, borderColor: s.border?.color, borderWidth: s.border?.width } };
    }
    if (s.type === "line") {
      return {
        type: "line", smooth: !!s.smooth, symbol: s.marker ? markerSymbol(s.marker, color).symbol : "none",
        lineStyle: { color, width: s.width ?? 2, type: s.lineStyle === "dash" ? "dashed" : s.lineStyle === "dot" ? "dotted" : "solid" },
        connectNulls: s.nullHandling === "connect", ...commonSer,
      };
    }
    if (s.type === "area") {
      return {
        type: "line", smooth: !!s.smooth, symbol: "none",
        lineStyle: { color, width: s.width ?? 2, type: s.lineStyle === "dash" ? "dashed" : s.lineStyle === "dot" ? "dotted" : "solid" },
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
      return {
        type: "candlestick",
        itemStyle: {
          color: up.fill || "#FFFFFF",
          color0: down.fill || "#000000",
          borderColor: up.border?.color || "#000000",
          borderColor0: down.border?.color || "#000000",
        },
        data: high.map((hv, j) => {
          const o = open ? Number(open[j] ?? 0) : Number(close[j] ?? 0);
          return [o, Number(close[j] ?? 0), Number(low[j] ?? 0), Number(hv ?? 0)];
        }),
      };
    }
    return commonSer;
  });

  return { ...common, xAxis: axes.xAxis, yAxis: axes.yAxis, series: seriesOptions };
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
