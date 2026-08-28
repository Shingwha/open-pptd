// ============================================================================
// writer/types/index.js — toXml 注册入口（引入即注册全部类型的 toXml）
// ----------------------------------------------------------------------------
// 装配：导出链路（writer/slide.js）只需引入本模块即可获得全部类型的
// toXml 分派；render / UI 分片由 renderer/types 与 editor/types 另行注册。
// ============================================================================

import { registerType } from "../../model/registry.js";
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

export { registerType, getType, allTypes } from "../../model/registry.js";
