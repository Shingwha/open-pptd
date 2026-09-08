// ============================================================================
// model/chart/option/shared.js — ECharts option 组装的公共样式片段（纯函数，无 DOM）
// ----------------------------------------------------------------------------
// 本目录（model/chart/option/）是预览渲染与导出图片化（SSR）共享的 option 单源。
// 纯数据组装：禁止 import echarts / 触碰 window/document（dep-graph 强制）。
// ============================================================================

import { resolveColor, resolveFont } from "../../theme.js";
import { dashSpec } from "../../style-spec.js";
import { CHART_DEFAULTS } from "../meta.js";
import { resolveDataLabels } from "../labels.js";
import { formatChartValue } from "../format.js";

/** 主题轴/文字缺省样式（字号来自官方 CHART_DEFAULTS 单源）。 */
export const AXIS_TEXT = { color: "#6b7280", fontSize: CHART_DEFAULTS.axisSize };

/** 笛卡尔图 grid 边距（px；ECharts 布局与类目标签拥挤估算共用一份）。
 * 唯一定义在 model/chart/layout.js（与导出 manualLayout 同一基底），此处转 re-export。 */
export { CHART_GRID } from "../layout.js";

/** 主题图表样式（网格/轴/文字色跟随主题 colors 键，缺省用内置默认）。 */
export function chartStyleColors(theme) {
  return {
    labelColor: resolveColor(theme, theme.colors?.text) || "#1f2937",
    axisColor: resolveColor(theme, theme.colors?.line) || "#d8dce1",
    gridColor: resolveColor(theme, theme.colors?.line) || "#f0f2f5",
    legendColor: resolveColor(theme, theme.colors?.text) || "#1f2937",
  };
}

/** 官方 dataLabels → ECharts label 配置（含样式 color/fontSize）。
 * 散点/气泡的 p.value 是 [x,y(,size)] 数组，显示值取 y 通道（与导出端 showVal 一致）。 */
export function echartsLabel(theme, el, s, { position = "top", pie = false } = {}) {
  const cfg = resolveDataLabels(el, s, s.type);
  if (!cfg) return undefined;
  const { labelColor } = chartStyleColors(theme);
  const displayValue = (p) => (Array.isArray(p.value) ? p.value[1] : p.value);
  let formatter;
  if (cfg.content === "percentage") formatter = pie ? "{d}%" : (p) => `${(p.percent ?? 0).toFixed(1)}%`;
  else if (cfg.content === "category") formatter = pie ? "{b}" : (p) => p.name;
  else formatter = (p) => (cfg.numberFormat ? formatChartValue(displayValue(p), cfg.numberFormat) : String(displayValue(p)));
  return {
    show: true,
    position,
    fontSize: cfg.fontSize || CHART_DEFAULTS.labelSize,
    color: cfg.color ? resolveColor(theme, cfg.color) || labelColor : labelColor,
    formatter,
  };
}

/** 系列主体色（与 writer 同源；$key 主题引用 → 解析为具体色）。 */
export function seriesColor(theme, s) {
  if (s.type === "line" || s.type === "area" || s.type === "radar") return resolveColor(theme, s.lineColor) || resolveColor(theme, s.color);
  return resolveColor(theme, s.color);
}

/** 官方 marker → ECharts symbol（fill/border 主题引用解析）。 */
export function markerSymbol(theme, marker, color) {
  if (!marker || marker === false) return { show: false };
  const cfg = typeof marker === "object" ? marker : {};
  const shape = { circle: "circle", rect: "rect", diamond: "diamond", triangle: "triangle" }[cfg.shape] || "circle";
  return {
    show: true,
    symbol: shape,
    symbolSize: cfg.size || CHART_DEFAULTS.markerSize,
    itemStyle: { color: resolveColor(theme, cfg.fill) || color, borderColor: resolveColor(theme, cfg.border?.color), borderWidth: cfg.border?.width },
  };
}

/** 图表顶层公共 option（字体/tooltip 触发/无动画）。
 * 字体族名不加内层引号：SSR 序列化（writer/chart/image.js）会把该串原样插进
 * style="..." 属性，内层双引号无法转义会产出非法 XML（PowerPoint 拒渲染）；
 * CSS 未引号族名（含空格）同样合法，canvas/svg 两端解析一致。 */
export function baseOption(theme, el) {
  const fonts = resolveFont(theme, el.fontFamily || null);
  return {
    textStyle: { fontFamily: `${fonts.latin},${fonts.ea},sans-serif` },
    tooltip: { trigger: "axis" },
    animation: false,
  };
}

/** 图例 ECharts 投影（语义在 spec.legend：on/pos/size/color 单源）。
 * 四方位完整映射（top/bottom 水平居中，left/right 垂直居中竖排）——此前只写
 * 单边 {pos:0}，right 会落到顶部横排，与导出端 legendPos 背离。 */
export function legendState(theme, legend) {
  const { legendColor } = chartStyleColors(theme);
  const cfg = legend.cfg || {};
  const posOpt = legend.pos === "top" ? { top: 0, left: "center" }
    : legend.pos === "left" ? { left: 0, top: "middle", orient: "vertical" }
    : legend.pos === "right" ? { right: 0, top: "middle", orient: "vertical" }
    : { bottom: 0, left: "center" };
  const legendOpt = {
    show: legend.on,
    ...posOpt,
    textStyle: { color: cfg.color ? resolveColor(theme, cfg.color) || legendColor : legendColor, fontSize: cfg.fontSize || CHART_DEFAULTS.legendSize },
    // 图例 marker 收敛 PowerPoint 小方块观感（此前 roundRect 14×8 大圆角色块，I25）
    icon: "rect", itemWidth: 10, itemHeight: 8,
  };
  return { legendOn: legend.on, legendOpt };
}

export { dashSpec, resolveColor };
