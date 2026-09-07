// ============================================================================
// writer/chart/image.js — heatmap/sankey 图片化导出（ECharts SSR → 矢量 SVG）
// ----------------------------------------------------------------------------
// PowerPoint 无这两类的原生/扩展图表类型；按 pptd.md §chart「导出为图片按 Image
// 处理」口径，导出时用与预览同源的 model option（chart/option/）SSR 出 SVG，
// 以 a:blip(PNG 占位) + svgBlip(真实矢量) 图片部件嵌入（PowerPoint 2016+/WPS
// 新版/LibreOffice 显示矢量，旧版显示占位图；数据不可在 PPT 内再编辑）。
// 零新增依赖：复用 renderer/vendor/echarts.mjs（dep-graph 受控豁免，仅 vendor）。
// ============================================================================

import * as echarts from "../../renderer/vendor/echarts.mjs";
import { buildChartOption } from "../../model/chart/option/index.js";
import { resolveColor } from "../../model/theme.js";
import { encodeUtf8 } from "../../model/bytes.js";

/** 需要图片化导出的类型（PowerPoint 无对应原生类型）。 */
export const IMAGE_CHART_TYPES = ["heatmap", "sankey"];

/** 图表元素 → SVG 字符串（与预览同一份 option 单源；尺寸 = bounds pt→px 1:1）。 */
export function buildChartImageSvg(theme, el) {
  const [, , w, h] = el.bounds;
  const width = Math.max(1, Math.round(w));
  const height = Math.max(1, Math.round(h));
  const chart = echarts.init(null, null, { renderer: "svg", ssr: true, width, height });
  try {
    chart.setOption(buildChartOption(theme, el), true);
    let svg = chart.renderToSVGString();
    const fill = normalizeImageFill(theme, el);
    const borderPath = el.border ? ` stroke="${resolveColor(theme, el.border.color) || "#000000"}" stroke-width="${el.border.width ?? 1}"` : "";
    if (fill || el.border) {
      const rect = `<rect x="0" y="0" width="${width}" height="${height}"${fill ? ` fill="${fill}"` : ' fill="none"'}${borderPath}/>`;
      svg = svg.replace(/<svg([^>]*)>/, (m0, attrs) => `${m0}${rect}`);
    }
    return svg;
  } finally {
    chart.dispose();
  }
}

function normalizeImageFill(theme, el) {
  const fill = el.fill;
  if (!fill) return null;
  if (typeof fill === "string") return resolveColor(theme, fill) || null;
  if (typeof fill === "object" && typeof fill.color === "string") {
    return resolveColor(theme, fill.color) || null;
  }
  return null; // 渐变框暂不图片化（罕见，保持简单）
}

/** 图片化部件载荷（UTF-8 字节）。 */
export function buildChartImageBytes(theme, el) {
  return encodeUtf8(buildChartImageSvg(theme, el));
}
