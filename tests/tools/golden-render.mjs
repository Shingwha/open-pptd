#!/usr/bin/env node
// ============================================================================
// tests/tools/golden-render.mjs — golden baseline generation (spec 09 T2)
// ----------------------------------------------------------------------------
// Uses the live pipeline (renderer/headless renderDeck + local Chrome/Edge) to render
// every page of all examples (15) and tests/projects (9) to PNG:
//   tests/golden/png/<source>__<name>/deck-NN.png   (gitignored, not committed)
//   tests/golden/manifest.json                       (per-page dHash/aHash + size +
//                                                     source deck hash, committed)
// Only the perceptual hashes + metadata are committed; the PNG bodies are large and gitignored.
//
// Usage:
//   node tests/tools/golden-render.mjs               # rebuild the whole baseline
//   node tests/tools/golden-render.mjs --filter chart  # rebuild matching projects only (careful: replaces a baseline subset)
// Depends on a local Chrome/Edge (SMOKE_CHROME can point at it); web fonts are fetched as needed
// (same as CLI render).
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

// Existing baseline (a --filter incremental run merges and keeps the other projects)
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
