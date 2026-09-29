// ============================================================================
// measure/index.js — packages/measure 包级入口（契约 4 入口 open-pptd/measure）
// ----------------------------------------------------------------------------
// MeasurePort 接口 + 默认确定性实现 fontMetricsMeasure（纯函数，Node/CLI/CI 可跑）。
// 三铁律之「MeasurePort 默认确定性纯函数」；domMeasure 只是浏览器可选精修适配器
// （adapters/dom.js 本波次仅接口桩，M6 接线）。
//
// 双端纯函数：本 barrel 及传递闭包禁 node:/fs/window./document.（dep-graph 强制）。
// ============================================================================

import { measureTextRuns, measureCell, measureTable, lineHeightMultiplierFor } from "./font-metrics.js";

export {
  measureTextRuns,
  measureCell,
  measureTable,
  lineHeightMultiplierFor,
  runsFromRichText,
  familiesOf,
} from "./font-metrics.js";
export { createMetricsTable, defaultMetricsTable, metricKey, METRICS_VERSION } from "./metrics-table.js";

/**
 * MeasurePort 默认实现（字体度量表驱动）。
 * @typedef {object} MeasurePort
 * @property {(runs, style, maxWidth, fonts?) => {lines:number,height:number}} measureTextRuns
 * @property {(cell, colWidth, fonts?) => number} measureCell
 * @property {(table, fonts?) => {columnWidths:number[],rowHeights:number[],totalHeight:number}} measureTable
 * @property {(font, fonts?) => number} lineHeightMultiplierFor
 */
export const fontMetricsMeasure = Object.freeze({
  measureTextRuns,
  measureCell,
  measureTable,
  lineHeightMultiplierFor,
});

export default fontMetricsMeasure;
