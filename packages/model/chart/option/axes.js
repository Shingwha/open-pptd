// ============================================================================
// model/chart/option/axes.js — 笛卡尔轴 → ECharts axis 数组（纯函数）
// ----------------------------------------------------------------------------

import { resolveColor } from "../../theme.js";
import { dashSpec } from "../../style-spec.js";
import { toAxisArray, seriesAxisIndex } from "../axes.js";
import { AXIS_TEXT, CHART_GRID, chartStyleColors, fmtNum } from "./shared.js";

/**
 * 笛卡尔轴（官方 §5.3 轴数组规则：垂直图 yAxis 数组 + yAxisIndex，
 * 水平图 xAxis 数组 + xAxisIndex；次轴换侧 right/top）。
 */
export function cartesianAxes(theme, el, cats, series, { horizontal = false, percentMax = false, scatter = false } = {}) {
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
      splitLine: o.gridLine === false || hideGridDefault ? { show: false } : { lineStyle: { color: typeof o.gridLine === "object" && o.gridLine.color ? resolveColor(theme, o.gridLine.color) || gridColor : gridColor, type: typeof o.gridLine === "object" ? dashSpec(o.gridLine.style)?.cssBorder || "solid" : "solid" } },
    };
  };
  // 类目标签策略与导出一致：全量显示（导出不写 tickLblSkip，PowerPoint 全量渲染）；
  // 放不下时旋转竖排——导出由 PowerPoint 自动旋转，此处按盒宽/盒高估算作渲染投影。
  // label 字号/色透传规则与 mkAxis、writer axisXml txPr 一致。
  const textWidth = (t, fs) => [...String(t)].reduce((w, ch) => w + (ch.charCodeAt(0) > 0x2e80 ? fs : fs * 0.62), 0);
  const catAxis = (cfg = {}, { axisLength = 0, vertical = true } = {}) => {
    const lc = cfg.label && typeof cfg.label === "object" ? cfg.label : {};
    const fs = lc.fontSize || AXIS_TEXT.fontSize;
    const crowded = cats.length > 0 && (vertical
      ? cats.reduce((w, c) => w + textWidth(c, fs), 0) > axisLength * 0.8
      : cats.length * fs * 1.4 > axisLength * 0.8);
    return {
      type: "category",
      data: cats,
      axisLine: { lineStyle: { color: axisColor } },
      axisLabel: cfg.label === false ? { show: false } : {
        ...AXIS_TEXT,
        color: lc.color ? resolveColor(theme, lc.color) || AXIS_TEXT.color : AXIS_TEXT.color,
        fontSize: fs,
        interval: 0,
        ...(crowded ? { rotate: 90 } : {}),
      },
      ...(cfg.show === false ? { show: false } : {}),
    };
  };
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
    return { xAxis: xs.length > 1 ? xs : xs[0], yAxis: catAxis(yAxes[0], { axisLength: el.bounds[3] - CHART_GRID.top - CHART_GRID.bottom, vertical: false }) };
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
  return { xAxis: catAxis(xAxes[0], { axisLength: el.bounds[2] - CHART_GRID.left - CHART_GRID.right }), yAxis: ys.length > 1 ? ys : ys[0] };
}
