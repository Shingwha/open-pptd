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

import { mkdirSync, writeFileSync, existsSync, rmSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { discoverProjects, renderProject, deckSourceHash, pageFingerprint, probeBrowser, ROOT } from "./golden-run.mjs";
import { decodePng } from "./golden-lib.mjs";

const GOLDEN_DIR = join(ROOT, "tests", "golden");
const PNG_ROOT = join(GOLDEN_DIR, "png");
const MANIFEST = join(GOLDEN_DIR, "manifest.json");

const filterIdx = process.argv.indexOf("--filter");
const FILTER = filterIdx > 0 ? process.argv[filterIdx + 1] : null;

/**
 * Sanity gate (D8): every rendered page must be a non-empty PNG at exactly the deck's
 * declared size and must contain at least one non-white pixel. A failure aborts the
 * rebaseline before manifest.json is written — a broken render must never become a
 * golden baseline.
 * @param {string} file PNG path
 * @param {[number, number]} size declared deck size [w, h]
 * @param {string} key project key (for messages)
 */
function assertSanity(file, size, key) {
  const bytes = statSync(file).size;
  if (!bytes) throw new Error(`${key} ${file} 为空文件`);
  const img = decodePng(readFileSync(file));
  if (img.width !== size[0] || img.height !== size[1]) {
    throw new Error(`${key} ${file} 尺寸 ${img.width}×${img.height} != deck.size ${size[0]}×${size[1]}`);
  }
  const { data, channels } = img;
  let nonWhite = 0;
  for (let i = 0; i < data.length; i += channels) {
    const opaque = channels < 4 || data[i + 3] >= 8;
    if (opaque && (data[i] < 250 || data[i + 1] < 250 || data[i + 2] < 250)) { nonWhite += 1; break; }
  }
  if (!nonWhite) throw new Error(`${key} ${file} 全白页（无有效像素）`);
}

/** Declared deck size from the manifest source (size: [w, h]); defaults to 960×540. */
function deckSizeOf(entry) {
  const m = readFileSync(entry.deck, "utf8").match(/^\s*size:\s*\[\s*(\d+)\s*,\s*(\d+)\s*\]/m);
  return m ? [Number(m[1]), Number(m[2])] : [960, 540];
}

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
  if (!files.length) {
    console.error(`\n✗ ${entry.key} 未渲染出任何页面（页数必须 > 0）`);
    process.exit(1);
  }
  const deckSize = deckSizeOf(entry);
  try {
    for (const f of files) assertSanity(f, deckSize, entry.key);
  } catch (e) {
    console.error(`\n✗ 尺寸/空白 sanity gate 失败: ${e.message}`);
    console.error("  中止 rebaseline；manifest.json 未写入。");
    process.exit(1);
  }
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
