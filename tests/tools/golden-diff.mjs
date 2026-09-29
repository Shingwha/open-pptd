#!/usr/bin/env node
// ============================================================================
// tests/tools/golden-diff.mjs — 黄金基线漂移比对（spec 09 T2 / M3 守门）
// ----------------------------------------------------------------------------
// 按与 golden-render 完全相同的流程重渲当前代码 → 与 tests/golden/manifest.json
// 的每页指纹比对 → 输出"一致 / 漂移"清单。漂移页把当前图与像素差图落
// tests/golden/out/ 供 Read 目检。
//
// 判定：dHash 汉明距离 > TOL 或 aHash > TOL → 漂移；相等哈希再比 sha256 记
// "字节一致 / 感知一致"。已知行为变更页用 --whitelist <file>（JSON 字符串数组：
// "project/key" 或 "project/key#page"）登记，登记项计为"已知漂移"不计失败。
//
// 用法：
//   node tests/tools/golden-diff.mjs
//   node tests/tools/golden-diff.mjs --whitelist tests/golden/whitelist.json
//   node tests/tools/golden-diff.mjs --filter table     # 只比对匹配项目
// 退出码：0 = 无未登记漂移；1 = 有未登记漂移（或基线缺失）。
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
    // 落可视化产物
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

// 基线里有、当前发现里没有的项目（目录被删）也要报
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
