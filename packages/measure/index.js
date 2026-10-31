// ============================================================================
// measure/index.js — packages/measure package entry (contract 4 entry open-pptd/measure)
// ----------------------------------------------------------------------------
// The MeasurePort interface plus the default deterministic implementation
// fontMetricsMeasure (pure functions, runnable on Node/CLI/CI). This is the
// "MeasurePort defaults to a deterministic pure function" invariant; a browser-side
// refinement adapter, when needed, is implemented in the editor layer.
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
 * @property {(table, opts?) => {columnWidths:number[],rowHeights:number[],totalHeight:number}} measureTable
 *   opts = { theme?, fonts? } (a bare metrics table is still accepted)
 * @property {(font, fonts?) => number} lineHeightMultiplierFor
 */
export const fontMetricsMeasure = Object.freeze({
  measureTextRuns,
  measureCell,
  measureTable,
  lineHeightMultiplierFor,
});

export default fontMetricsMeasure;
