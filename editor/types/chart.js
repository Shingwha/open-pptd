// ============================================================================
// types/chart.js — 图表元素类型注册（7 种子类型共享同一实现）
// ============================================================================

import { registerType } from "./registry.js";
import { nextElementId } from "../core/model.js";
import { CHART_META } from "../core/chart.js";
import { renderChart } from "../renderer/chart.js";
import { chartXml } from "../writer/chart.js";
import { svgIcon } from "../ui.js";

const CHART_TYPES = Object.entries(CHART_META).map(([k, v]) => [k, v.label]);

/** 图表默认模型。type 与 CHART_META 的 key 一致。 */
function chartItem(type, label, icon, encode, rows) {
  return {
    id: type === "line" ? "lineChart" : type,
    label,
    icon: svgIcon(icon),
    create: () => ({
      elementId: nextElementId("chart"),
      elementType: "chart",
      bounds: [180, 130, 600, 320],
      data: { cols: ["x", "y"], rows: rows || [["A", 30], ["B", 55], ["C", 42], ["D", 68]] },
      series: [{ type, encode, name: "示例" }],
    }),
  };
}

const SCATTER_DATA = [[1, 30], [2, 55], [3, 42], [4, 68], [5, 90]];

registerType({
  type: "chart",
  label: "图表",

  menu: {
    group: "图表",
    items: [
      chartItem("bar", "柱状图", '<path d="M6 20V11M11 20V6M16 20v-8M21 20v-3M3 20h20"/>', { x: "x", y: "y" }),
      chartItem("line", "折线图", '<path d="M4 17l5-5 4 3 7-8"/><circle cx="4" cy="17" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="13" cy="15" r="1.6"/><circle cx="20" cy="7" r="1.6"/>', { x: "x", y: "y" }),
      chartItem("area", "面积图", '<path d="M4 17l5-5 4 3 7-8V20H4z"/>', { x: "x", y: "y" }),
      chartItem("pie", "饼图", '<path d="M12 12V4a8 8 0 0 1 8 8h-8z"/><path d="M12 12L5.1 10.5A8 8 0 0 1 12 4z"/>', { category: "x", value: "y" }),
      chartItem("doughnut", "环形图", '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/>', { category: "x", value: "y" }),
      chartItem("scatter", "散点图", '<circle cx="6" cy="15" r="1.7"/><circle cx="11" cy="9" r="1.7"/><circle cx="16" cy="12" r="1.7"/><circle cx="19" cy="6" r="1.7"/>', { x: "x", y: "y" }, SCATTER_DATA),
      chartItem("radar", "雷达图", '<path d="M12 4l7 5-2.7 8.3H7.7L5 9z"/><path d="M12 8.5l3.6 2.6-1.3 4h-4.6l-1.3-4z"/>', { category: "x", y: "y" }),
    ],
  },

  // 图表导出需要先注册 chart part（嵌入 xlsx），再输出 p:graphicFrame
  toXml(theme, el, ctx) {
    if (!ctx.registerChart || !ctx.collectChart) {
      console.warn(`[writer] 图表 ${el.elementId} 缺少图表部件上下文，已跳过`);
      return "";
    }
    const chartId = ctx.registerChart();
    ctx.collectChart(theme, el, chartId);
    return chartXml(theme, el, ctx, chartId);
  },

  render: renderChart,

  props(el, h) {
    const g = h.group("图表");
    g.appendChild(h.field("类型", h.selectInput(CHART_TYPES, el.series?.[0]?.type || "bar", (v) => {
      const s = el.series[0];
      s.type = v;
      s.encode = CHART_META[v].encode;
    })));
    g.appendChild(h.checkbox("显示数据标签", el.dataLabels !== false, (v) => { el.dataLabels = v; }));
    g.appendChild(h.button("编辑图表数据…", () => { h.beginChange(); h.openEditor(el); h.endChange(); }));
    const hint = document.createElement("div");
    hint.className = "prop-hint";
    hint.textContent = "系列颜色自动取主题色板；换主题全页联动。";
    g.appendChild(hint);
    return [g];
  },

  quickbar(el, h) {
    h.label("类型");
    h.select(CHART_TYPES, el.series?.[0]?.type || "bar", (v) =>
      h.change(() => {
        const s = el.series[0];
        s.type = v;
        s.encode = CHART_META[v].encode;
      })
    );
    h.textBtn("数据…", "编辑图表数据", () => h.change(() => h.openEditor(el)));
  },
});
