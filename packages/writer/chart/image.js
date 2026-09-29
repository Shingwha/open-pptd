// ============================================================================
// writer/chart/image.js — heatmap/sankey image-conversion export (ECharts SSR → vector SVG)
// ----------------------------------------------------------------------------
// PowerPoint has no native/extension chart type for these two; per pptd.md §chart ("export as image,
// treated as Image"), the export SSR-renders an SVG from the same preview model options
// (chart/option/) and embeds it as image parts: a:blip (PNG placeholder) + svgBlip (real vector)
// (PowerPoint 2016+/new WPS/LibreOffice show the vector, older versions the placeholder; the data
// is no longer editable inside the PPT). No new dependency: it reuses packages/vendor/echarts.mjs
// (the neutral shared vendor area for renderer and writer, built as DOM-free pure ESM).
// ============================================================================

import * as echarts from "../../vendor/echarts.mjs";
import { buildChartOption } from "../../model/chart/option/index.js";
import { resolveColor } from "../../model/theme.js";
import { encodeUtf8 } from "../../model/bytes.js";

/** Chart element → SVG string (the same option single source as the preview; size = bounds pt→px 1:1). */
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
  return null; // gradient frames are not image-converted (rare; keep it simple)
}

/** Image-conversion part payload (UTF-8 bytes). */
export function buildChartImageBytes(theme, el) {
  return encodeUtf8(buildChartImageSvg(theme, el));
}
