// ============================================================================
// server/gallery.js — 画廊索引扫描（YAML 统一走 js-yaml，与 model 同源）
// ----------------------------------------------------------------------------
// 扫描 examples/ 目录下的每个项目文件夹（examples/<id>/deck.pptd + pages/ + media/），
// 生成画廊条目。同一份扫描逻辑被两个消费者使用：
//   1. 本地 serve：GET /examples/manifest.json 动态生成（用户丢文件夹即见，永远最新）
//   2. CLI `open-pptd gallery scan`：写出静态 examples/manifest.json（供 GitHub Pages）
// 条目信息尽量从项目自身提取（title/fonts/pages/size），不强制额外元数据；
// 可选 examples/<id>/meta.yaml 补充 description/tags/kind：
//   title: 展示标题（缺省用 deck.title）
//   description: 一句话描述
//   tags: 标签，逗号分隔（场景/能力，如 学术答辩, 图表, 公式）
//   kind: 作品类型，显式指定（ppt 默认 / poster 海报），画廊据此分 tab
// ============================================================================

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import * as yaml from "../model/vendor/js-yaml.mjs";

const GALLERY_VERSION = 2;

/** 解析 deck.pptd / meta.yaml；解析失败返回 null（调用方回退默认值）。 */
function loadYaml(text) {
  try {
    return yaml.load(text) || null;
  } catch {
    return null;
  }
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

    const deckObj = loadYaml(readFileSync(deckPath, "utf8"));
    const size = Array.isArray(deckObj?.size) && deckObj.size.length === 2 ? deckObj.size : [960, 540];
    const entry = {
      id: id.name,
      title: (typeof deckObj?.title === "string" && deckObj.title) || id.name,
      description: "",
      tags: [],
      pages: 0,
      fonts: deckObj?.fonts && typeof deckObj.fonts === "object" ? Object.keys(deckObj.fonts) : [],
      size: [Number(size[0]) || 960, Number(size[1]) || 540],
      kind: "ppt",
      deck: `examples/${id.name}/deck.pptd`,
    };

    // 页数 = pages/*.page 文件数（文件名不强制编号，全部计入）
    const pagesDir = join(dir, "pages");
    if (existsSync(pagesDir)) {
      entry.pages = readdirSync(pagesDir).filter((f) => f.endsWith(".page")).length;
    }

    // 可选 meta.yaml 补充描述/标签/标题/类型
    const metaPath = join(dir, "meta.yaml");
    if (existsSync(metaPath)) {
      const meta = loadYaml(readFileSync(metaPath, "utf8"));
      if (meta?.title) entry.title = String(meta.title);
      if (meta?.description) entry.description = String(meta.description);
      if (meta?.tags) entry.tags = String(meta.tags).split(/[,，]/).map((t) => t.trim()).filter(Boolean);
      if (meta?.kind) entry.kind = String(meta.kind) === "poster" ? "poster" : "ppt";
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
