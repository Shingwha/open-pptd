// ============================================================================
// tests/isolate.mjs — 逐组件隔离导出（定位 PowerPoint 弹「修复」的组件）
// ----------------------------------------------------------------------------
// 原理：把 tests/projects/isolation 项目的每一页单独导出为一个独立 PPTX
// （iso-01.pptx ~ iso-14.pptx），用户逐个用 PowerPoint 打开：
//   哪个文件弹修复 → 对应页面的组件类型就是问题源。
// 用法：node tests/isolate.mjs [输出目录，默认 tests/out/]
// ============================================================================

import { readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve, extname } from "node:path";
import yaml from "../editor/vendor/js-yaml.mjs";
import { normalizeTheme } from "../editor/core/theme.js";
import { buildPptx, magicMatches } from "../editor/writer/pptx.js";
import { createDeck } from "../editor/core/model.js";

const projectDir = resolve("tests/projects/isolation");
const outDir = resolve(process.argv[2] || "tests/out");
mkdirSync(outDir, { recursive: true });

const EXT_BY_EXTNAME = { ".png": "png", ".jpg": "jpg", ".jpeg": "jpg", ".gif": "gif" };
/** 命令行加载图片：相对项目目录读文件（与 lib/pptd-export.js createLoadImage 一致）。 */
function loadImage(src) {
  if (typeof src !== "string" || !src) return null;
  const ext = EXT_BY_EXTNAME[extname(src).toLowerCase()];
  if (!ext) return null;
  try {
    const bytes = readFileSync(join(projectDir, src));
    if (!magicMatches(bytes, ext)) return null;
    return { bytes, ext, size: [240, 120] };
  } catch {
    return null;
  }
}

const deck = yaml.load(readFileSync(join(projectDir, "deck.pptd"), "utf8"));
const theme = normalizeTheme(deck.theme);

let exported = 0;
for (let i = 0; i < deck.pages.length; i++) {
  const rel = deck.pages[i];
  const pagePath = join(projectDir, rel);
  if (!existsSync(pagePath)) {
    console.log(`✗ 缺页面文件: ${rel}`);
    continue;
  }
  const page = yaml.load(readFileSync(pagePath, "utf8"));
  const single = createDeck({ title: `iso-${String(i + 1).padStart(2, "0")}`, size: deck.size, theme: deck.theme, pages: [page] });
  const bytes = await buildPptx(single, { loadImage });
  const name = `iso-${String(i + 1).padStart(2, "0")}.pptx`;
  writeFileSync(join(outDir, name), bytes);
  console.log(`✓ ${name}  ← ${rel}`);
  exported++;
}

console.log(`\n共导出 ${exported} 个隔离文件 → ${outDir}`);
console.log("请逐个用 PowerPoint 打开：弹修复的文件即问题组件（对照上面的页面编号）。");
