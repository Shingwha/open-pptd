// ============================================================================
// renderer/chart.js — 图表预览 DOM 壳（ECharts 实例管理）
// ----------------------------------------------------------------------------
// option 组装单源在 packages/model/chart/option/（与导出图片化共享，纯函数）；
// 本文件只负责：元素定位壳、图表框样式（fill/border/shadow ↔ 导出 chartSpace
// spPr）、ECharts 实例生命周期。
// ============================================================================

import * as echarts from "./vendor/echarts.mjs";
import { buildChartOption } from "../model/chart/option/index.js";
import { normalizeFill, dashSpec } from "../model/style-spec.js";
import { resolveColor } from "../model/theme.js";
import { gradientCss } from "./gradient.js";
import { createElementShell, boxShadowCss } from "./shell.js";

/** 图表框（官方 Chart.fill/border/shadow → 容器样式，与 writer chartSpace spPr 对应）。 */
function frameStyle(theme, el) {
  const st = {};
  const fill = normalizeFill(el.fill);
  if (fill) {
    if (fill.type === "solid") st.background = resolveColor(theme, fill.color) || "#ffffff";
    else if (fill.type === "gradient") st.background = gradientCss(theme, fill) || "#ffffff";
  }
  if (el.border) {
    st.border = `${el.border.width ?? 1}px solid ${resolveColor(theme, el.border.color) || "#000000"}`;
    const ds = dashSpec(el.border.style);
    if (ds) st.borderStyle = ds.cssBorder;
  }
  const boxShadow = boxShadowCss(theme, el.shadow);
  if (boxShadow) st.boxShadow = boxShadow;
  return st;
}

/** 图表元素 → 定位 DOM（ECharts 实例；图表框 fill/border/shadow 与导出 chartSpace spPr 对应——
 * 未设 fill 时不给底色，透出页面背景，与导出端省略 spPr 的行为一致）。
 * ctx.pixelRatio：显式画布像素比（图片导出传 2，截图即 2x 位图；缺省跟屏幕 DPR）。 */
export function renderChart(theme, el, ctx = {}) {
  const box = createElementShell(el);
  box.dataset.chartEl = "1";
  Object.assign(box.style, frameStyle(theme, el));
  const option = buildChartOption(theme, el);
  const chart = echarts.init(box, null, {
    renderer: "canvas",
    ...(ctx.pixelRatio ? { devicePixelRatio: ctx.pixelRatio } : {}),
  });
  chart.setOption(option, true);
  box._chartInstance = chart;
  return box;
}

/** 页面重渲染前释放图表实例。 */
export function disposeChartInstances(container) {
  for (const node of container.querySelectorAll("[data-chart-el]")) {
    const inst = echarts.getInstanceByDom(node);
    if (inst) inst.dispose();
  }
}
