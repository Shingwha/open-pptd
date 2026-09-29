#!/usr/bin/env node
// ============================================================================
// tests/tools/golden-diff.mjs — golden baseline drift comparison (spec 09 T2 / M3 gate)
// ----------------------------------------------------------------------------
// Re-renders the current code through exactly the golden-render flow → compares each page
// fingerprint against tests/golden/manifest.json → reports "match / drift" lists. Drifted
// pages write the current image and a pixel-diff image to tests/golden/out/ for Read review.
//
// Verdict: dHash hamming distance > TOL or aHash > TOL → drift; when the hashes are equal it
// also compares sha256 to record "byte-identical / perceptually identical". Known behavior-change
// pages are registered with --whitelist <file> (a JSON string array: "project/key" or
// "project/key#page"); registered entries count as "known drift" and are not failures.
//
// Usage:
//   node tests/tools/golden-diff.mjs
//   node tests/tools/golden-diff.mjs --whitelist tests/golden/whitelist.json
//   node tests/tools/golden-diff.mjs --filter table     # compare only matching projects
// Exit code: 0 = no unregistered drift; 1 = unregistered drift (or a missing baseline).
// ============================================================================

import { readFileSync, existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  discoverProjects, renderProject, deckSourceHash, pageFingerprint,
  probeBrowser, ROOT,
} from "./golden-run.mjs";
import { decodePng, hamming, encodePng, pixelDiff } from "./golden-lib.mjs";

const DHASH_TOL = 2;
const AHASH_TOL = 2;

const GOLDEN_DIR = join(ROOT, "tests", "golden");
const MANIFEST = join(GOLDEN_DIR, "manifest.json");
const OUT = join(GOLDEN_DIR, "out");
const CURRENT = join(OUT, "current");

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : null;
};
const FILTER = arg("--filter");
const WHITELIST_FILE = arg("--whitelist");

if (!existsSync(MANIFEST)) {
  console.error(`✗ 基线缺失: ${MANIFEST}（先跑 node tests/tools/golden-render.mjs）`);
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));

let whitelist = [];
if (WHITELIST_FILE) {
  if (!existsSync(WHITELIST_FILE)) {
    console.error(`✗ 白名单文件不存在: ${WHITELIST_FILE}`);
    process.exit(1);
  }
  whitelist = JSON.parse(readFileSync(WHITELIST_FILE, "utf8"));
  if (!Array.isArray(whitelist)) {
    console.error("✗ 白名单应为字符串数组");
    process.exit(1);
  }
}
const isWhitelisted = (key, page) => whitelist.includes(key) || whitelist.includes(`${key}#${page}`);

if (!probeBrowser()) process.exit(1);

const projects = discoverProjects().filter((p) => manifest.projects[p.key] && (!FILTER || p.key.includes(FILTER)));

rmSync(CURRENT, { recursive: true, force: true });
mkdirSync(CURRENT, { recursive: true });

const drift = [];
const known = [];
let matchedBytes = 0, matchedPerceptual = 0, compared = 0;
let missingProjects = 0;

for (const entry of projects) {
  const base = manifest.projects[entry.key];
  const pngDir = join(CURRENT, entry.pngDir);
  mkdirSync(pngDir, { recursive: true });
  let res;
  try {
    res = await renderProject(entry, pngDir);
  } catch (e) {
    console.error(`✗ ${entry.key} 重渲失败: ${e.message}`);
    process.exit(1);
  }
  const files = res.files.slice().sort();
  const srcHash = deckSourceHash(entry);
  if (base.sourceHash && srcHash !== base.sourceHash) {
    console.log(`⚠ ${entry.key} 源 deck 已变更（manifest ${base.sourceHash.slice(0, 8)} → ${srcHash.slice(0, 8)}）`);
  }
  if (files.length !== base.pageCount) {
    drift.push({ key: entry.key, page: 0, reason: `页数变化 ${base.pageCount} → ${files.length}` });
    continue;
  }
  for (let i = 0; i < files.length; i++) {
    compared++;
    const cur = pageFingerprint(files[i]);
    const exp = base.pages[i];
    const dd = hamming(cur.dHash, exp.dHash);
    const da = hamming(cur.aHash, exp.aHash);
    const exact = cur.sha256 === exp.sha256;
    if (exact) { matchedBytes++; matchedPerceptual++; continue; }
    if (dd <= DHASH_TOL && da <= AHASH_TOL) { matchedPerceptual++; continue; }
    const item = {
      key: entry.key, page: i + 1,
      reason: `dHash Δ${dd} / aHash Δ${da}`,
      whitelisted: isWhitelisted(entry.key, i + 1),
      curPng: files[i],
    };
    (item.whitelisted ? known : drift).push(item);
    // Persist visualization artifacts
    try {
      const basePng = join(GOLDEN_DIR, "png", base.pngDir, `deck-${String(i + 1).padStart(2, "0")}.png`);
      writeFileSync(join(OUT, `${entry.pngDir}-p${String(i + 1).padStart(2, "0")}-current.png`), readFileSync(files[i]));
      if (existsSync(basePng)) {
        const a = decodePng(readFileSync(basePng));
        const b = decodePng(readFileSync(files[i]));
        const d = pixelDiff(a, b);
        writeFileSync(join(OUT, `${entry.pngDir}-p${String(i + 1).padStart(2, "0")}-diff.png`), encodePng(d.width, d.height, d.rgb));
        item.changedPixels = d.changed;
      }
    } catch (e) {
      item.diffError = e.message;
    }
  }
}

// Projects present in the baseline but not in the current discovery (directory deleted) must also be reported
for (const key of Object.keys(manifest.projects)) {
  if (FILTER && !key.includes(FILTER)) continue;
  if (!projects.some((p) => p.key === key)) { missingProjects++; drift.push({ key, page: 0, reason: "项目目录缺失（基线存在）" }); }
}

console.log(`\n黄金 diff：比对 ${projects.length} 项目 / ${compared} 页`);
console.log(`  ✓ 字节一致 ${matchedBytes} 页；感知一致 ${matchedPerceptual - matchedBytes} 页`);
if (known.length) {
  console.log(`  ◆ 已知漂移（白名单）${known.length} 页：`);
  for (const d of known) console.log(`      ${d.key}#${d.page} ${d.reason}${d.changedPixels != null ? `（变化像素 ${d.changedPixels}）` : ""}`);
}
if (drift.length) {
  console.error(`  ✗ 未登记漂移 ${drift.length} 处：`);
  for (const d of drift) console.error(`      ${d.key}${d.page ? "#" + d.page : ""} ${d.reason}`);
  console.error(`  可视化产物（current/diff PNG）: ${OUT}`);
} else {
  console.log("  ✓ 无未登记漂移");
}
process.exit(drift.length ? 1 : 0);
