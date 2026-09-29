// ============================================================================
// measure/index.js — packages/measure package entry (contract 4 entry open-pptd/measure)
// ----------------------------------------------------------------------------
// The MeasurePort interface plus the default deterministic implementation
// fontMetricsMeasure (pure functions, runnable on Node/CLI/CI). This is the
// "MeasurePort defaults to a deterministic pure function" invariant; domMeasure is
// only an optional browser-side refinement adapter (adapters/dom.js is still a stub).
//
// Dual-end pure functions: this barrel and its transitive closure forbid
// node:/fs/window./document. (enforced by dep-graph).
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
 * Default MeasurePort implementation (driven by the font metrics table).
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
