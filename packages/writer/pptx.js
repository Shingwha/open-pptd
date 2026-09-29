// ============================================================================
// pptx.js — buildPptx(deck) main entry (browser + Node)
// ----------------------------------------------------------------------------
// Input: the unified data model deck (see packages/model/model.js + packages/model/theme.js)
// Output: Uint8Array (a complete PPTX package)
// Images: options.imageMap = { [src]: dataUrl } (browser preload cache)
//         options.root = project root (Node reads files by relative path)
// ============================================================================

import { resolveTheme } from "../model/theme.js";
import { deckSize } from "../model/model.js";
import { walkElements } from "../model/walk.js";
import { ZipWriter } from "./zip.js";
import { xmlHeader } from "./xml.js";
import { buildEmbeddedFonts } from "./font.js";
import {
  buildContentTypes,
  buildRootRels,
  buildCoreProps,
  buildAppPropsV2,
  buildPresentation,
  buildPresentationRels,
  buildSlideMaster,
  buildSlideMasterRels,
  buildSlideLayout,
  buildSlideLayoutRels,
  buildTheme,
  buildNotesMaster,
  buildNotesMasterRels,
  NS_R,
  NS_REL,
} from "./parts.js";
import { buildSlide } from "./slide.js";
import { chartRouteOf } from "../model/chart.js";
import { loadIconDefs } from "./icon.js";
import { decodeDataUrl, imageSize } from "./util.js";

function defaultLoadImage(src, options) {
  if (options.imageMap && options.imageMap[src]) {
    const decoded = decodeDataUrl(options.imageMap[src]);
    if (decoded && magicMatches(decoded.bytes, decoded.ext)) {
      decoded.size = imageSize(decoded.bytes);
      return decoded;
    }
  }
  return null;
}

/** Validate that the byte signature matches the extension (prevents SVG/WebP bytes masquerading as png and corrupting the PPT). */
export function magicMatches(bytes, ext) {
  if (!bytes || bytes.length < 8) return false;
  if (ext === "png") return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (ext === "jpg") return bytes[0] === 0xff && bytes[1] === 0xd8;
  if (ext === "gif") return bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46;
  return false;
}

/**
 * Build the PPTX (async: embedding fonts needs fetch/preloaded bytes).
 * @param {object} deck unified data model ({version,title,size,theme,fonts,pages})
 * @param {object} [options]
 *   - loadImage / imageMap / root: images (as before)
 *   - fontFiles: { [family]: Uint8Array } preloaded font bytes (browser or Node)
 *   - fullFonts: boolean embed fonts in full (skip subsetting so the deck stays editable after export)
 * @returns {Promise<Uint8Array>}
 */
