// renderer/index.js — packages/renderer package barrel (Contract 3.0 entry open-pptd/renderer)
// Re-exports only, zero logic. DOM is the output target (window./document. are allowed), but
// node:* / fs must never appear here: no Node API may leak into the browser preview pipeline.
// Hard rule: this barrel and its transitive closure must NOT import ./headless/** (Node-only
// screenshot pipeline; importing it from a page would drag Node code into the browser).

export { paintPage, disposeChartInstances } from "./page.js";

export { iconThumb } from "./icon.js";

export { cellFinal, tdCss } from "./table.js";

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
