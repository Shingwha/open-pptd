// packages/model/types/chart.js — chart element type descriptor (manifest metadata).
// contentEditor marks the chart data editor; render/toXml are registered by the
// renderer/writer shards.

export const chartType = {
  id: "chart",
  label: "图表",
  contentEditor: true,
  schema(el) {
    const issues = [];
    if (!el.data || typeof el.data !== "object") {
      issues.push({ message: "chart 元素缺 data" });
    }
    if (!Array.isArray(el.series) || !el.series.length) {
      issues.push({ message: "chart 元素 series 至少 1 个" });
    }
    return issues;
  },
};
