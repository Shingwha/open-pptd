// renderer/index.js — packages/renderer package barrel (Contract 3.0 entry open-pptd/renderer)
// Re-exports only, zero logic. DOM is this package's output target (window./document. are
// allowed), but node:* / fs must never appear in the browser preview pipeline.
// This barrel and its transitive closure must NOT import ./headless/** (Node-only screenshot
// pipeline; importing it from a page would drag Node code into the browser).

// ---- Page painting (page.js; disposeChartInstances is re-exported by page.js) ----
// paintPage is the only paint entry of the three-stage pipeline (consumes LayoutTree);
// callers run layout(deck) themselves.
export { paintPage, disposeChartInstances } from "./page.js";

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
