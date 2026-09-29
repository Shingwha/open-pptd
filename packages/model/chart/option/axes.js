// ============================================================================
// model/chart/option/axes.js — 笛卡尔轴 → ECharts axis 数组（纯函数）
// ----------------------------------------------------------------------------

import { resolveColor } from "../../theme.js";
import { dashSpec } from "../../style-spec.js";
import { toAxisArray, seriesAxisIndex } from "../axes.js";
import { formatChartValue } from "../format.js";
import { AXIS_TEXT, CHART_GRID, chartStyleColors } from "./shared.js";

/** 轴标题配置归一（string | TitleConfig → { text, ... } 或 null）。 */
const axisTitleCfg = (title) => (typeof title === "string" ? { text: title } : title || null);

/**
 * 笛卡尔轴（官方 §5.3 轴数组规则：垂直图 yAxis 数组 + yAxisIndex，
 * 水平图 xAxis 数组 + xAxisIndex；次轴换侧 right/top）。
 */
export function cartesianAxes(theme, el, cats, series, { horizontal = false, percentMax = false, scatter = false } = {}) {
  const { axisColor, gridColor, labelColor } = chartStyleColors(theme);
  const xAxes = toAxisArray(el.xAxis);
  const yAxes = toAxisArray(el.yAxis);
  /** 轴标题文字样式单源（mkAxis 与 catAxis 共用：色缺省主题文字色，字号缺省 AXIS_TEXT）。 */
  const titleNameStyle = (titleCfg) => ({
    color: titleCfg.color ? resolveColor(theme, titleCfg.color) || labelColor : labelColor,
    fontSize: titleCfg.fontSize || AXIS_TEXT.fontSize,
  });
  const mkAxis = (cfg, def, { hideGridDefault = false, vertical = false } = {}) => {
    if (cfg === false) return { show: false, type: def.type };
    const o = typeof cfg === "object" ? cfg : {};
    // 轴标题：居中沿轴排布（PowerPoint 约定），竖轴旋转 90°——此前用 ECharts 默认
    // name（渲染在轴端外侧），竖轴标题跑到左上角、横轴标题不可见
    const titleCfg = axisTitleCfg(o.title);
    // 轴线箭头（官方 axisLine.arrow → ECharts symbol 对）
    const arrow = o.axisLine && typeof o.axisLine === "object" ? o.axisLine.arrow : null;
    const arrowSym = arrow === "end" || arrow === true ? ["none", "arrow"] : arrow === "start" ? ["arrow", "none"] : arrow === "both" ? ["arrow", "arrow"] : null;
    return {
      type: o.type || def.type,
      min: o.min,
      max: o.max,
      inverse: o.reverse,
      ...(titleCfg?.text ? {
        name: titleCfg.text,
        nameLocation: "middle",
        nameGap: vertical ? 34 : 22,
        nameRotate: vertical ? 90 : 0,
        nameTextStyle: titleNameStyle(titleCfg),
      } : {}),
      axisLine: { show: o.axisLine !== false, ...(arrowSym ? { symbol: arrowSym } : {}), lineStyle: { color: o.axisLine && typeof o.axisLine === "object" && o.axisLine.color ? resolveColor(theme, o.axisLine.color) || axisColor : axisColor } },
      axisLabel: o.label === false ? { show: false } : { ...AXIS_TEXT, ...(typeof o.label === "object" ? { color: o.label.color ? resolveColor(theme, o.label.color) || AXIS_TEXT.color : AXIS_TEXT.color, fontSize: o.label.fontSize || AXIS_TEXT.fontSize, formatter: o.label.numberFormat ? (v) => formatChartValue(v, o.label.numberFormat) : (v) => `${v}` } : { formatter: (v) => `${v}` }) },
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
    // 类目轴标题（与 mkAxis 同款居中排布；此前 catAxis 不消费 title，横轴标题缺失）
    const titleCfg = axisTitleCfg(cfg.title);
    return {
      type: "category",
      data: cats,
      axisLine: { lineStyle: { color: axisColor } },
      ...(titleCfg?.text ? {
        name: titleCfg.text,
        nameLocation: "middle",
        nameGap: vertical ? 26 : 22,
        nameTextStyle: titleNameStyle(titleCfg),
      } : {}),
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
  // 数值轴数组构造单源：主值轴 + 次轴（i>0 换侧：竖轴 right / 横轴 top）；
  // percentMax 仅主 y 轴加 0-100% 刻度（堆叠百分比）
  const valueAxes = (cfgs, max, { vertical = false, percent = false } = {}) => {
    const out = [];
    for (let i = 0; i <= max; i++) {
      const a = mkAxis(cfgs[i], { type: "value" }, vertical ? { vertical: true } : { hideGridDefault: i > 0 });
      if (percent && i === 0) {
        a.max = 100;
        a.axisLabel = { ...(a.axisLabel || {}), formatter: "{value}%" };
      }
      if (i > 0) a.position = vertical ? "right" : "top";
      out.push(a);
    }
    return out;
  };
  const oneOrArr = (arr) => (arr.length > 1 ? arr : arr[0]);
  if (scatter) {
    // scatter/bubble：双数值轴数组
    return { xAxis: oneOrArr(valueAxes(xAxes, maxX)), yAxis: oneOrArr(valueAxes(yAxes, maxY, { vertical: true })) };
  }
  if (horizontal) {
    // 水平柱：x = 数值轴数组（次轴 top），y = 分类轴
    return { xAxis: oneOrArr(valueAxes(xAxes, maxX)), yAxis: catAxis(yAxes[0], { axisLength: el.bounds[3] - CHART_GRID.top - CHART_GRID.bottom, vertical: false }) };
  }
  // 垂直：x = 分类轴，y = 数值轴数组（次轴 right）
  return {
    xAxis: catAxis(xAxes[0], { axisLength: el.bounds[2] - CHART_GRID.left - CHART_GRID.right }),
    yAxis: oneOrArr(valueAxes(yAxes, maxY, { vertical: true, percent: percentMax })),
  };
}
