// ============================================================================
// renderer/index.js — packages/renderer package barrel (contract-4 entry open-pptd/renderer)
// ----------------------------------------------------------------------------
// Re-exports only, zero logic. DOM is renderer's output target (window./document.
// are allowed here), but node:* / fs must never appear: no Node API may leak into
// the browser preview pipeline.
//
// Hard rule: this barrel and its transitive closure must NOT import ./headless/**
// (the headless screenshot pipeline is Node-only; importing this entry from a page
// would drag Node code into the browser).
// ============================================================================

// ---- Page painting (page.js; disposeChartInstances is re-exported by page.js) ----
// paintPage = paint entry of the three-stage pipeline (consumes LayoutTree);
// renderPage/autoGrowTexts are the 2.x contract-compat surface (renderPage does
// layout → paintPage internally; autoGrowTexts is a deprecated empty stub).
export { paintPage, renderPage, autoGrowTexts, disposeChartInstances } from "./page.js";

// ---- Icon thumbnail (icon.js) ----
export { iconThumb } from "./icon.js";

// ---- Table cell helpers (table.js: reused by editor thumbnails / toolchain) ----
export { cellFinal, tdCss } from "./table.js";

// ---- Element-renderer namespace (public builders of each render*.js) ----
import { renderText } from "./text.js";
import { renderShape } from "./shape.js";
import { renderLine } from "./line.js";
import { renderImage } from "./image.js";
import { renderIcon } from "./icon.js";
import { renderTable } from "./table.js";
import { renderChart } from "./chart.js";
import { pageBackground } from "./background.js";

export const renderers = {
  renderText,
  renderShape,
  renderLine,
  renderImage,
  renderIcon,
  renderTable,
  renderChart,
  pageBackground,
};
