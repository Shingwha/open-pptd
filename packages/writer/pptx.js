// ============================================================================
// pptx.js — buildPptx(deck) 总入口（浏览器 + Node 双环境）
// ----------------------------------------------------------------------------
// 输入：统一数据模型 deck（见 packages/model/model.js + packages/model/theme.js）
// 输出：Uint8Array（完整 PPTX 包）
// 图片：options.imageMap = { [src]: dataUrl }（浏览器预读缓存）
//       options.root = 项目根目录（Node 下按相对路径读文件）
// ============================================================================

import { normalizeTheme, mergeFonts } from "../model/theme.js";
import { PAGE_WIDTH, PAGE_HEIGHT } from "../model/model.js";
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

/** 校验字节签名与扩展名一致（防止 SVG/WebP 字节伪装成 png 写入 PPT 导致文件损坏）。 */
export function magicMatches(bytes, ext) {
  if (!bytes || bytes.length < 8) return false;
  if (ext === "png") return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (ext === "jpg") return bytes[0] === 0xff && bytes[1] === 0xd8;
  if (ext === "gif") return bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46;
  return false;
}

/**
 * 构建 PPTX（异步：嵌入字体需要 fetch/预读字节）。
 * @param {object} deck 统一数据模型（{version,title,size,theme,fonts,pages}）
 * @param {object} [options]
 *   - loadImage / imageMap / root：图片（同旧版）
 *   - fontFiles: { [family]: Uint8Array } 预读字体字节（浏览器/Node 均可）
 * @returns {Promise<Uint8Array>}
 */
export async function buildPptx(deck, options = {}) {
  const theme = mergeFonts(normalizeTheme(deck.theme), deck.fonts);
  const size = Array.isArray(deck.size) && deck.size.length === 2 ? deck.size : [PAGE_WIDTH, PAGE_HEIGHT];
  const pages = Array.isArray(deck.pages) ? deck.pages : [];
  const slideCount = pages.length;
  if (slideCount === 0) throw new Error("deck 没有页面，无法导出");

  const loadImage = options.loadImage || ((src) => defaultLoadImage(src, options));

  const registry = { loadImage };
  const zip = new ZipWriter();
  const allMedia = []; // { path, bytes }

  // 嵌入字体：声明 → 子集化/EOT → fntdata 部件 + XML 注册片段
  const embeddedFonts = await buildEmbeddedFonts(deck, options);
  if (embeddedFonts.skipped?.length && typeof options.onFontSkipped === "function") {
    options.onFontSkipped(embeddedFonts.skipped);
  }

  // 图表全局编号：每页前缀和（slideN 内 registerChart 从 chartBase 继续）
  const chartPrefix = [];
  let running = 0;
  for (const page of pages) {
    chartPrefix.push(running);
    running += (page.elements || []).filter((el) => el.elementType === "chart").length;
  }
  const chartTotal = running;

  // chartEx 部件全局编号（与 registerChart 同序：每页 chart 元素顺序）
  const chartExIds = [];
  {
    let n = 0;
    walkElements(pages, (el) => {
      if (el.elementType !== "chart") return;
      n += 1;
      const t = el.series?.[0]?.type;
      if (t === "waterfall" || t === "treemap" || t === "sunburst") chartExIds.push(n);
    });
  }

  // 演讲者备注（官方 Page.notes）：任意页有备注 → 生成 notesSlides + notesMaster + theme2
  // notesSlide 文件按页序号命名（notesSlideN.xml ↔ slideN.xml，PowerPoint 官方惯例）
  const notesSlides = pages
    .map((p, i) => (typeof p.notes === "string" && p.notes.trim() ? i + 1 : 0))
    .filter((n) => n > 0);
  const hasNotes = notesSlides.length > 0;

  // 1. 固定部件
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
    // notesMaster 引用独立 theme2.xml（PowerPoint 官方行为，对照 notes-ref.pptx）
    zip.add("ppt/theme/theme2.xml", buildTheme(theme));
    zip.add("ppt/notesMasters/notesMaster1.xml", buildNotesMaster(null));
    zip.add("ppt/notesMasters/_rels/notesMaster1.xml.rels", buildNotesMasterRels());
  }

  // 1.5 字体部件
  for (const part of embeddedFonts.parts) {
    zip.add(part.path, part.bytes);
  }

  // 2. 每页 slide + 媒体 + 图表（媒体命名跨页全局唯一，避免同名覆盖）
  let mediaBase = 0;
  pages.forEach((page, i) => {
    const result = buildSlide(theme, page, i + 1, registry, { chartBase: chartPrefix[i], mediaBase, pageSize: size });
    mediaBase = result.mediaCount;
    zip.add(`ppt/slides/slide${i + 1}.xml`, result.xml);
    zip.add(`ppt/slides/_rels/slide${i + 1}.xml.rels`, result.relsXml);
    if (result.notesXml) {
      zip.add(`ppt/notesSlides/notesSlide${i + 1}.xml`, result.notesXml);
      // notesSlide rels：notesMaster（rId1）+ 所属 slide（rId2）
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

/** 浏览器下载助手。 */
export function downloadPptx(bytes, filename) {
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "deck.pptx";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
