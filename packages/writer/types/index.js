// ============================================================================
// writer/types/index.js — toXml registration entry (importing registers every type's toXml)
// ----------------------------------------------------------------------------
// Wiring: the export path (writer/slide.js) only needs this module to get toXml dispatch
// for every type; render / UI fragments are registered separately by renderer/types and editor/types.
// ============================================================================

import { registerType } from "../../model/registry.js";
import { chartRouteOf } from "../../model/chart.js";
import { textXml } from "../text.js";
import { shapeXml } from "../shape.js";
import { iconXml } from "../icon.js";
import { lineXml } from "../line.js";
import { imageXml } from "../image.js";
import { tableXml } from "../table.js";
import { chartXml } from "../chart.js";

registerType({ type: "text", toXml: textXml });
registerType({ type: "shape", toXml: shapeXml });
registerType({ type: "icon", toXml: iconXml });
registerType({ type: "line", toXml: lineXml });
registerType({ type: "image", toXml: imageXml });
registerType({ type: "table", toXml: tableXml });

registerType({
  type: "chart",

  // Route single source chartRouteOf: image collects media first (no chart number consumed);
  // classic/chartex register the chart part then emit a graphicFrame; no route = skip
  toXml(theme, el, ctx) {
    if (!ctx.registerChart || !ctx.collectChart) {
      console.warn(`[writer] 图表 ${el.elementId} 缺少图表部件上下文，已跳过`);
      return "";
    }
    const route = chartRouteOf(el);
    if (route === "image") {
      const imgRef = ctx.collectChartImage ? ctx.collectChartImage(theme, el) : null;
      return imgRef ? chartXml(theme, el, ctx, null, imgRef) : "";
    }
    if (route === null) {
      console.warn(`[writer] 图表 ${el.elementId} 类型 ${el.series?.[0]?.type} 暂不支持原生导出，已跳过`);
      return "";
    }
    const chartId = ctx.registerChart();
    const ok = ctx.collectChart(theme, el, chartId);
    if (!ok) return ""; // type not yet natively exportable (preview is fine; export skips this element)
    return chartXml(theme, el, ctx, chartId);
  },
});

export { registerType, getType, allTypes } from "../../model/registry.js";
