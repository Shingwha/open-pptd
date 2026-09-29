// ============================================================================
// slide.js — slideN.xml generation (skeleton + element dispatch)
// ----------------------------------------------------------------------------
// OOXML generation for each element type lives in its own module (text/shape/line/image/table/chart);
// this file only owns the spTree skeleton, background, rels, media/chart collection, and dispatch.
// ============================================================================

import { el, esc, xmlHeader } from "./xml.js";
import { encodeUtf8 } from "../model/bytes.js";
import { NS_A, NS_R, NS_P, NS_REL } from "./parts.js";
import { PAGE_WIDTH, PAGE_HEIGHT } from "../model/model.js";
import { chartRouteOf } from "../model/chart.js";
import { backgroundXml } from "./background.js";
import { buildChartParts } from "./chart.js";
import { buildChartImageBytes } from "./chart/image.js";
import { TINY_PNG } from "./chart/types.js";
import { getType } from "./types/index.js";

// ----------------------------------------------------------------------------
// Element → XML (dispatched via the type registry; unregistered types warn and are skipped)
// ----------------------------------------------------------------------------
export function elementToXml(theme, element, ctx) {
  const def = getType(element.elementType);
  if (def && def.toXml) return def.toXml(theme, element, ctx);
  console.warn(`[writer] 暂不支持元素类型 ${element.elementType}（${element.elementId}），已跳过`);
  return "";
}

// ----------------------------------------------------------------------------
// slideN.xml skeleton
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

  // Speaker notes (official Page.notes) → notesSlideN.xml (generated only when notes exist)
  // Structure: grpSpPr with xfrm + 3 placeholders (sldImg image / body notes text / sldNum page
  // number), with an empty bodyPr
  const notesText = typeof page.notes === "string" ? page.notes.trim() : "";
  let notesXml = null;
  if (notesText) {
    rels.push({ id: "rIdNotes", type: "notesSlide", target: `../notesSlides/notesSlide${slideIndex}.xml` });
    const paras = notesText.split(/\r?\n/).map((line) =>
      el("a:p", {}, el("a:r", {}, el("a:rPr", { lang: "zh-CN", altLang: "en-US" }) + el("a:t", {}, esc(line))) + el("a:endParaRPr", { lang: "en-US", altLang: "zh-CN" }))
    ).join("");
    const sp = (id, name, phXml, body, locks = "") =>
      `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/>` +
      `<p:cNvSpPr>${locks ? `<a:spLocks ${locks}/>` : ""}</p:cNvSpPr><p:nvPr>${phXml}</p:nvPr></p:nvSpPr>` +
      `<p:spPr/>${body ? `<p:txBody><a:bodyPr/><a:lstStyle/>${body}</p:txBody>` : ""}</p:sp>`;
    notesXml =
      xmlHeader() +
      `<p:notes xmlns:a="${NS_A}" ` +
      `xmlns:r="${NS_R}" ` +
      `xmlns:p="${NS_P}">` +
      `<p:cSld><p:spTree>` +
      `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
      `<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>` +
      sp(2, "幻灯片图像占位符 1", `<p:ph type="sldImg"/>`, "", 'noGrp="1" noRot="1" noChangeAspect="1"') +
      sp(3, "备注占位符 2", `<p:ph type="body" idx="1"/>`, paras) +
      sp(4, "灯片编号占位符 3", `<p:ph type="sldNum" sz="quarter" idx="5"/>`,
        `<a:p><a:fld id="{7C4E9E91-FCE7-4138-8DA2-1A1079A745F4}" type="slidenum"><a:rPr lang="zh-CN" altLang="en-US" smtClean="0"/><a:t>‹#›</a:t></a:fld><a:endParaRPr lang="zh-CN" altLang="en-US"/></a:p>`) +
      `</p:spTree></p:cSld>` +
      `<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>` +
      `</p:notes>`;
  }

  const ctx = {
    // Page size (deck.size): background image cover cropping etc. is computed against the actual page; default 960×540
    pageSize: Array.isArray(options.pageSize) ? options.pageSize : [PAGE_WIDTH, PAGE_HEIGHT],
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
    // Icon preload cache (a Map produced by loadIconDefs): iconXml looks up {inner,w,h} by raw iconName
    iconDefs: registry.iconDefs || null,
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
    // heatmap/sankey image conversion (route single source chartRouteOf === "image": called
    // before registerChart, consuming no chart number — Content_Types declares chartN.xml by
    // consecutive ids, so a gap would declare a missing part)
    collectChartImage(theme, el) {
      if (chartRouteOf(el) !== "image") return null;
      const svgBytes = buildChartImageBytes(theme, el);
      const png = this.addMedia(TINY_PNG, "png");
      const svg = this.addMedia(svgBytes, "svg");
      return { pngId: png.id, svgId: svg.id };
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
    // Classic/chartEx part collection (toXml already routed image away before reaching here);
    // empty parts = unknown-type fallback → return false and skip, leaving no dangling reference
    collectChart(theme, el, chartId) {
      const parts = buildChartParts(theme, el, chartId);
      if (!parts) return false;
      if (parts.chartEx) {
        // chartEx extension system (waterfall/treemap/sunburst): separate naming + a Worksheet xlsx
        // + style/colors parts (rId2/rId3, by which PowerPoint indexes the default style sheets)
        chartParts.push({
          id: chartId,
          chartEx: true,
          path: `ppt/charts/chartEx${chartId}.xml`,
          bytes: encodeUtf8(parts.xml),
          relsPath: `ppt/charts/_rels/chartEx${chartId}.xml.rels`,
          relsBytes: encodeUtf8(parts.relsXml),
          xlsxPath: `ppt/embeddings/Microsoft_Excel_Worksheet${chartId}.xlsx`,
          xlsxBytes: parts.xlsx,
          stylePath: `ppt/charts/style${chartId}.xml`,
          styleBytes: encodeUtf8(parts.styleXml),
          colorsPath: `ppt/charts/colors${chartId}.xml`,
          colorsBytes: encodeUtf8(parts.colorsXml),
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
  // With a contain background image, underlay is non-empty: layered at the spTree bottom (lowest z-order)
  const { bg: bgXml, underlay } = page.background ? backgroundXml(theme, page.background, ctx) : { bg: "", underlay: "" };

  const spTree =
    `<p:spTree>` +
    `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
    `<p:grpSpPr/>` +
    underlay +
    elements +
    `</p:spTree>`;

  const xml =
    xmlHeader() +
    `<p:sld xmlns:a="${NS_A}" ` +
    `xmlns:r="${NS_R}" ` +
    `xmlns:p="${NS_P}">` +
    `<p:cSld>${bgXml}${spTree}</p:cSld>` +
    `<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>` +
    `<p:transition spd="fast" advClick="1"><p:fade/></p:transition>` +
    `</p:sld>`;

  const relsXml =
    xmlHeader() +
    `<Relationships xmlns="${NS_REL}">` +
    rels
      .map((r) =>
        r.external
          ? el("Relationship", { Id: r.id, Type: `${relType(r.type)}`, Target: r.target, TargetMode: "External" })
          : el("Relationship", { Id: r.id, Type: `${relType(r.type)}`, Target: r.target })
      )
      .join("") +
    `</Relationships>`;

  return { xml, relsXml, mediaFiles, chartParts, mediaCount: (options.mediaBase || 0) + mediaCounter, notesXml };
}

function relType(type) {
  // A full URL (e.g. the chartEx relationship type) is emitted as-is; a relative name gets the officeDocument prefix
  if (String(type).includes("://")) return type;
  return `${NS_R}/` + type;
}