export async function buildPptx(deck, options = {}) {
  const theme = resolveTheme(deck);
  const size = deckSize(deck);
  const pages = Array.isArray(deck.pages) ? deck.pages : [];
  const slideCount = pages.length;
  if (slideCount === 0) throw new Error("deck 没有页面，无法导出");

  const loadImage = options.loadImage || ((src) => defaultLoadImage(src, options));

  const registry = { loadImage };
  const zip = new ZipWriter();
  const allMedia = []; // { path, bytes }

  // Embedded fonts: declaration → subset/EOT → fntdata parts + XML registration fragments
  const embeddedFonts = await buildEmbeddedFonts(deck, options);
  if (embeddedFonts.skipped?.length && typeof options.onFontSkipped === "function") {
    options.onFontSkipped(embeddedFonts.skipped);
  }

  // Icon preload: local library/CDN/editor preload (iconDefs); misses aggregate into a warning (same as fonts)
  const icons = await loadIconDefs(deck, options);
  registry.iconDefs = icons.defs;
  if (icons.skipped.length && typeof options.onIconSkipped === "function") {
    options.onIconSkipped(icons.skipped);
  }

  // Global chart numbering: per-page prefix sums (registerChart inside slideN continues from
  // chartBase). The numbering matches slide.js's registerChart (chartRouteOf: classic/chartex
  // consume a number, image conversion does not).
  const isNumberedChart = (el) => {
    const r = chartRouteOf(el);
    return r === "classic" || r === "chartex";
  };
  const chartPrefix = [];
  let running = 0;
  for (const page of pages) {
    chartPrefix.push(running);
    running += (page.elements || []).filter(isNumberedChart).length;
  }
  const chartTotal = running;

  // Global chartEx part numbering (same order as registerChart: chart-element order per page)
  const chartExIds = [];
  {
    let n = 0;
    walkElements(pages, (el) => {
      if (!isNumberedChart(el)) return;
      n += 1;
      if (chartRouteOf(el) === "chartex") chartExIds.push(n);
    });
  }

  // Speaker notes (official Page.notes): any page with notes → generate notesSlides + notesMaster + theme2
  // notesSlide files are named by page index (notesSlideN.xml ↔ slideN.xml, PowerPoint convention)
  const notesSlides = pages
    .map((p, i) => (typeof p.notes === "string" && p.notes.trim() ? i + 1 : 0))
    .filter((n) => n > 0);
  const hasNotes = notesSlides.length > 0;

  // 1. Fixed parts
  zip.add("[Content_Types].xml", buildContentTypes(slideCount, chartTotal, embeddedFonts.parts.length, chartExIds, notesSlides));
  zip.add("_rels/.rels", buildRootRels());
  zip.add("docProps/core.xml", buildCoreProps(deck.title || "未命名演示文稿"));
  zip.add("docProps/app.xml", buildAppPropsV2(slideCount));
  zip.add("ppt/presentation.xml", buildPresentation(deck.title || "未命名演示文稿", slideCount, size, null, embeddedFonts, hasNotes));
  zip.add("ppt/_rels/presentation.xml.rels", buildPresentationRels(slideCount, embeddedFonts.rels, hasNotes));
  zip.add("ppt/slideMasters/slideMaster1.xml", buildSlideMaster(null));
  zip.add("ppt/slideMasters/_rels/slideMaster1.xml.rels", buildSlideMasterRels());
  zip.add("ppt/slideLayouts/slideLayout1.xml", buildSlideLayout());
  zip.add("ppt/slideLayouts/_rels/slideLayout1.xml.rels", buildSlideLayoutRels());
  zip.add("ppt/theme/theme1.xml", buildTheme(theme));
  if (hasNotes) {
    // notesMaster references a separate theme2.xml (official PowerPoint behavior)
    zip.add("ppt/theme/theme2.xml", buildTheme(theme));
    zip.add("ppt/notesMasters/notesMaster1.xml", buildNotesMaster(null));
    zip.add("ppt/notesMasters/_rels/notesMaster1.xml.rels", buildNotesMasterRels());
  }

  // 1.5 Font parts
  for (const part of embeddedFonts.parts) {
    zip.add(part.path, part.bytes);
  }

  // 2. Per-page slide + media + charts (media names are globally unique across pages to avoid collisions)
  let mediaBase = 0;
  pages.forEach((page, i) => {
    const result = buildSlide(theme, page, i + 1, registry, { chartBase: chartPrefix[i], mediaBase, pageSize: size });
    mediaBase = result.mediaCount;
    zip.add(`ppt/slides/slide${i + 1}.xml`, result.xml);
    zip.add(`ppt/slides/_rels/slide${i + 1}.xml.rels`, result.relsXml);
    if (result.notesXml) {
      zip.add(`ppt/notesSlides/notesSlide${i + 1}.xml`, result.notesXml);
      // notesSlide rels: notesMaster (rId1) + the owning slide (rId2)
      const notesRels =
        xmlHeader() +
        `<Relationships xmlns="${NS_REL}">` +
        `<Relationship Id="rId1" Type="${NS_R}/notesMaster" Target="../notesMasters/notesMaster1.xml"/>` +
        `<Relationship Id="rId2" Type="${NS_R}/slide" Target="../slides/slide${i + 1}.xml"/>` +
        `</Relationships>`;
      zip.add(`ppt/notesSlides/_rels/notesSlide${i + 1}.xml.rels`, notesRels);
    }
    for (const media of result.mediaFiles) {
      allMedia.push(media);
      zip.add(media.path, media.bytes);
    }
    for (const part of result.chartParts) {
      zip.add(part.path, part.bytes);
      zip.add(part.relsPath, part.relsBytes);
      zip.add(part.xlsxPath, part.xlsxBytes);
      if (part.stylePath) zip.add(part.stylePath, part.styleBytes);
      if (part.colorsPath) zip.add(part.colorsPath, part.colorsBytes);
    }
  });

  return zip.build();
}

/** Browser download helper (any bytes: pptx / zip / png). */
export function downloadBlob(bytes, filename, mime = "application/octet-stream") {
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

/** Download .pptx. */
export function downloadPptx(bytes, filename) {
  downloadBlob(bytes, filename || "deck.pptx", PPTX_MIME);
}
