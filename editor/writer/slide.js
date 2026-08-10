// ============================================================================
// slide.js — slideN.xml 生成（骨架 + 元素分派）
// ----------------------------------------------------------------------------
// 每种元素类型的 OOXML 生成在独立模块（text/shape/line/image/table/chart），
// 本文件只负责：spTree 骨架、背景、rels、媒体/图表收集，以及分派到各元素实现。
// ============================================================================

import { el, escAttr } from "./xml.js";
import { encodeUtf8 } from "./zip.js";
import { textXml } from "./text.js";
import { shapeXml } from "./shape.js";
import { lineXml } from "./line.js";
import { imageXml } from "./image.js";
import { backgroundXml } from "./background.js";
import { tableXml } from "./table.js";
import { buildChartParts, chartXml } from "./chart.js";
import { getType } from "../types/index.js";

// ----------------------------------------------------------------------------
// 元素 → XML（经类型注册表分派；未注册类型回退占位警告）
// ----------------------------------------------------------------------------
export function elementToXml(theme, element, ctx) {
  const def = getType(element.elementType);
  if (def && def.toXml) return def.toXml(theme, element, ctx);
  console.warn(`[writer] 暂不支持元素类型 ${element.elementType}（${element.elementId}），已跳过`);
  return "";
}

// ----------------------------------------------------------------------------
// slideN.xml 骨架
// ----------------------------------------------------------------------------
export function buildSlide(theme, page, slideIndex, registry, options = {}) {
  const rels = [{ id: "rId1", type: "slideLayout", target: "../slideLayouts/slideLayout1.xml" }];
  const mediaFiles = []; // { path, bytes }
  const chartParts = []; // { path, bytes, relsPath, relsBytes, xlsxPath, xlsxBytes }
  const links = new Map(); // url -> rId
  let idCounter = 1;
  let mediaCounter = 0;
  let linkCounter = 0;
  let chartCounter = options.chartBase || 0;

  const ctx = {
    nextId: () => idCounter++,
    registerLink(url) {
      if (links.has(url)) return links.get(url);
      linkCounter += 1;
      const id = `rIdLink${linkCounter}`;
      links.set(url, id);
      rels.push({ id, type: "hyperlink", target: url, external: true });
      return id;
    },
    loadImage(src) {
      return registry.loadImage ? registry.loadImage(src) : null;
    },
    addMedia(bytes, ext) {
      mediaCounter += 1;
      const n = (options.mediaBase || 0) + mediaCounter;
      const id = `rIdMedia${n}`;
      const name = `image${n}`;
      const path = `ppt/media/${name}.${ext}`;
      mediaFiles.push({ path, bytes });
      rels.push({ id, type: "image", target: `../media/${name}.${ext}` });
      return { id, path, ext };
    },
    registerChart() {
      chartCounter += 1;
      return chartCounter;
    },
    chartRef(chartId, kind) {
      const id = `rIdChart${chartId}`;
      if (kind === "chartEx") {
        rels.push({ id, type: "http://schemas.microsoft.com/office/2014/relationships/chartEx", target: `../charts/chartEx${chartId}.xml` });
      } else {
        rels.push({ id, type: "chart", target: `../charts/chart${chartId}.xml` });
      }
      return id;
    },
    collectChart(theme, el, chartId) {
      const parts = buildChartParts(theme, el, chartId);
      if (!parts) return false; // 类型暂不支持原生导出（预览正常，导出跳过该元素）
      if (parts.chartEx) {
        // chartEx 扩展体系（waterfall/treemap/sunburst）：独立命名 + Worksheet xlsx
        chartParts.push({
          id: chartId,
          chartEx: true,
          path: `ppt/charts/chartEx${chartId}.xml`,
          bytes: encodeUtf8(parts.xml),
          relsPath: `ppt/charts/_rels/chartEx${chartId}.xml.rels`,
          relsBytes: encodeUtf8(parts.relsXml),
          xlsxPath: `ppt/embeddings/Microsoft_Excel_Worksheet${chartId}.xlsx`,
          xlsxBytes: parts.xlsx,
        });
      } else {
        chartParts.push({
          id: chartId,
          path: `ppt/charts/chart${chartId}.xml`,
          bytes: encodeUtf8(parts.xml),
          relsPath: `ppt/charts/_rels/chart${chartId}.xml.rels`,
          relsBytes: encodeUtf8(parts.relsXml),
          xlsxPath: `ppt/embeddings/Microsoft_Excel_Sheet${chartId}.xlsx`,
          xlsxBytes: parts.xlsx,
        });
      }
      return true;
    },
  };

  const elements = (page.elements || []).map((e) => elementToXml(theme, e, ctx)).join("");
  const bg = page.background ? backgroundXml(theme, page.background, ctx) : "";

  const spTree =
    `<p:spTree>` +
    `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
    `<p:grpSpPr/>` +
    elements +
    `</p:spTree>`;

  const xml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ` +
    `xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">` +
    `<p:cSld>${bg}${spTree}</p:cSld>` +
    `<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>` +
    `<p:transition spd="fast" advClick="1"><p:fade/></p:transition>` +
    `</p:sld>`;

  const relsXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    rels
      .map((r) =>
        r.external
          ? el("Relationship", { Id: r.id, Type: `${relType(r.type)}`, Target: r.target, TargetMode: "External" })
          : el("Relationship", { Id: r.id, Type: `${relType(r.type)}`, Target: r.target })
      )
      .join("") +
    `</Relationships>`;

  return { xml, relsXml, mediaFiles, chartParts, mediaCount: (options.mediaBase || 0) + mediaCounter };
}

function relType(type) {
  // 完整 URL（如 chartEx 关系类型）原样输出；相对名拼 officeDocument 前缀
  if (String(type).includes("://")) return type;
  const base = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/";
  return base + type;
}
