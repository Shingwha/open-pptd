// ============================================================================
// model/chart/labels.js — data label resolution (official §3.3 chain, shared by renderer and writer)
// ----------------------------------------------------------------------------

/** Content available per type for data labels (shared by the editor style panel and resolveDataLabels). */
export const DATA_LABEL_CONTENTS = {
  bar: ["value"], line: ["value"], area: ["value"], scatter: ["value"], bubble: ["value"],
  radar: ["value"], heatmap: ["value"], candlestick: ["value"],
  pie: ["value", "percentage", "category"], waterfall: ["value", "category"],
  treemap: ["value", "category"], sunburst: ["value", "category"], sankey: ["value", "category"],
};

/**
 * Data label display (official §3.3 chain: series[i].dataLabels > Chart.dataLabels > not shown).
 * @returns {null | {content, numberFormat, color, fontSize, fontFamily}} effective config
 * (style fields come from DataLabelConfig extends TextStyle, consumed by writer/renderer)
 */
export function resolveDataLabels(el, series, type) {
  const DEFAULTS = {
    bar: "value", line: "value", area: "value", scatter: "value", bubble: "value",
    radar: "value", heatmap: "value", pie: "value", waterfall: "value",
    treemap: "category", sunburst: "category", sankey: "value",
  };
  const ALLOWED = DATA_LABEL_CONTENTS;
  const cfg = series?.dataLabels ?? el?.dataLabels ?? null;
  if (!cfg) return null; // not shown by default per the official spec
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
