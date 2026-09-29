#!/usr/bin/env node
// ============================================================================
// tests/tools/golden-render.mjs — 黄金基线生成（spec 09 T2）
// ----------------------------------------------------------------------------
// 用**现役旧管线**（renderer/headless renderDeck + 本机 Chrome/Edge）把全部
// examples（15 套）与 tests/projects（9 套）逐页渲染为 PNG：
//   tests/golden/png/<source>__<name>/deck-NN.png   （gitignore，不入库）
//   tests/golden/manifest.json                       （每页 dHash/aHash + 尺寸 +
//                                                     源 deck 哈希，入库）
// 入库的只有感知哈希 + 元数据；PNG 本体体积大，gitignore。
//
// 用法：
//   node tests/tools/golden-render.mjs               # 全量重建基线
//   node tests/tools/golden-render.mjs --filter chart  # 只重建匹配项目（谨慎：会替换基线子集）
// 依赖：本机 Chrome/Edge（SMOKE_CHROME 可指定）；需网络字体时自动 fetch（与 CLI render 同）。
// ============================================================================

import { mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { discoverProjects, renderProject, deckSourceHash, pageFingerprint, probeBrowser, ROOT } from "./golden-run.mjs";

const GOLDEN_DIR = join(ROOT, "tests", "golden");
const PNG_ROOT = join(GOLDEN_DIR, "png");
const MANIFEST = join(GOLDEN_DIR, "manifest.json");

const filterIdx = process.argv.indexOf("--filter");
const FILTER = filterIdx > 0 ? process.argv[filterIdx + 1] : null;

if (!probeBrowser()) process.exit(1);

let projects = discoverProjects();
if (FILTER) projects = projects.filter((p) => p.key.includes(FILTER));
if (!projects.length) {
  console.error("✗ 无可渲染项目（examples/* 或 tests/projects/* 需含 deck.pptd）");
  process.exit(1);
}

// 已有基线（--filter 增量时合并保留其它项目）
const prev = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : null;
const manifest = {
  version: 1,
  generated: new Date().toISOString(),
  scale: 1,
  renderer: "renderer/headless renderDeck（现役旧管线，spec 09 T2）",
  hash: { perceptual: "dHash(9x8) + aHash(8x8)，64-bit hex", exact: "sha256" },
  note: "PNG 本体 gitignore（tests/golden/png/）；本文件只存每页指纹与元数据。",
  projects: prev?.projects ? { ...prev.projects } : {},
};

mkdirSync(PNG_ROOT, { recursive: true });

let totalPages = 0;
const t0 = Date.now();
for (const entry of projects) {
  const pngDir = join(PNG_ROOT, entry.pngDir);
  rmSync(pngDir, { recursive: true, force: true });
  mkdirSync(pngDir, { recursive: true });
  process.stdout.write(`渲染 ${entry.key} … `);
  let res;
  try {
    res = await renderProject(entry, pngDir);
  } catch (e) {
    console.error(`\n✗ ${entry.key} 渲染失败: ${e.message}`);
    process.exit(1);
  }
  const files = res.files.slice().sort();
  const pages = files.map((f, i) => ({ page: i + 1, ...pageFingerprint(f) }));
  manifest.projects[entry.key] = {
    deck: entry.relDeck,
    pngDir: entry.pngDir,
    pageCount: pages.length,
    sourceHash: deckSourceHash(entry),
    size: pages[0] ? [pages[0].w, pages[0].h] : null,
    pages,
  };
  totalPages += pages.length;
  console.log(`${pages.length} 页（${pages[0]?.w}×${pages[0]?.h}）`);
}

manifest.totals = {
  projects: Object.keys(manifest.projects).length,
  pages: Object.values(manifest.projects).reduce((s, p) => s + p.pageCount, 0),
};

mkdirSync(GOLDEN_DIR, { recursive: true });
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1) + "\n", "utf8");

console.log(`\n✓ 基线写入 ${MANIFEST}`);
console.log(`  项目 ${manifest.totals.projects} / 页 ${manifest.totals.pages}（本次重渲 ${projects.length} 套 ${totalPages} 页，${((Date.now() - t0) / 1000).toFixed(1)}s）`);
console.log(`  PNG 目录（gitignore）: ${PNG_ROOT}`);
