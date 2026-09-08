// ============================================================================
// model/chart/format.js — 图表数值格式化（官方 numberFormat 词表的唯一解释器）
// ----------------------------------------------------------------------------
// 预览标签/轴 formatter 与 SSR 图片化共用；writer 原生导出不经过本模块
// （formatCode 透传给 PowerPoint 原生解析）。
// ============================================================================

/** numberFormat 格式码全集（编辑器下拉的词表锚点，展示文案在 editor 侧）。 */
export const NUMBER_FORMAT_CODES = ["", "0", "0.0", "0%", "0.0%", "#,##0", "0.0E+00"];

/** formatCode → 显示串（官方词表缺省 = 四舍五入整数）。 */
export function formatChartValue(v, format) {
  const n = Number(v);
  if (Number.isNaN(n)) return String(v ?? "");
  if (format === "0%") return `${Math.round(n * 100)}%`;
  if (format === "0.0%") return `${(n * 100).toFixed(1)}%`;
  if (/^0\.0+$/.test(format)) return n.toFixed(format.length - 2);
  if (format === "0.0E+00") return n.toExponential(1);
  if (format === "#,##0") return n.toLocaleString("en-US");
  return String(Math.round(n));
}
