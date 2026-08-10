// ============================================================================
// tests/isolate.mjs — 逐组件/逐页隔离导出（定位 PowerPoint 弹「修复」的来源）
// ----------------------------------------------------------------------------
// 原理：把 tests/projects/ 下每个组件项目（text/shape/line/image/icon/table/
// chart…）的每一页单独导出为一个独立 PPTX（iso-<项目>-NN.pptx），
// 用户逐个用 PowerPoint 打开：哪个文件弹修复 → 对应项目页面的组件就是问题源。
// 用法：node tests/isolate.mjs [输出目录，默认 tests/out/]
// ============================================================================

import { readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, resolve, extname } from "node:path";
import yaml from "../editor/vendor/js-yaml.mjs";
import { normalizeTheme } from "../editor/core/theme.js";
import { buildPptx, magicMatches } from "../editor/writer/pptx.js";
import { createDeck } from "../editor/core/model.js";

const projectsDir = resolve("tests/projects");
// 输出到每个项目自己的 out/ 目录（tests/projects/<项目>/out/iso-<项目>-NN.pptx）
const argOut = process.argv[2] ? resolve(process.argv[2]) : null;

const EXT_BY_EXTNAME = { ".png": "png", ".jpg": "jpg", ".jpeg": "jpg", ".gif": "gif" };

/** 命令行加载图片：相对项目目录读文件（与 lib/pptd-export.js createLoadImage 一致）。 */
function loadImageFor(projectDir) {
  return (src) => {
    if (typeof src !== "string" || !src) return null;
    const ext = EXT_BY_EXTNAME[extname(src).toLowerCase()];
    if (!ext) return null;
    try {
      const bytes = readFileSync(join(projectDir, src));
      if (!magicMatches(bytes, ext)) return null;
      // 真实尺寸（PNG/JPEG/GIF 头部解析，供 contain/cover 计算）
      return { bytes, ext, size: imageSize(bytes, ext) };
    } catch {
      return null;
    }
  };
}

/** 解析图片原始尺寸（PNG IHDR / JPEG SOF / GIF 逻辑屏幕）。 */
function imageSize(bytes, ext) {
  try {
    if (ext === "png" && bytes.length > 24) {
      return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
    }
    if (ext === "gif" && bytes.length > 10) {
      return [bytes.readUInt16LE(6), bytes.readUInt16LE(8)];
    }
    if (ext === "jpg") {
      let i = 2;
      while (i + 9 < bytes.length) {
        if (bytes[i] !== 0xff) { i++; continue; }
        const marker = bytes[i + 1];
        if (marker === 0xd8 || marker === 0xd9) { i += 2; continue; }
        const len = bytes.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return [bytes.readUInt16BE(i + 7), bytes.readUInt16BE(i + 5)];
        }
        i += 2 + len;
      }
    }
  } catch { /* 尺寸未知时降级 null */ }
  return null;
}

let exported = 0;
const projects = readdirSync(projectsDir)
  .filter((name) => statSync(join(projectsDir, name)).isDirectory())
  .sort();

for (const name of projects) {
  const projectDir = join(projectsDir, name);
  const deckPath = join(projectDir, "deck.pptd");
  if (!existsSync(deckPath)) continue;
  // 每个项目的产物输出到它自己的 out/ 目录
  const outDir = argOut || join(projectDir, "out");
  mkdirSync(outDir, { recursive: true });
  const deck = yaml.load(readFileSync(deckPath, "utf8"));
  const theme = normalizeTheme(deck.theme);
  for (let i = 0; i < deck.pages.length; i++) {
    const rel = deck.pages[i];
    const pagePath = join(projectDir, rel);
    if (!existsSync(pagePath)) {
      console.log(`✗ 缺页面文件: ${name}/${rel}`);
      continue;
    }
    const page = yaml.load(readFileSync(pagePath, "utf8"));
    const single = createDeck({
      title: `iso-${name}-${String(i + 1).padStart(2, "0")}`,
      size: deck.size,
      theme: deck.theme,
      pages: [page],
    });
    const bytes = await buildPptx(single, { theme, loadImage: loadImageFor(projectDir) });
    const file = `iso-${name}-${String(i + 1).padStart(2, "0")}.pptx`;
    writeFileSync(join(outDir, file), bytes);
    console.log(`✓ ${file}  ← ${name}/${rel}`);
    exported++;
  }
}

console.log(`\n共导出 ${exported} 个隔离文件 → ${projects.join(", ")} 各自 out/ 目录`);
console.log("请逐个用 PowerPoint 打开：弹修复的文件即问题组件（对照上面的项目/页编号）。");
