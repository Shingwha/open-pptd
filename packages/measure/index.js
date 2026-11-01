// packages/measure/index.js — packages/measure entry (Contract 3.0 entry, open-pptd/measure).
// The MeasurePort interface plus the default deterministic implementation fontMetricsMeasure
// (pure functions, runnable on Node/CLI/CI). A browser-side refinement adapter, when needed,
// lives in the editor layer.
// Dual-end: this barrel and its transitive closure forbid node:/fs/window./document (dep-graph).

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
