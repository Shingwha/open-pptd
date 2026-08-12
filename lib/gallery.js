// ============================================================================
// gallery.js — 画廊索引扫描（零依赖，正则轻解析）
// ----------------------------------------------------------------------------
// 扫描 examples/ 目录下的每个项目文件夹（examples/<id>/deck.pptd + pages/ + media/），
// 生成画廊条目。同一份扫描逻辑被两个消费者使用：
//   1. 本地 serve：GET /examples/manifest.json 动态生成（用户丢文件夹即见，永远最新）
//   2. CLI `open-pptd gallery scan`：写出静态 examples/manifest.json（供 GitHub Pages）
// 条目信息尽量从项目自身提取（title/fonts/pages），不强制额外元数据；
// 可选 examples/<id>/meta.yaml 补充 description/tags：
//   title: 展示标题（缺省用 deck.title）
//   description: 一句话描述
//   tags: 标签，逗号分隔（场景/能力，如 学术答辩, 图表, 公式）
// ============================================================================

import { readdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";

const GALLERY_VERSION = 1;

/** 从 deck.pptd 文本中轻解析 title（YAML 标量，去引号）。 */
function parseTitle(text) {
  const m = /(?:^|\n)title:\s*(.+?)\s*\n/.exec(text);
  if (!m) return "";
  let v = m[1].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  return v;
}

/** 从 deck.pptd 文本中轻解析 fonts 块（缩进两空格 + key:）的键列表。 */
function parseFonts(text) {
  const m = /(?:^|\n)fonts:\s*\n((?:\s{2}[^\n]+\n)+)/.exec(text);
  if (!m) return [];
  const keys = [];
  for (const line of m[1].split("\n")) {
    const km = /^\s{2}([^:#]+):/.exec(line);
    if (km && !km[1].trim().startsWith("#")) keys.push(km[1].trim());
  }
  return keys;
}

/** 解析可选的 examples/<id>/meta.yaml（键值对，忽略空行/注释）。 */
function parseMeta(text) {
  const meta = {};
  for (const line of text.split("\n")) {
    const m = /^([A-Za-z_][\w]*):\s*(.*?)\s*$/.exec(line);
    if (m) meta[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return meta;
}

/**
 * 扫描 examples/ 目录 → 画廊条目数组（相对仓库根路径）。
 * @param {string} examplesDir examples/ 绝对路径
 * @returns {Array<{id,title,description,tags,pages,fonts,deck}>}
 */
export function scanExamples(examplesDir) {
  if (!existsSync(examplesDir)) return [];
  const entries = [];
  for (const id of readdirSync(examplesDir, { withFileTypes: true })) {
    if (!id.isDirectory() || id.name.startsWith(".")) continue;
    const dir = join(examplesDir, id.name);
    const deckPath = join(dir, "deck.pptd");
    if (!existsSync(deckPath)) continue; // 无 manifest 的目录不算画廊项目

    const deckText = readFileSync(deckPath, "utf8");
    const entry = {
      id: id.name,
      title: parseTitle(deckText) || id.name,
      description: "",
      tags: [],
      pages: 0,
      fonts: parseFonts(deckText),
      deck: `examples/${id.name}/deck.pptd`,
    };

    // 页数 = pages/*.page 文件数（文件名不强制编号，全部计入）
    const pagesDir = join(dir, "pages");
    if (existsSync(pagesDir)) {
      entry.pages = readdirSync(pagesDir).filter((f) => f.endsWith(".page")).length;
    }

    // 可选 meta.yaml 补充描述/标签/标题
    const metaPath = join(dir, "meta.yaml");
    if (existsSync(metaPath)) {
      const meta = parseMeta(readFileSync(metaPath, "utf8"));
      if (meta.title) entry.title = meta.title;
      if (meta.description) entry.description = meta.description;
      if (meta.tags) entry.tags = meta.tags.split(/[,，]/).map((t) => t.trim()).filter(Boolean);
    }
    entries.push(entry);
  }
  // 稳定排序：先按是否有描述（有元数据的优先），再按 id
  entries.sort((a, b) => (a.description ? 0 : 1) - (b.description ? 0 : 1) || a.id.localeCompare(b.id, "zh"));
  return entries;
}

/** 生成完整 manifest 对象。 */
export function buildManifest(examplesDir) {
  return {
    version: GALLERY_VERSION,
    generated: new Date().toISOString(),
    entries: scanExamples(examplesDir),
  };
}
