// ============================================================================
// writer/types/chart.js — chart toXml shard (route: image / classic / chartEx)
// ----------------------------------------------------------------------------
// Route single source chartRouteOf: image collects media first (no chart number
// consumed); classic/chartEx register the chart part then emit a graphicFrame;
// no route = skip.
// ============================================================================

import { registerType } from "../../model/registry.js";
import { chartRouteOf } from "../../model/chart.js";
import { chartXml } from "../chart.js";

registerType({
  type: "chart",

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
