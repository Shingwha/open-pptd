// ============================================================================
// pptd-io.js — PPTD YAML ↔ 统一数据模型（宽容解析 / 子集序列化）
// ----------------------------------------------------------------------------
// 打开 Kimi 生成的完整 PPTD 项目时采用"宽容解析"：认识字段全部读取，
// 不认识的字段原样保留在 el.extra 中（写回时尽量不丢信息）；
// 但编辑器只承诺支持本项目的组件子集（见 model.js）。
// ============================================================================

import * as yaml from "../vendor/js-yaml.mjs";
import { createDeck, createPage, PAGE_WIDTH, PAGE_HEIGHT } from "./model.js";

/**
 * 解析 PPTD 项目（manifest + pages）→ 统一 deck 模型。
 * @param {string} manifestYaml .pptd 文件文本
 * @param {Map<string,string>} pageFiles page 路径 → 文件文本
 * @param {object} [options] { basePath } 用于解析相对路径
 */
export function parseDeck(manifestYaml, pageFiles = new Map(), options = {}) {
  const manifest = yaml.load(manifestYaml);
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("无效的 PPTD manifest（顶层应为映射）");
  }
  if (manifest.version !== "v2") {
    console.warn(`[pptd-io] 未知版本 ${manifest.version}，按 v2 尝试解析`);
  }

  const deck = createDeck({
    title: manifest.title,
    size: Array.isArray(manifest.size) && manifest.size.length === 2 ? manifest.size : [PAGE_WIDTH, PAGE_HEIGHT],
    theme: manifest.theme || null,
    fonts: manifest.fonts || null,
  });
  deck.extra = pickExtra(manifest, ["version", "title", "size", "theme", "fonts", "pages"]);

  const pages = Array.isArray(manifest.pages) ? manifest.pages : [];
  for (const rel of pages) {
    const text = pageFiles.get(String(rel));
    if (text == null) {
      console.warn(`[pptd-io] 缺少页面文件 ${rel}，已跳过`);
      continue;
    }
    let page;
    try {
      page = parsePage(text);
    } catch (err) {
      // 单页解析失败 → 降级为错误占位页（渲染层显示红框），不再中断整个项目加载
      console.warn(`[pptd-io] 页面 ${rel} 解析失败，已降级为错误占位页: ${err.message}`);
      page = createPage({ pageType: "content" });
      page._parseError = err.message || String(err);
      page._parseErrorLine = err.mark && typeof err.mark.line === "number" ? err.mark.line + 1 : null;
      page._rawText = text; // 保留原始文本，保存时原样写回，不丢内容
    }
    page._path = String(rel);
    deck.pages.push(page);
  }
  return deck;
}

function parsePage(text) {
  const data = yaml.load(text);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("无效的 page 文件（顶层应为映射）");
  }
  const page = createPage({
    pageType: typeof data.pageType === "string" ? data.pageType : "content",
    background: data.background || null,
    notes: typeof data.notes === "string" ? data.notes : "",
  });
  page.extra = pickExtra(data, ["pageType", "background", "notes", "elements"]);
  page.elements = (Array.isArray(data.elements) ? data.elements : [])
    .map((el, i) => normalizeElement(el, i))
    .filter(Boolean);
  return page;
}

function normalizeElement(el, index) {
  if (!el || typeof el !== "object" || Array.isArray(el)) {
    console.warn(`[pptd-io] 忽略无效元素 #${index}`);
    return null;
  }
  if (typeof el.elementId !== "string" || !el.elementId) {
    el.elementId = `el${index + 1}`;
  }
  if (!Array.isArray(el.bounds) || el.bounds.length !== 4) {
    console.warn(`[pptd-io] 元素 ${el.elementId} bounds 无效，已跳过`);
    return null;
  }
  // 宽容：保留未知字段（写回时使用）
  const known = ["elementId", "elementType", "bounds", "rotation", "opacity", "flip"];
  el.extra = pickExtra(el, known);
  // 表格兼容：裸值单元格（字符串/数字）→ {text: 值}，统一消费方只读 cell.text
  if (el.elementType === "table" && Array.isArray(el.rows)) {
    el.rows = el.rows.map((row) =>
      (Array.isArray(row) ? row : []).map((cell) =>
        cell && typeof cell === "object" && !Array.isArray(cell) ? cell : { text: cell == null ? "" : String(cell) }
      )
    );
  }
  return el;
}

function pickExtra(obj, known) {
  const extra = {};
  for (const key of Object.keys(obj)) {
    if (!known.includes(key)) extra[key] = obj[key];
  }
  return extra;
}

/**
 * 把统一 deck 模型序列化为 PPTD（子集）。
 * @param {object} deck
 * @param {object} [options] { manifestName } 指定 manifest 文件名（默认 deck.pptd）
 * @returns {Array<{path:string, content:string}>} manifest + pages 文件列表
 */
export function serializeDeck(deck, options = {}) {
  // 宽容解析保留的未知字段（deck/page 级 extra）合并写回，不丢信息；已知字段优先
  const manifest = {
    ...(deck.extra || {}),
    version: "v2",
    title: deck.title,
    size: deck.size,
  };
  if (deck.theme) manifest.theme = deck.theme;
  if (deck.fonts) manifest.fonts = deck.fonts;
  const manifestName = options.manifestName || "deck.pptd";
  manifest.pages = deck.pages.map((p, i) => p._path || `pages/${i + 1}.page`);

  const files = [{ path: manifestName, content: yaml.dump(manifest) }];
  deck.pages.forEach((page, i) => {
    const data = {
      ...(page.extra || {}),
      pageType: page.pageType || "content",
      // 元素级未知字段（el.extra）展开到元素顶层写回，不留嵌套 extra 键
      elements: (page.elements || []).map((el) => {
        if (!el || !el.extra || Object.keys(el.extra).length === 0) return el;
        const { extra, ...rest } = el;
        return { ...extra, ...rest };
      }),
    };
    if (page.background) data.background = page.background;
    if (page.notes) data.notes = page.notes;
    const path = page._path || `pages/${i + 1}.page`;
    // 解析失败页：原样写回原始文本，避免编辑器序列化破坏原始内容
    const content = page._rawText != null ? page._rawText : yaml.dump(data);
    files.push({ path, content });
  });
  return files;
}
