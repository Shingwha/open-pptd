// ============================================================================
// renderer/index.js — packages/renderer 包级 barrel（契约 4 入口 open-pptd/renderer）
// ----------------------------------------------------------------------------
// 纯再导出，零逻辑。DOM 是 renderer 的输出目标（允许 window./document.），
// 但仍不得出现 node:* / fs（防 Node API 渗入浏览器预览链路）。
//
// 红线：本 barrel 及其传递闭包**不得** import ./headless/**（无头截图链路是
// Node 专用，浏览器端 import 本入口会把 Node 代码拉进页面）。
// ============================================================================

// ---- 页面渲染（page.js，disposeChartInstances 由 page.js 再导出）----
export { renderPage, autoGrowTexts, disposeChartInstances } from "./page.js";

// ---- 图标缩略图（icon.js）----
export { iconThumb } from "./icon.js";

// ---- 表格单元格工具（table.js：编辑器缩略/工具链复用）----
export { cellFinal, tdCss } from "./table.js";

// ---- 元素渲染器命名空间（各 render*.js 的公开构建函数）----
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
