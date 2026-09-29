// ============================================================================
// tests/regression/package-integrity.mjs — PPTX in-package reference integrity
// ----------------------------------------------------------------------------
// The top cause of PowerPoint's "repair" prompt: missing rels/rId references,
// a rels Target part that does not exist, an extension not declared in
// [Content_Types], or a hyperlink without TargetMode.
// Usage: node tests/regression/package-integrity.mjs <out.pptx> [slideCount]
// ============================================================================

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unzip } from "../lib/unzip.js";

const pptxPath = process.argv[2];
const slideCount = Number(process.argv[3] || 6);
if (!pptxPath) {
  console.error("用法: node tests/regression/package-integrity.mjs <out.pptx> [slideCount]");
  process.exit(1);
}

const bytes = readFileSync(pptxPath);
const dir = mkdtempSync(join(tmpdir(), "pkg-check-"));
const files = unzip(bytes, dir);
const read = (p) => readFileSync(join(dir, p), "utf8");
let fail = 0;

// 1. Every rId referenced by slide XML must be defined in the matching rels
for (let i = 1; i <= slideCount; i++) {
  const slide = read(`ppt/slides/slide${i}.xml`);
  const rels = read(`ppt/slides/_rels/slide${i}.xml.rels`);
  const refs = [...slide.matchAll(/\br:(?:embed|id|link)="(rId\d+)"/g)].map((m) => m[1]);
  const defined = [...rels.matchAll(/Id="(rId\d+)"/g)].map((m) => m[1]);
  for (const r of [...new Set(refs)]) {
    if (!defined.includes(r)) {
      console.log(`✗ slide${i} 引用未定义: ${r}`);
      fail++;
    }
  }
  // rels Target part must exist (external links skipped)
  for (const m of rels.matchAll(/Target="([^"]+)"/g)) {
    const t = m[1];
    if (/^(https?:|mailto:)/.test(t) || t.startsWith("/")) continue;
    const candidates = [t, t.replace(/^\.\.\//, ""), "ppt/" + t.replace(/^\.\.\//, "")];
    if (!candidates.some((c) => files.includes(c.replace(/\\/g, "/")))) {
      console.log(`✗ slide${i} rels 目标缺失: ${m[1]}`);
      fail++;
    }
  }
  // Hyperlink rels must be External
  for (const m of rels.matchAll(/<Relationship[^>]*Type="[^"]*\/hyperlink"[^>]*\/>/g)) {
    if (!/TargetMode="External"/.test(m[0])) {
      console.log(`✗ slide${i} 超链接 rels 缺 TargetMode=External: ${m[0].slice(0, 120)}`);
      fail++;
    }
  }
}

// 1.5 notesSlide back-reference: slideN → notesSlideX must exist, and notesSlideX's rels
// must point back to slideN (catches both a missing reference and a note attached to the wrong page)
for (const f of files.filter((f) => f.startsWith("ppt/slides/_rels/") && f.endsWith(".rels"))) {
  const i = f.match(/slide(\d+)\.xml\.rels$/)?.[1];
  if (!i) continue;
  const rels = read(f);
  const m = rels.match(/notesSlide(\d+)\.xml/);
  if (!m) continue; // no notes on this page
  const x = m[1];
  const notesFile = `ppt/notesSlides/notesSlide${x}.xml`;
  if (!files.includes(notesFile)) {
    console.log(`✗ slide${i} 备注引用缺失: ${notesFile}`);
    fail++;
    continue;
  }
  const notesRels = read(`ppt/notesSlides/_rels/notesSlide${x}.xml.rels`);
  if (!new RegExp(`Target="\\.\\./slides/slide${i}\\.xml"`).test(notesRels)) {
    console.log(`✗ slide${i} → notesSlide${x} 回指不符（notesSlide${x}.rels 未指向 slide${i}.xml，备注可能错位）`);
    fail++;
  }
}

// 1.6 chart child-element order (ECMA-376 CT_BarChart: gapWidth must precede overlap)
for (const f of files.filter((f) => /^ppt\/charts\/chart\d+\.xml$/.test(f))) {
  const xml = read(f);
  for (const m of xml.matchAll(/<c:barChart>([\s\S]*?)<\/c:barChart>/g)) {
    const inner = m[1];
    const gi = inner.indexOf("<c:gapWidth");
    const oi = inner.indexOf("<c:overlap");
    if (gi !== -1 && oi !== -1 && gi > oi) {
      console.log(`✗ ${f} barChart 子元素顺序错误：overlap 在 gapWidth 之前（ECMA-376 要求 gapWidth → overlap）`);
      fail++;
    }
  }
}

// 2. Parts referenced by presentation.xml.rels (slides/theme/...) must exist (Target relative to ppt/)
const prez = read("ppt/_rels/presentation.xml.rels");
for (const m of prez.matchAll(/Target="([^"]+)"/g)) {
  const t = m[1];
  if (/^https?:/.test(t)) continue;
  const p = ("ppt/" + t).replace(/\\/g, "/");
  if (!files.includes(p)) {
    console.log(`✗ presentation rels 目标缺失: ${m[1]}`);
    fail++;
  }
}

// 3. [Content_Types] covers every part's extension
const ct = read("[Content_Types].xml");
for (const f of files) {
  if (f === "[Content_Types].xml" || f === "_rels/.rels") continue;
  const base = f.split("/").pop();
  const ext = base.includes(".") ? base.split(".").pop() : "";
  if (!ext) continue;
  if (!ct.includes(`Extension="${ext}"`)) {
    console.log(`✗ [Content_Types] 缺扩展名: ${ext} (${f})`);
    fail++;
  }
}

// 4. All XML parts are well-formed / readable
for (const f of files.filter((f) => f.endsWith(".xml") || f.endsWith(".rels"))) {
  try {
    read(f);
  } catch (e) {
    console.log(`✗ 部件不可读: ${f} ${e.message}`);
    fail++;
  }
}

console.log(fail === 0 ? "✓ 包内引用一致性全部通过" : `✗ ${fail} 处不一致`);
rmSync(dir, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
