// ============================================================================
// writer/types/chart.js — chart 类型 toXml 分片注册（OOXML 导出）
// ============================================================================

import { registerType } from "../../model/registry.js";
import { chartXml } from "../chart.js";

registerType({
  type: "chart",

  // 图表导出需要先注册 chart part（嵌入 xlsx），再输出 p:graphicFrame
  toXml(theme, el, ctx) {
    if (!ctx.registerChart || !ctx.collectChart) {
      console.warn(`[writer] 图表 ${el.elementId} 缺少图表部件上下文，已跳过`);
      return "";
    }
    const chartId = ctx.registerChart();
    const ok = ctx.collectChart(theme, el, chartId);
    if (!ok) return ""; // 类型暂不支持原生导出（预览正常，导出跳过该元素）
    return chartXml(theme, el, ctx, chartId);
  },
});
