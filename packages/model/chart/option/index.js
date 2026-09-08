// ============================================================================
// model/chart/option/index.js — 图表 spec → ECharts option（预览方言投影，纯函数）
// ----------------------------------------------------------------------------
// spec 单源在 chart/spec.js（resolveChartSpec：归一化系列/标题/图例/布局/气泡）；
// 本目录把 spec 投影成 ECharts option，不做语义判断。按轴系家族分派：polar
// （pie/radar）/ cartesian（bar/line/area/scatter/bubble/candlestick/waterfall）/
// matrix（heatmap/treemap/sunburst/sankey）。预览渲染（renderer/chart.js）与导出
// 图片化（writer SSR）共享；官方默认值全部来自 spec 落定结果。
// ============================================================================

import { resolveChartSpec } from "../spec.js";
import { resolveColor, resolveFont } from "../../theme.js";
import { baseOption, legendState } from "./shared.js";
import { buildPolar } from "./polar.js";
import { buildCartesian } from "./cartesian.js";
import { buildMatrix } from "./matrix.js";

/** 图表元素 → ECharts option（便捷入口；重复渲染同元素请复用 spec）。 */
export function buildChartOption(theme, el) {
  return buildOptionFromSpec(resolveChartSpec(theme, el));
}

/** spec → ECharts option。 */
export function buildOptionFromSpec(spec) {
  const { theme, el, series, cats, types, primary, title, legend, layout, bubble } = spec;

  const base = baseOption(theme, el);

  // 标题投影（样式语义见 spec.title；顶部居中，颜色缺省主题文字色）
  if (title.text) {
    const fonts = resolveFont(theme, title.fontFamily);
    const titleColor = (title.color ? resolveColor(theme, title.color) : null)
      || resolveColor(theme, theme.colors?.text) || "#1f2937";
    base.title = {
      text: title.text,
      left: "center", top: 0,
      textStyle: { color: titleColor, fontSize: title.size, fontFamily: `${fonts.latin},${fonts.ea},sans-serif` },
    };
  }

  if (!series.length || (cats.length === 0 && primary !== "sankey")) {
    return { ...base, title: base.title || { text: "（暂无数据）", left: "center", top: "middle", textStyle: { color: "#9ca3af", fontSize: 13, fontWeight: "normal" } } };
  }

  // 图例投影（legendState 只做 ECharts 方位/样式转换，语义在 spec.legend）
  const { legendOpt } = legendState(theme, legend);
  const common = {
    ...base,
    legend: legendOpt,
    grid: layout.grid,
    tooltip: { trigger: types.some((t) => ["pie", "radar", "treemap", "sunburst", "sankey"].includes(t)) ? "item" : "axis" },
  };

  const ctx = { theme, el, series, cats, types, primary, common, layout, barLayout: spec.barLayout, bubble };
  const built = buildPolar(ctx) ?? buildMatrix(ctx) ?? buildCartesian(ctx);
  // 单源契约：预览 / render 截图 / 前端导出图片均假设「无动画、首帧即成帧」。顶层
  // animation:false 管不住所有系列——ECharts treemap 的 defaultOption 硬编码
  // animation:true，新标签会走 ChartView._animateLabels 的 opacity 0→1 淡入，
  // 同步捕获（截图 / canvas.toDataURL）拿到的是透明文字。故逐 series 兜底，
  // 不依赖各类型 defaultOption 的默认值。
  for (const s of built?.series || []) s.animation = false;
  return built;
}
