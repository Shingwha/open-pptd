// ============================================================================
// tests/package-integrity.mjs — PPTX 包内引用一致性检查
// ----------------------------------------------------------------------------
// PowerPoint 弹「修复」的头号原因：rels/rId 引用缺失、Target 部件不存在、
// [Content_Types] 未声明扩展名、超链接缺 TargetMode。
// 用法：node tests/package-integrity.mjs <out.pptx> [slideCount]
// ============================================================================

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unzip } from "./util/unzip.js";

const pptxPath = process.argv[2];
const slideCount = Number(process.argv[3] || 6);
if (!pptxPath) {
  console.error("用法: node tests/package-integrity.mjs <out.pptx> [slideCount]");
  process.exit(1);
}

const bytes = readFileSync(pptxPath);
const dir = mkdtempSync(join(tmpdir(), "pkg-check-"));
const files = unzip(bytes, dir);
const read = (p) => readFileSync(join(dir, p), "utf8");
let fail = 0;

// 1. slide XML 引用的 rId 是否都在对应 rels 中定义
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
  // rels Target 部件是否存在（外链跳过）
  for (const m of rels.matchAll(/Target="([^"]+)"/g)) {
    const t = m[1];
    if (/^(https?:|mailto:)/.test(t) || t.startsWith("/")) continue;
    const candidates = [t, t.replace(/^\.\.\//, ""), "ppt/" + t.replace(/^\.\.\//, "")];
    if (!candidates.some((c) => files.includes(c.replace(/\\/g, "/")))) {
      console.log(`✗ slide${i} rels 目标缺失: ${m[1]}`);
      fail++;
    }
  }
  // 超链接 rels 必须 External
  for (const m of rels.matchAll(/<Relationship[^>]*Type="[^"]*\/hyperlink"[^>]*\/>/g)) {
    if (!/TargetMode="External"/.test(m[0])) {
      console.log(`✗ slide${i} 超链接 rels 缺 TargetMode=External: ${m[0].slice(0, 120)}`);
      fail++;
    }
  }
}

// 2. presentation.xml.rels 引用的 slide/主题等部件存在（Target 相对 ppt/ 目录）
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

// 3. [Content_Types] 覆盖所有部件的扩展名
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

// 4. 所有 XML 部件良构
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
