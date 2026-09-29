// ============================================================================
// cli/fonts.js — fonts subcommand: built-in font library management
// ----------------------------------------------------------------------------
// Font library locations: the registry is read from the **in-package**
// `assets/fonts/registry.json` (version-coupled, never shadowed by home); font bytes
// are read from home (`~/.open-pptd/assets/fonts`) first, with an in-package read-only
// fallback; downloads write home only, atomically (see cli/download.js).
//   fonts list                 view the built-in font library (status ✓/✗)
//   fonts download <name|all>  fetch one/all font files (compatibility alias, backed by the downloader)
//   fonts check <deck.pptd>    validate the deck's font declarations (embedded / declared-only / missing)
// ============================================================================

import { existsSync, readFileSync } from "node:fs";
import * as yaml from "../model/vendor/js-yaml.mjs";
import { parseFontResources } from "../model/font.js";
import { findFont, findSystemFont } from "../model/font-registry.js";
import { readFontRegistry, fontFileReady } from "./resource-status.js";
import { downloadFonts } from "./download.js";

const CAT_LABEL = { sans: "黑体", serif: "宋/衬线", handwriting: "手写/书法", display: "标题/艺术", pixel: "像素" };

function fontStatus(f) {
  return fontFileReady(f) ? "✓" : "✗";
}

async function fontsList() {
  const reg = readFontRegistry();
  const byCat = {};
  for (const f of reg.fonts) (byCat[f.category] ||= []).push(f);
  console.log(`内置字体库 ${reg.fonts.length} 种（全部免费商用，默认子集化嵌入）\n`);
  for (const [cat, list] of Object.entries(byCat)) {
    console.log(`【${CAT_LABEL[cat] || cat}】`);
    for (const f of list) {
      console.log(`  ${fontStatus(f)} ${f.key.padEnd(14)} ${f.family.padEnd(28)} ${(f.size / 1024 / 1024).toFixed(1)}MB  ${f.license}`);
    }
    console.log();
  }
  if (reg.systemFonts?.length) {
    console.log(`系统字体 ${reg.systemFonts.length} 种（仅声明不嵌入，依赖打开方系统已装）\n`);
    for (const f of reg.systemFonts) {
      console.log(`  ○ ${f.key.padEnd(12)} ${f.family.padEnd(24)} ${f.platform.padEnd(18)} ${f.style}`);
    }
    console.log();
  }
  console.log("用法：deck.fonts 资源项写 {family: <注册名>} 即自动嵌入；fonts download <名称|all> 可补下载。");
}

async function fontsDownload(name) {
  const reg = readFontRegistry();
  const { ok, total, notFound } = await downloadFonts(reg, name);
  if (notFound) {
    console.error(`✗ 未找到匹配“${name}”的字体（用 fonts list 查看全表）`);
    process.exit(1);
  }
  console.log(`\n完成：${ok}/${total}`);
}

async function fontsCheck(manifest) {
  if (!existsSync(manifest)) {
    console.error(`✗ 文件不存在: ${manifest}`);
    process.exit(1);
  }
  const deck = yaml.load(readFileSync(manifest, "utf8"));
  const reg = readFontRegistry();
  const resources = parseFontResources(deck?.fonts);
  const entries = Object.entries(resources);
  if (!entries.length) {
    console.log("deck 未声明字体资源（deck.fonts 为空），不会嵌入任何字体。");
    return;
  }
  console.log(`检查 ${manifest} 的字体声明（${entries.length} 项）:\n`);
  for (const [key, res] of entries) {
    const family = res.family || res.name || key;
    const hit = findFont(reg, family);
    if (hit) {
      const fileOk = fontFileReady(hit);
      console.log(`  ${fileOk ? "✓" : "✗"} ${key.padEnd(12)} → 注册表命中: ${hit.family}（${hit.file}${fileOk ? "" : " 缺失,需 fonts download"}）→ 将嵌入${hit.subset ? "(子集化)" : ""}`);
    } else {
      const sys = findSystemFont(reg, family);
      if (sys) {
        console.log(`  ○ ${key.padEnd(12)} → 系统字体: ${sys.family}（${sys.platform}；仅声明不嵌入，需打开方系统已装）`);
      } else {
        console.log(`  ○ ${key.padEnd(12)} → 未命中注册表: ${family}（仅声明，不嵌入；需系统已装该字体）`);
      }
    }
  }
  console.log("\n提示：注册表引用写法 fonts: {title: {family: <注册名>}}；未命中注册表的 family 视为系统字体。");
}

/** fonts subcommand entry. */
export async function runFonts(args) {
  const sub = args[0] || "list";
  if (sub === "list") {
    await fontsList();
  } else if (sub === "download") {
    await fontsDownload(args[1] || "all");
  } else if (sub === "check") {
    await fontsCheck(args[1]);
  } else {
    return false; // unknown subcommand; caller prints usage
  }
  return true;
}
