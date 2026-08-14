// ============================================================================
// renderer/chart.js — 图表预览（ECharts，数据模型来自 core/chart.js）
// ----------------------------------------------------------------------------
// C3 对齐官方：13 类型全部原生支持（ECharts）；与 writer 同源消费
// resolveChartSeries 归一化输出 + resolveChartDirection（横向柱）/ seriesAxisIndex
// （多轴）/ hierarchyColor（层级色）；官方默认值（dataLabels 默认关、barGap 0、
// pie startAngle 0 = 12 点、treemap 子节点 HSL.L -10 等）与导出一致。
// ============================================================================

import * as echarts from "../vendor/echarts.mjs";
import {
  resolveChartSeries, CHART_META, resolveDataLabels, hexA,
  darkenByLightness, toAxisArray, resolveChartDirection, seriesAxisIndex, hierarchyColor, seriesChannels,
} from "../core/chart.js";
import { resolveColor, resolveFont, themeChartPalette } from "../core/theme.js";
import { createElementShell } from "./shell.js";

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

/** 官方 dataLabels → ECharts label 配置（含样式 color/fontSize）。 */
function echartsLabel(theme, el, s, { position = "top", pie = false } = {}) {
  const cfg = resolveDataLabels(el, s, s.type);
  if (!cfg) return undefined;
  const { labelColor } = chartStyleColors(theme);
  let formatter;
  if (cfg.content === "percentage") formatter = pie ? "{d}%" : (p) => `${(p.percent ?? 0).toFixed(1)}%`;
  else if (cfg.content === "category") formatter = pie ? "{b}" : (p) => p.name;
  else formatter = (p) => (cfg.numberFormat ? fmtNum(p.value, cfg.numberFormat) : String(p.value));
  return {
    show: true,
    position,
    fontSize: cfg.fontSize || 10,
    color: cfg.color ? resolveColor(theme, cfg.color) || labelColor : labelColor,
    formatter,
  };
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

/** 系列主体色（与 writer 同源；$key 主题引用 → 解析为具体色）。 */
function seriesColor(theme, s) {
  if (s.type === "line" || s.type === "area" || s.type === "radar") return resolveColor(theme, s.lineColor) || resolveColor(theme, s.color);
  return resolveColor(theme, s.color);
}

/** 官方 marker → ECharts symbol（fill/border 主题引用解析）。 */
function markerSymbol(theme, marker, color) {
  if (!marker || marker === false) return { show: false };
  const cfg = typeof marker === "object" ? marker : {};
  const shape = { circle: "circle", rect: "rect", diamond: "diamond", triangle: "triangle" }[cfg.shape] || "circle";
  return {
    show: true,
    symbol: shape,
    symbolSize: cfg.size || 8,
    itemStyle: { color: resolveColor(theme, cfg.fill) || color, borderColor: resolveColor(theme, cfg.border?.color), borderWidth: cfg.border?.width },
  };
}

/** 图表框渐变 → CSS linear-gradient。 */
function gradientCss(theme, fill) {
  if (fill?.type !== "gradient" || !Array.isArray(fill.stops) || fill.stops.length < 2) return null;
  const stops = fill.stops
    .map((s) => `${resolveColor(theme, s.color) || "#888"} ${Math.round((s.position ?? 0) * 100)}%`)
    .join(", ");
  const angle = fill.angle ?? 0;
  return `linear-gradient(${angle}deg, ${stops})`;
}

/** 图表框（官方 Chart.fill/border/shadow → 容器样式，与 writer chartSpace spPr 对应）。 */
function frameStyle(theme, el) {
  const st = {};
  if (el.fill) {
    if (typeof el.fill === "string") st.background = resolveColor(theme, el.fill) || "#ffffff";
    else if (el.fill.type === "gradient") st.background = gradientCss(theme, el.fill) || "#ffffff";
  }
  if (el.border) {
    st.border = `${el.border.width ?? 1}px solid ${resolveColor(theme, el.border.color) || "#000000"}`;
    if (el.border.style === "dash") st.borderStyle = "dashed";
    else if (el.border.style === "dot") st.borderStyle = "dotted";
  }
  if (el.shadow) {
    const [dx = 0, dy = 0] = el.shadow.offset || [0, 0];
    const blur = el.shadow.blur ?? 6;
    st.boxShadow = `${dx}px ${dy}px ${blur}px ${resolveColor(theme, el.shadow.color) || "rgba(0,0,0,0.3)"}`;
  }
  return st;
}

/**
 * 笛卡尔轴（官方 §5.3 轴数组规则：垂直图 yAxis 数组 + yAxisIndex，
 * 水平图 xAxis 数组 + xAxisIndex；次轴换侧 right/top）。
 */
function cartesianAxes(theme, el, cats, series, { horizontal = false, percentMax = false, scatter = false } = {}) {
  const { axisColor, gridColor } = chartStyleColors(theme);
  const xAxes = toAxisArray(el.xAxis);
  const yAxes = toAxisArray(el.yAxis);
  const mkAxis = (cfg, def, { hideGridDefault = false } = {}) => {
    if (cfg === false) return { show: false, type: def.type };
    const o = typeof cfg === "object" ? cfg : {};
    return {
      type: o.type || def.type,
      min: o.min,
      max: o.max,
      inverse: o.reverse,
      name: typeof o.title === "string" ? o.title : o.title?.text,
      axisLine: { show: o.axisLine !== false, lineStyle: { color: o.axisLine && typeof o.axisLine === "object" && o.axisLine.color ? resolveColor(theme, o.axisLine.color) || axisColor : axisColor } },
      axisLabel: o.label === false ? { show: false } : { ...AXIS_TEXT, ...(typeof o.label === "object" ? { color: o.label.color ? resolveColor(theme, o.label.color) || AXIS_TEXT.color : AXIS_TEXT.color, fontSize: o.label.fontSize || AXIS_TEXT.fontSize, formatter: o.label.numberFormat ? (v) => fmtNum(v, o.label.numberFormat) : undefined } : {}) },
      splitLine: o.gridLine === false || hideGridDefault ? { show: false } : { lineStyle: { color: typeof o.gridLine === "object" && o.gridLine.color ? resolveColor(theme, o.gridLine.color) || gridColor : gridColor, type: typeof o.gridLine === "object" ? (o.gridLine.style === "dash" ? "dashed" : o.gridLine.style === "dot" ? "dotted" : "solid") : "solid" } },
    };
  };
  const catAxis = (cfg = {}) => ({
    type: "category",
    data: cats,
    axisLine: { lineStyle: { color: axisColor } },
    axisLabel: cfg.label === false ? { show: false } : AXIS_TEXT,
    ...(cfg.show === false ? { show: false } : {}),
  });
  const maxX = Math.max(0, ...series.map((s) => seriesAxisIndex(s, true)));
  const maxY = Math.max(0, ...series.map((s) => seriesAxisIndex(s, false)));
  if (scatter) {
    // scatter/bubble：双数值轴数组
    const xs = [];
    for (let i = 0; i <= maxX; i++) {
      const a = mkAxis(xAxes[i], { type: "value" }, { hideGridDefault: i > 0 });
      if (i > 0) a.position = "top";
      xs.push(a);
    }
    const ys = [];
    for (let i = 0; i <= maxY; i++) {
      const a = mkAxis(yAxes[i], { type: "value" });
      if (i > 0) a.position = "right";
      ys.push(a);
    }
    return { xAxis: xs.length > 1 ? xs : xs[0], yAxis: ys.length > 1 ? ys : ys[0] };
  }
  if (horizontal) {
    // 水平柱：x = 数值轴数组（次轴 top），y = 分类轴
    const xs = [];
    for (let i = 0; i <= maxX; i++) {
      const a = mkAxis(xAxes[i], { type: "value" }, { hideGridDefault: i > 0 });
      if (i > 0) a.position = "top";
      xs.push(a);
    }
    return { xAxis: xs.length > 1 ? xs : xs[0], yAxis: catAxis(yAxes[0]) };
  }
  // 垂直：x = 分类轴，y = 数值轴数组（次轴 right）
  const ys = [];
  for (let i = 0; i <= maxY; i++) {
    const a = mkAxis(yAxes[i], { type: "value" });
    if (percentMax && i === 0) {
      a.max = 100;
      a.axisLabel = { ...(a.axisLabel || {}), formatter: "{value}%" };
    }
    if (i > 0) a.position = "right";
    ys.push(a);
  }
  return { xAxis: catAxis(xAxes[0]), yAxis: ys.length > 1 ? ys : ys[0] };
}

/** 父子表 → ECharts 树（node 带 itemStyle 层级色；levels 裁剪与 writer 同源）。 */
function buildEchartsTree(theme, el, s) {
  const data = el.data || {};
  const rows = data.rows || [];
  const catCol = s._cols.category;
  const valCol = s._cols.value;
  const parentCol = s._cols.parent;
  const nodes = new Map();
  const childrenOf = new Map();
  const roots = [];
  for (const r of rows) {
    const name = String(r[catCol] ?? "").trim();
    if (!name) continue;
    nodes.set(name, { name, value: r[valCol] ?? null, parent: parentCol != null ? r[parentCol] : null });
    if (!childrenOf.has(name)) childrenOf.set(name, []);
  }
  for (const node of nodes.values()) {
    const p = node.parent == null || node.parent === "" ? null : String(node.parent);
    if (p == null || !nodes.has(p)) roots.push(node);
    else childrenOf.get(p).push(node);
  }
  const sumCache = new Map();
  const subtreeSum = (node) => {
    if (sumCache.has(node.name)) return sumCache.get(node.name);
    const kids = childrenOf.get(node.name) || [];
    const v = kids.length === 0
      ? (Number.isFinite(Number(node.value)) ? Number(node.value) : 0)
      : kids.reduce((acc, k) => acc + subtreeSum(k), 0);
    sumCache.set(node.name, v);
    return v;
  };
  const maxLevels = Number.isFinite(s.levels) && s.levels > 0 ? Math.floor(s.levels) : null;
  const tree = [];
  const walk = (node, level, rootIdx) => {
    const kids = childrenOf.get(node.name) || [];
    const item = { name: node.name, value: kids.length === 0 ? node.value : subtreeSum(node) };
    const c = hierarchyColor(theme, s, rootIdx, level);
    if (c) item.itemStyle = { color: c };
    if (kids.length && (maxLevels == null || level + 1 < maxLevels)) {
      item.children = kids.map((k) => walk(k, level + 1, rootIdx));
    }
    return item;
  };
  roots.forEach((root, ri) => tree.push(walk(root, 0, ri)));
  return tree;
}

/** 气泡尺寸映射（官方 sizeScale: sqrt/linear/log + sizeRange px）。 */
function bubbleSizeFn(s) {
  const [minR, maxR] = s.sizeRange || [6, 48];
  const scale = s.sizeScale || "sqrt";
  const vals = (s._values.size || []).filter((v) => v != null).map(Number);
  const lo = Math.min(0, ...vals);
  const hi = Math.max(1, ...vals);
  const span = hi - lo || 1;
  const t = (v) => {
    const n = (Number(v) - lo) / span;
    if (scale === "linear") return n;
    if (scale === "log") return Math.log1p(n * 10) / Math.log1p(10);
    return Math.sqrt(n);
  };
  return (v) => minR + t(v) * (maxR - minR);
}

/** 图表数据 → ECharts option。 */
export function buildChartOption(theme, el) {
  el._theme = theme;
  const { series, cats, warn } = resolveChartSeries(theme, el);
  const fonts = resolveFont(theme, el.fontFamily || null);
  const { labelColor, legendColor } = chartStyleColors(theme);

  const base = {
    textStyle: { fontFamily: `"${fonts.latin}","${fonts.ea}",sans-serif` },
    tooltip: { trigger: "axis" },
    animation: false,
  };

  if (!series.length || (cats.length === 0 && series[0]?.type !== "sankey")) {
    return { ...base, title: { text: "（暂无数据）", left: "center", top: "middle", textStyle: { color: "#9ca3af", fontSize: 13, fontWeight: "normal" } } };
  }

  const types = new Set(series.map((s) => s.type));
  const primary = series[0].type;

  // 图例（官方默认：waterfall/treemap/sunburst/sankey/heatmap 关，其余开；样式消费）
  const legendDefaultOff = new Set(["waterfall", "treemap", "sunburst", "sankey", "heatmap"]);
  const legendOn = el.legend !== false && !(el.legend === undefined && [...types].every((t) => legendDefaultOff.has(t)));
  const legendPos = typeof el.legend === "object" && el.legend.position ? el.legend.position : "bottom";
  const legendCfg = typeof el.legend === "object" ? el.legend : {};
  const legendOpt = {
    show: legendOn,
    ...(legendPos !== "bottom" ? { [legendPos]: 0 } : { bottom: 0 }),
    textStyle: { color: legendCfg.color ? resolveColor(theme, legendCfg.color) || legendColor : legendColor, fontSize: legendCfg.fontSize || 11 },
    icon: "roundRect", itemWidth: 14, itemHeight: 8,
  };

  const grid = { left: 48, right: 24, top: 28, bottom: 36 };
  const common = { ...base, legend: legendOpt, grid, tooltip: { trigger: [...types].some((t) => ["pie", "radar", "treemap", "sunburst", "sankey"].includes(t)) ? "item" : "axis" } };

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
        radius: [inner * 100 + "%", "72%"],
        center: ["50%", "46%"],
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
    const s0 = series[0];
    const max = Math.max(1, ...series.flatMap((s) => s._values.y ?? []).filter((v) => v != null).map(Number));
    const min = s0._theme?.spokeAxis?.min ?? 0;
    const spoke = el.spokeAxis && typeof el.spokeAxis === "object" ? el.spokeAxis : {};
    const { gridColor } = chartStyleColors(theme);
    return {
      ...common,
      radar: {
        indicator: cats.map((c) => ({ name: c, max: spoke.max ?? Math.ceil(max * 1.2), min: spoke.min ?? 0 })),
        radius: "62%",
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
          lineStyle: { color: seriesColor(theme, s), width: s.width ?? 2, type: s.lineStyle === "dash" ? "dashed" : s.lineStyle === "dot" ? "dotted" : "solid" },
          itemStyle: { color: seriesColor(theme, s) },
          symbol: s.marker ? markerSymbol(theme, s.marker, seriesColor(theme, s)).symbol : "none",
          areaStyle: s.areaColor ? { color: typeof s.areaColor === "string" ? resolveColor(theme, s.areaColor) || seriesColor(theme, s) : seriesColor(theme, s) } : undefined,
          label: echartsLabel(theme, el, s, { position: "top" }),
        })),
      }],
    };
  }

  if (primary === "waterfall") {
    const s = series[0];
    const rows = el.data?.rows || [];
    const isTotalCol = s._cols.isTotal;
    const vals = s._values.y ?? [];
    const totCfg = s.totalBars || {};
    const incCfg = s.increaseBars || {};
    const decCfg = s.decreaseBars || {};
    let base = 0;
    const data = rows.map((r, i) => {
      const isTotal = isTotalCol != null ? r[isTotalCol] === true : false;
      const y = Number(vals[i] ?? 0);
      const start = isTotal ? 0 : base;
      base = isTotal ? y : base + y;
      return { start, end: start + y, y, isTotal };
    });
    const palette = themeChartPalette(theme);
    const colorOf = (d) => {
      const cfg = d.isTotal ? totCfg : d.y >= 0 ? incCfg : decCfg;
      if (cfg && cfg.fill) return resolveColor(theme, cfg.fill) || palette[0];
      return d.isTotal ? palette[0] : d.y >= 0 ? palette[1] : palette[2];
    };
    const label = echartsLabel(theme, el, s, { position: "top" });
    const barWidth = el.barWidth != null ? `${el.barWidth * 100}%` : undefined;
    const catLabel = resolveDataLabels(el, s, "waterfall")?.content === "category";
    const fmt = (p) => (catLabel ? p.name : String(p.value));
    return {
      ...common,
      series: [
        { type: "bar", stack: "wf", silent: true, barWidth, data: data.map((d) => d.start), itemStyle: { color: "transparent" }, tooltip: { show: false } },
        {
          type: "bar", stack: "wf", barWidth, data: data.map((d) => d.end),
          itemStyle: { color: (p) => colorOf(data[p.dataIndex]) },
          label: label ? { ...label, formatter: fmt } : undefined,
        },
      ],
      xAxis: { type: "category", data: cats, axisLine: { lineStyle: { color: chartStyleColors(theme).axisColor } }, axisLabel: AXIS_TEXT },
      yAxis: { type: "value", axisLine: { lineStyle: { color: chartStyleColors(theme).axisColor } }, splitLine: { lineStyle: { color: chartStyleColors(theme).gridColor } }, axisLabel: AXIS_TEXT },
    };
  }

  if (primary === "treemap" || primary === "sunburst") {
    const s = series[0];
    const tree = buildEchartsTree(theme, el, s);
    const labelCfg = resolveDataLabels(el, s, primary);
    const showValue = labelCfg?.content === "value";
    const showName = labelCfg?.content === "category" || labelCfg == null;
    return {
      ...common,
      tooltip: { trigger: "item", formatter: (p) => `${p.name}<br/>${p.value ?? ""}` },
      series: [{
        type: primary === "treemap" ? "treemap" : "sunburst",
        data: tree,
        ...(primary === "treemap"
          ? { roam: false, nodeClick: false, breadcrumb: { show: false }, label: { show: showName, formatter: (p) => (showValue ? String(p.value ?? "") : p.name) }, upperLabel: { show: false } }
          : { radius: ["12%", "85%"], label: { show: showName, rotate: "radial", formatter: (p) => (showValue ? String(p.value ?? "") : p.name) } }),
      }],
    };
  }

  if (primary === "heatmap") {
    const s = series[0];
    const xCats = [...new Set((s._values.x || []).map((v) => String(v ?? "")))];
    const yCats = [...new Set((s._values.y || []).map((v) => String(v ?? "")))];
    const xi = new Map(xCats.map((c, i) => [c, i]));
    const yi = new Map(yCats.map((c, i) => [c, i]));
    const data = (s._values.x || []).map((xv, i) => [xi.get(String(xv ?? "")), yi.get(String(s._values.y?.[i] ?? "")), Number(s._values.value?.[i] ?? 0)]);
    const scheme = (Array.isArray(s.colorScheme) && s.colorScheme.length ? s.colorScheme : [hexA("#2563EB", 0.12), "#2563EB"]).map((c) => resolveColor(theme, c) || c);
    const scaleCfg = s.colorScale || {};
    const vals = data.map((d) => d[2]).filter((v) => Number.isFinite(v));
    const diverging = scaleCfg.type === "diverging";
    const m = Math.max(...vals.map((v) => Math.abs(v)), 1);
    const [lo, hi] = diverging ? [-m, m] : (Array.isArray(scaleCfg.domain) ? scaleCfg.domain : [Math.min(...vals, 0), Math.max(...vals, 1)]);
    const colorbar = s.colorbar !== false;
    const colorbarCfg = typeof s.colorbar === "object" ? s.colorbar : {};
    return {
      ...common,
      legend: { show: false },
      tooltip: { trigger: "item", formatter: (p) => `${xCats[p.value[0]]} / ${yCats[p.value[1]]}: ${p.value[2]}` },
      grid: { left: 48, right: colorbar ? 40 : 24, top: 16, bottom: 36 },
      xAxis: { type: "category", data: xCats, axisLine: { lineStyle: { color: chartStyleColors(theme).axisColor } }, axisLabel: AXIS_TEXT, splitArea: { show: true, areaStyle: { color: ["#fff"] } } },
      yAxis: { type: "category", data: yCats, axisLine: { lineStyle: { color: chartStyleColors(theme).axisColor } }, axisLabel: AXIS_TEXT, splitArea: { show: true, areaStyle: { color: ["#fff"] } } },
      visualMap: {
        min: lo, max: hi,
        calculable: false,
        orient: "vertical",
        right: 0, top: "center",
        show: colorbar,
        textStyle: { color: legendColor, fontSize: 10 },
        ...(colorbarCfg.position === "left" ? { orient: "vertical", left: 0, right: "auto" } : {}),
        inRange: { color: diverging && scheme.length >= 3 ? [...scheme] : scheme },
      },
      series: [{
        type: "heatmap",
        data,
        label: echartsLabel(theme, el, s, { position: "inside" }),
        itemStyle: { borderColor: "#fff", borderWidth: 1 },
      }],
    };
  }

  if (primary === "sankey") {
    const s = series[0];
    const srcs = (s._values.source || []).map((v) => String(v ?? ""));
    const tgts = (s._values.target || []).map((v) => String(v ?? ""));
    const flows = (s._values.flow || []).map((v) => Number(v ?? 0));
    const links = srcs.map((sr, i) => ({ source: sr, target: tgts[i], value: Math.max(0, flows[i]) }))
      .filter((l) => l.source !== l.target);
    // Kahn 拓扑序（官方：节点按拓扑序排列；DAG 校验在模型层，预览宽容补尾）
    const firstSeen = new Map();
    for (const n of [...srcs, ...tgts]) if (!firstSeen.has(n)) firstSeen.set(n, firstSeen.size);
    const indeg = new Map();
    const adj = new Map();
    for (const { source: sr, target: tg } of links) {
      if (!adj.has(sr)) adj.set(sr, []);
      if (!indeg.has(sr)) indeg.set(sr, 0);
      if (!indeg.has(tg)) indeg.set(tg, 0);
      indeg.set(tg, indeg.get(tg) + 1);
      adj.get(sr).push(tg);
    }
    const order = [];
    const queue = [...indeg.keys()].filter((n) => indeg.get(n) === 0)
      .sort((a, b) => firstSeen.get(a) - firstSeen.get(b));
    while (queue.length) {
      const n = queue.shift();
      order.push(n);
      for (const t of adj.get(n) || []) {
        indeg.set(t, indeg.get(t) - 1);
        if (indeg.get(t) === 0) {
          queue.push(t);
          queue.sort((a, b) => firstSeen.get(a) - firstSeen.get(b));
        }
      }
    }
    for (const n of [...srcs, ...tgts]) if (!order.includes(n)) order.push(n);
    const fillArr = Array.isArray(s.fill) ? s.fill : null;
    const fillMap = s.fill && !Array.isArray(s.fill) && typeof s.fill === "object" ? s.fill : null;
    const nodes = order.map((name, i) => {
      let color = null;
      if (fillMap && fillMap[name]) color = resolveColor(theme, fillMap[name]);
      else if (fillArr) color = resolveColor(theme, fillArr[i % fillArr.length]);
      return { name, itemStyle: color ? { color } : undefined };
    });
    return {
      ...common,
      tooltip: { trigger: "item", formatter: (p) => `${p.dataType === "edge" ? `${p.data.source} → ${p.data.target}` : p.name}: ${p.data.value ?? p.value}` },
      series: [{
        type: "sankey",
        data: nodes,
        links,
        nodeAlign: s.nodeAlign || "justify",
        nodeWidth: 14,
        nodeGap: 10,
        label: { show: true, color: labelColor, fontSize: 11 },
        lineStyle: { color: "gradient", opacity: 0.45 },
      }],
    };
  }

  // cartesian 系：bar/line/area/scatter/bubble/candlestick
  const stackedPercent = series.some((s) => s.stack === "percent");
  const horizontal = resolveChartDirection(el, series);
  const axes = cartesianAxes(theme, el, cats, series, { horizontal, percentMax: stackedPercent, scatter: primary === "scatter" || primary === "bubble" });

  if (primary === "scatter" || primary === "bubble") {
    const { axisColor, gridColor } = chartStyleColors(theme);
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
        const sizeFn = s.type === "bubble" ? bubbleSizeFn(s) : null;
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
  const seriesOptions = series.map((s) => {
    const color = seriesColor(theme, s);
    // 数值通道按方向取（横向柱：数值在 x；其余：数值在 y）——与 writer seriesChannels 同源
    const chs = s.type === "bar" ? seriesChannels(s, horizontal) : null;
    const valVals = chs ? chs.val.vals : s._values.y;
    const data = (valVals ?? []).map((v) => (v == null ? null : Number(v)));
    const commonSer = {
      name: s.name,
      data,
      stack: s.stack === "percent" ? "total" : s.stack || undefined,
      itemStyle: { color },
      label: echartsLabel(theme, el, s, { position: "top" }),
      xAxisIndex: seriesAxisIndex(s, true),
      yAxisIndex: seriesAxisIndex(s, false),
    };
    if (s.type === "bar") {
      return {
        type: "bar",
        barWidth: el.barWidth != null ? `${el.barWidth * 100}%` : undefined,
        barGap: el.barGap != null ? `${el.barGap * 100}%` : undefined,
        barCategoryGap: el.categoryGap != null ? `${el.categoryGap * 100}%` : undefined,
        ...commonSer,
        itemStyle: { color, borderColor: resolveColor(theme, s.border?.color), borderWidth: s.border?.width },
      };
    }
    if (s.type === "line") {
      return {
        type: "line", smooth: !!s.smooth, symbol: s.marker ? markerSymbol(theme, s.marker, color).symbol : "none",
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
          color: resolveColor(theme, up.fill) || "#FFFFFF",
          color0: resolveColor(theme, down.fill) || "#000000",
          borderColor: resolveColor(theme, up.border?.color) || "#000000",
          borderColor0: resolveColor(theme, down.border?.color) || "#000000",
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

/** 图表元素 → 定位 DOM（ECharts 实例；图表框 fill/border/shadow 与导出 chartSpace spPr 对应）。 */
export function renderChart(theme, el) {
  const box = createElementShell(el, { css: "background:#fff;" });
  box.dataset.chartEl = "1";
  Object.assign(box.style, frameStyle(theme, el));
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
