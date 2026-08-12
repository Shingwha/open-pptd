// ============================================================================
// types/chart.js — 图表元素类型注册（13 种子类型共享同一实现）
// ----------------------------------------------------------------------------
// C3 对齐官方：菜单 = CHART_META 13 类型；官方无 doughnut 类型
// （pie.innerRadius > 0 = 环形）；新建时 encode 用官方字段名。
// ============================================================================

import { registerType } from "./registry.js";
import { nextElementId } from "../core/model.js";
import { CHART_META } from "../core/chart.js";
import { remapEncode } from "../core/chart.js";
import { renderChart } from "../renderer/chart.js";
import { chartXml } from "../writer/chart.js";
import { svgIcon } from "../ui.js";

const CHART_TYPES = Object.entries(CHART_META).map(([k, v]) => [k, v.label]);

/** 图表默认模型。encode 用官方字段名（x/y/category/value/size/high/low/close/open...）。 */
function chartItem(type, label, icon, cols, rows, extra = {}) {
  return {
    id: type,
    label,
    icon: svgIcon(icon),
    create: () => ({
      elementId: nextElementId("chart"),
      elementType: "chart",
      bounds: [180, 130, 600, 320],
      data: { cols, rows: rows || [["A", 30], ["B", 55], ["C", 42], ["D", 68]] },
      series: [{ type, encode: defaultEncode(type, cols), ...extra }],
    }),
  };
}

/** 官方 encode 字段名 → 默认引用前 N 列。 */
function defaultEncode(type, cols) {
  const meta = CHART_META[type];
  const enc = {};
  let ci = 0;
  for (const ch of Object.keys(meta.encode)) {
    enc[ch] = cols[ci++] ?? "";
  }
  return enc;
}

const SCATTER_ROWS = [[1, 30], [2, 55], [3, 42], [4, 68], [5, 90]];
const BUBBLE_ROWS = [[1, 30, 20], [2, 55, 35], [3, 42, 25], [4, 68, 40]];
const CANDLE_ROWS = [["2024-01-01", 10, 12, 9, 11], ["2024-01-02", 11, 13, 10, 12.5], ["2024-01-03", 12.5, 14, 11, 13.5], ["2024-01-04", 13.5, 15, 12, 14]];
const WATERFALL_ROWS = [["期初", 100, null], ["收入", 50, false], ["成本", -30, false], ["税费", -10, false], ["期末", 110, true]];
const HEAT_ROWS = [["A", "一", 10], ["A", "二", 30], ["B", "一", 25], ["B", "二", 40], ["C", "一", 15], ["C", "二", 35]];
const TREE_ROWS = [["全公司", 100, null], ["华东", 45, "全公司"], ["华北", 30, "全公司"], ["华南", 25, "全公司"], ["上海", 20, "华东"], ["杭州", 25, "华东"]];
const SUNBURST_ROWS = TREE_ROWS;
const SANKEY_ROWS = [["A", "B", 40], ["A", "C", 60], ["B", "D", 25], ["B", "E", 15], ["C", "E", 35], ["C", "F", 25]];

registerType({
  type: "chart",
  label: "图表",

  menu: {
    group: "图表",
    items: [
      chartItem("bar", "柱状图", '<path d="M6 20V11M11 20V6M16 20v-8M21 20v-3M3 20h20"/>', ["x", "y"]),
      chartItem("line", "折线图", '<path d="M4 17l5-5 4 3 7-8"/><circle cx="4" cy="17" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="13" cy="15" r="1.6"/><circle cx="20" cy="7" r="1.6"/>', ["x", "y"]),
      chartItem("area", "面积图", '<path d="M4 17l5-5 4 3 7-8V20H4z"/>', ["x", "y"]),
      chartItem("pie", "饼图", '<path d="M12 12V4a8 8 0 0 1 8 8h-8z"/><path d="M12 12L5.1 10.5A8 8 0 0 1 12 4z"/>', ["x", "y"]),
      chartItem("scatter", "散点图", '<circle cx="6" cy="15" r="1.7"/><circle cx="11" cy="9" r="1.7"/><circle cx="16" cy="12" r="1.7"/><circle cx="19" cy="6" r="1.7"/>', ["x", "y"], SCATTER_ROWS),
      chartItem("bubble", "气泡图", '<circle cx="7" cy="14" r="2.4"/><circle cx="13" cy="9" r="3.6"/><circle cx="18" cy="14" r="2.8"/>', ["x", "y", "size"], BUBBLE_ROWS),
      chartItem("candlestick", "股价图", '<path d="M9 4v4M9 8h6v6M15 14v6M12 6v10"/><path d="M12 4h6v2h-6zM6 14h6v2H6z"/>', ["date", "open", "high", "low", "close"], CANDLE_ROWS),
      chartItem("radar", "雷达图", '<path d="M12 4l7 5-2.7 8.3H7.7L5 9z"/><path d="M12 8.5l3.6 2.6-1.3 4h-4.6l-1.3-4z"/>', ["category", "y"], [["速度", 80], ["力量", 70], ["防御", 60], ["敏捷", 90], ["耐力", 75]]),
      chartItem("waterfall", "瀑布图", '<path d="M4 20V12M9 20V8M14 20v-7M19 20v-4M3 20h18"/>', ["x", "y", "isTotal"], WATERFALL_ROWS),
      chartItem("heatmap", "热力图", '<rect x="4" y="4" width="6" height="6"/><rect x="11" y="4" width="6" height="6" opacity=".6"/><rect x="4" y="11" width="6" height="6" opacity=".4"/><rect x="11" y="11" width="6" height="6" opacity=".8"/>', ["x", "y", "value"], HEAT_ROWS),
      chartItem("treemap", "矩形树图", '<rect x="4" y="4" width="12" height="12"/><rect x="17" y="4" width="4" height="5"/><rect x="17" y="10" width="4" height="6"/>', ["category", "value", "parent"], TREE_ROWS),
      chartItem("sunburst", "旭日图", '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.5"/>', ["category", "value", "parent"], SUNBURST_ROWS),
      chartItem("sankey", "桑基图", '<path d="M4 8h8l4 4h4M4 16h5l4-4h7"/>', ["source", "target", "flow"], SANKEY_ROWS),
    ],
  },

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

  render: renderChart,

  props(el, h) {
    return [{
      title: "图表",
      fields: [
        { kind: "select", label: "类型", options: CHART_TYPES,
          get: () => el.series?.[0]?.type || "bar",
          set: (v) => {
            const s = el.series[0];
            s.type = v;
            s.encode = remapEncode(s.encode || {}, CHART_META[v]); // 语义重映射，保留列引用
            if (v !== "pie" && s.innerRadius != null) delete s.innerRadius;
          } },
        { kind: "checks", items: [
          { label: "显示数据标签", get: () => el.dataLabels !== false, set: (v) => { el.dataLabels = v; } },
        ] },
        { kind: "button", label: "编辑图表数据…",
          onClick: () => { h.beginChange(); h.openEditor(el); h.endChange(); } },
        { kind: "hint", text: "系列颜色自动取主题色板；换配色全页联动。" },
      ],
    }];
  },

  quickbar(el, h) {
    h.label("类型");
    h.select(CHART_TYPES, el.series?.[0]?.type || "bar", (v) =>
      h.change(() => {
        const s = el.series[0];
        s.type = v;
        s.encode = remapEncode(s.encode || {}, CHART_META[v]);
        if (v !== "pie" && s.innerRadius != null) delete s.innerRadius;
      })
    );
    h.textBtn("数据…", "编辑图表数据", () => h.change(() => h.openEditor(el)));
  },
});
