// editor/types/chart.js — chart element UI boundary (label + create)
// One add-menu entry creates a bar chart; the chart editor switches the type and
// remaps encode keys. Only data, type, series and series color are editable.

import { svgIcon } from "../ui.js";
import { CHART_META, nextElementId, registerType } from "../../packages/model/index.js";

/** Official encode keys → reference the first N columns by default. */
function defaultEncode(type, cols) {
  const meta = CHART_META[type];
  const enc = {};
  let ci = 0;
  for (const ch of Object.keys(meta.encode)) {
    enc[ch] = cols[ci++] ?? "";
  }
  return enc;
}

registerType({
  type: "chart",
  label: "图表",
  addIcon: svgIcon('<path d="M6 20V11M11 20V6M16 20v-8M21 20v-3M3 20h20"/>'),
  addHint: "创建后直接编辑数据",
  create: () => {
    const cols = ["x", "y"];
    return {
      elementId: nextElementId("chart"),
      elementType: "chart",
      bounds: [180, 130, 600, 320],
      data: { cols, rows: [["A", 30], ["B", 55], ["C", 42], ["D", 68]] },
      series: [{ type: "bar", encode: defaultEncode("bar", cols) }],
    };
  },
});
