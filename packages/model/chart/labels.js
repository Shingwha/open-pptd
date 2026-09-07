// ============================================================================
// model/chart/labels.js — 数据标签解析（官方 §3.3 链，渲染器与 writer 共享）
// ----------------------------------------------------------------------------

/** 各类型数据标签可用内容（编辑器样式面板与 resolveDataLabels 共用）。 */
export const DATA_LABEL_CONTENTS = {
  bar: ["value"], line: ["value"], area: ["value"], scatter: ["value"], bubble: ["value"],
  radar: ["value"], heatmap: ["value"], candlestick: ["value"],
  pie: ["value", "percentage", "category"], waterfall: ["value", "category"],
  treemap: ["value", "category"], sunburst: ["value", "category"], sankey: ["value", "category"],
};

/**
 * 数据标签显示（官方 §3.3 链：series[i].dataLabels > Chart.dataLabels > 不显示）。
 * @returns {null | {content, numberFormat, color, fontSize, fontFamily}} 有效配置
 * （样式字段来自 DataLabelConfig extends TextStyle，供 writer/renderer 消费）
 */
export function resolveDataLabels(el, series, type) {
  const DEFAULTS = {
    bar: "value", line: "value", area: "value", scatter: "value", bubble: "value",
    radar: "value", heatmap: "value", pie: "value", waterfall: "value",
    treemap: "category", sunburst: "category", sankey: "value",
  };
  const ALLOWED = DATA_LABEL_CONTENTS;
  const cfg = series?.dataLabels ?? el?.dataLabels ?? null;
  if (!cfg) return null; // 官方默认不显示
  const show = typeof cfg === "boolean" ? cfg : cfg.show !== false;
  if (!show) return null;
  let content = typeof cfg === "object" ? cfg.content : undefined;
  if (content == null) content = DEFAULTS[type] || "value";
  if (!ALLOWED[type] || !ALLOWED[type].includes(content)) content = DEFAULTS[type] || "value";
  const o = typeof cfg === "object" ? cfg : {};
  return {
    content,
    numberFormat: o.numberFormat,
    color: o.color,
    fontSize: o.fontSize,
    fontFamily: o.fontFamily,
  };
}
