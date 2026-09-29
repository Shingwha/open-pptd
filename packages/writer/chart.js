// ============================================================================
// writer/chart.js — chart export public entry (barrel; routed by export kind)
// ----------------------------------------------------------------------------
// Split by responsibility under chart/ (this file only re-exports; the public surface is
// unchanged from before the split):
//   chart/types.js    export grouping (8 classic / 3 chartEx / placeholder PNG)
//   chart/xlsx.js     embedded xlsx worksheet (full part + candlestick column reorder)
//   chart/style.js    shared style fragments (fill/ln/txPr/dLbls/marker/srgbClr)
//   chart/ser.js      per-type c:ser series construction
//   chart/axes.js     catAx/valAx + axis-array rules (secondary-axis side/ID conventions) + radar axis group
//   chart/classic.js  classic c:chartSpace main assembly (buildChartParts)
//   chart/chartex.js  chartEx extension system (waterfall/treemap/sunburst)
//   chart/frame.js    slide graphicFrame (chartEx mc:AlternateContent wrapper)
// Consumers always import this file (writer/chart.js) and never deep-import chart/ internals.
// ============================================================================

export { buildChartParts } from "./chart/classic.js";
export { chartXml } from "./chart/frame.js";
