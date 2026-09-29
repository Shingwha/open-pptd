// ============================================================================
// renderer/chart.js — chart preview DOM shell (ECharts instance management)
// ----------------------------------------------------------------------------
// Option assembly has a single source in packages/model/chart/option/ (shared with the
// image export, pure functions); this file only owns the positioned shell, the chart
// frame style (fill/border/shadow ↔ the exported chartSpace spPr), and the ECharts
// instance lifecycle.
// ============================================================================

import * as echarts from "../vendor/echarts.mjs";
import { resolveChartSpec } from "../model/chart/spec.js";
import { buildOptionFromSpec } from "../model/chart/option/index.js";
import { normalizeFill, dashSpec } from "../model/style-spec.js";
import { colorOr } from "../model/theme.js";
import { gradientCss } from "./gradient.js";
import { createElementShell, boxShadowCss } from "./shell.js";

/** Chart frame (official Chart.fill/border/shadow → container style, corresponding to the writer's chartSpace spPr). */
function frameStyle(theme, el) {
  const st = {};
  const fill = normalizeFill(el.fill);
  if (fill) {
    if (fill.type === "solid") st.background = colorOr(theme, fill.color, "#ffffff");
    else if (fill.type === "gradient") st.background = gradientCss(theme, fill) || "#ffffff";
  }
  if (el.border) {
    st.border = `${el.border.width ?? 1}px solid ${colorOr(theme, el.border.color, "#000000")}`;
    const ds = dashSpec(el.border.style);
    if (ds) st.borderStyle = ds.cssBorder;
  }
  const boxShadow = boxShadowCss(theme, el.shadow);
  if (boxShadow) st.boxShadow = boxShadow;
  return st;
}

/** Chart element → positioned DOM (ECharts instance; the frame fill/border/shadow match the
 * exported chartSpace spPr — with no fill no background is applied, letting the page
 * background show through, matching the export's omitted spPr). ctx.pixelRatio: explicit
 * canvas pixel ratio (the image export passes 2 for a 2x bitmap; defaults to the screen DPR).
 */
export function renderChart(theme, el, ctx = {}) {
  const box = createElementShell(el);
  box.dataset.chartEl = "1";
  Object.assign(box.style, frameStyle(theme, el));
  const option = buildOptionFromSpec(resolveChartSpec(theme, el));
  const chart = echarts.init(box, null, {
    renderer: "canvas",
    ...(ctx.pixelRatio ? { devicePixelRatio: ctx.pixelRatio } : {}),
  });
  chart.setOption(option, true);
  box._chartInstance = chart;
  return box;
}

/** Dispose chart instances before a page repaint. */
export function disposeChartInstances(container) {
  for (const node of container.querySelectorAll("[data-chart-el]")) {
    const inst = echarts.getInstanceByDom(node);
    if (inst) inst.dispose();
  }
}
