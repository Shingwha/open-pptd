// ============================================================================
// model/chart/option/axes.js — cartesian axes -> ECharts axis array (pure functions)
// ----------------------------------------------------------------------------

import { colorOr } from "../../theme.js";
import { dashSpec } from "../../style-spec.js";
import { toAxisArray, seriesAxisIndex } from "../axes.js";
import { formatChartValue } from "../format.js";
import { AXIS_TEXT, CHART_GRID, chartStyleColors } from "./shared.js";

/** Axis title config normalization (string | TitleConfig -> { text, ... } or null). */
const axisTitleCfg = (title) => (typeof title === "string" ? { text: title } : title || null);

/**
 * Cartesian axes (official §5.3 axis-array rules: a vertical chart uses a yAxis array +
 * yAxisIndex, a horizontal chart an xAxis array + xAxisIndex; a secondary axis switches
 * side to right/top).
 */
export function cartesianAxes(theme, el, cats, series, { horizontal = false, percentMax = false, scatter = false } = {}) {
  const { axisColor, gridColor, labelColor } = chartStyleColors(theme);
  const xAxes = toAxisArray(el.xAxis);
  const yAxes = toAxisArray(el.yAxis);
  /** Single source for axis title text style (shared by mkAxis and catAxis: color defaults to the theme text color, size to AXIS_TEXT). */
  const titleNameStyle = (titleCfg) => ({
    color: titleCfg.color ? colorOr(theme, titleCfg.color, labelColor) : labelColor,
    fontSize: titleCfg.fontSize || AXIS_TEXT.fontSize,
  });
  const mkAxis = (cfg, def, { hideGridDefault = false, vertical = false } = {}) => {
    if (cfg === false) return { show: false, type: def.type };
    const o = typeof cfg === "object" ? cfg : {};
    // Axis title: centered along the axis (PowerPoint convention), rotated 90° on a
    // vertical axis — previously this used the ECharts default name (drawn outside the
    // axis end), so a vertical axis title landed in the top-left corner and a horizontal
    // axis title was invisible
    const titleCfg = axisTitleCfg(o.title);
    // Axis line arrow (official axisLine.arrow -> ECharts symbol pair)
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
      axisLine: { show: o.axisLine !== false, ...(arrowSym ? { symbol: arrowSym } : {}), lineStyle: { color: o.axisLine && typeof o.axisLine === "object" && o.axisLine.color ? colorOr(theme, o.axisLine.color, axisColor) : axisColor } },
      axisLabel: o.label === false ? { show: false } : { ...AXIS_TEXT, ...(typeof o.label === "object" ? { color: o.label.color ? colorOr(theme, o.label.color, AXIS_TEXT.color) : AXIS_TEXT.color, fontSize: o.label.fontSize || AXIS_TEXT.fontSize, formatter: o.label.numberFormat ? (v) => formatChartValue(v, o.label.numberFormat) : (v) => `${v}` } : { formatter: (v) => `${v}` }) },
      splitLine: o.gridLine === false || hideGridDefault ? { show: false } : { lineStyle: { color: typeof o.gridLine === "object" && o.gridLine.color ? colorOr(theme, o.gridLine.color, gridColor) : gridColor, type: typeof o.gridLine === "object" ? dashSpec(o.gridLine.style)?.cssBorder || "solid" : "solid" } },
    };
  };
  // Category label strategy matches the export: show all (the export writes no
  // tickLblSkip, PowerPoint renders all labels); when they do not fit, rotate to vertical —
  // the export lets PowerPoint rotate automatically, this side estimates by box width/height
  // as the render projection. The label font-size/color pass-through rule matches mkAxis and
  // the writer axisXml txPr.
  const textWidth = (t, fs) => [...String(t)].reduce((w, ch) => w + (ch.charCodeAt(0) > 0x2e80 ? fs : fs * 0.62), 0);
  const catAxis = (cfg = {}, { axisLength = 0, vertical = true } = {}) => {
    const lc = cfg.label && typeof cfg.label === "object" ? cfg.label : {};
    const fs = lc.fontSize || AXIS_TEXT.fontSize;
    const crowded = cats.length > 0 && (vertical
      ? cats.reduce((w, c) => w + textWidth(c, fs), 0) > axisLength * 0.8
      : cats.length * fs * 1.4 > axisLength * 0.8);
    // Category axis title (same centered layout as mkAxis; catAxis previously ignored title, so a horizontal axis title was missing)
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
        color: lc.color ? colorOr(theme, lc.color, AXIS_TEXT.color) : AXIS_TEXT.color,
        fontSize: fs,
        interval: 0,
        ...(crowded ? { rotate: 90 } : {}),
      },
      ...(cfg.show === false ? { show: false } : {}),
    };
  };
  const maxX = Math.max(0, ...series.map((s) => seriesAxisIndex(s, true)));
  const maxY = Math.max(0, ...series.map((s) => seriesAxisIndex(s, false)));
  // Single source for value-axis array construction: primary value axis + secondary axes
  // (side switches when i>0: right on a vertical axis / top on a horizontal one);
  // percent adds a 0-100% scale to the primary y axis only (percent stacking)
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
    // scatter/bubble: arrays of two value axes
    return { xAxis: oneOrArr(valueAxes(xAxes, maxX)), yAxis: oneOrArr(valueAxes(yAxes, maxY, { vertical: true })) };
  }
  if (horizontal) {
    // Horizontal bars: x = value axis array (secondary axis on top), y = category axis
    return { xAxis: oneOrArr(valueAxes(xAxes, maxX)), yAxis: catAxis(yAxes[0], { axisLength: el.bounds[3] - CHART_GRID.top - CHART_GRID.bottom, vertical: false }) };
  }
  // Vertical: x = category axis, y = value axis array (secondary axis on the right)
  return {
    xAxis: catAxis(xAxes[0], { axisLength: el.bounds[2] - CHART_GRID.left - CHART_GRID.right }),
    yAxis: oneOrArr(valueAxes(yAxes, maxY, { vertical: true, percent: percentMax })),
  };
}
