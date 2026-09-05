// ============================================================================
// cli/export.js — 命令行导出（Node 环境：加载 PPTD 项目 → buildPptx）
// ----------------------------------------------------------------------------
// 与浏览器导出的差异只在图片加载：这里按相对路径读文件（dataURL 同样支持），
// 并复用 writer 的字节签名校验，保证 PPT 文件安全。
// ============================================================================

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import * as yaml from "../model/vendor/js-yaml.mjs";
import { parseDeck } from "../model/pptd-io.js";
import { walkElements } from "../model/walk.js";
import { validateDeck } from "../model/validate.js";
import { THEME_PALETTES, mergePaletteColors } from "../model/theme.js";
import { buildPptx, magicMatches } from "../writer/pptx.js";
import { skipReasonText } from "../writer/font.js";
import { decodeDataUrl, imageSize } from "../writer/util.js";
import { ZipWriter } from "../writer/zip.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
/** 技能根目录（assets/fonts 内置字体库相对此定位）。 */
export const SKILL_ROOT = join(__dirname, "..", "..");
export const FONT_LIB_DIR = join(SKILL_ROOT, "assets", "fonts");
export const ICON_LIB_DIR = join(SKILL_ROOT, "assets", "icons");

const EXT_BY_EXTNAME = { ".png": "png", ".jpg": "jpg", ".jpeg": "jpg", ".gif": "gif" };

/**
 * 读取 manifest + 全部页面文件（exportDeck / exportProject / check 共用，避免双份实现漂移）。
 * @param {string} manifest .pptd 文件路径
 * @returns {{ manifestText: string, manifestObj: object, deckDir: string, pageFiles: Map<string,string> }}
 *  pageFiles: 页面相对路径 → 文件文本
 */
export function loadProjectFiles(manifest) {
  const manifestText = readFileSync(manifest, "utf8");
  const deckDir = dirname(manifest);
  const manifestObj = yaml.load(manifestText);
  const pageFiles = new Map();
  for (const rel of manifestObj?.pages || []) {
    pageFiles.set(String(rel), readFileSync(join(deckDir, String(rel)), "utf8"));
  }
  return { manifestText, manifestObj, deckDir, pageFiles };
}

/** 图片加载器：src 为 dataURL 直接解码，否则按 deck 目录相对路径读文件。 */
function createLoadImage(deckDir) {
  return (src) => {
    if (typeof src !== "string" || !src) return null;
    let bytes;
    let ext;
    if (src.startsWith("data:")) {
      const decoded = decodeDataUrl(src);
      if (!decoded) return null;
      bytes = decoded.bytes;
      ext = decoded.ext;
    } else {
      ext = EXT_BY_EXTNAME[extname(src).toLowerCase()];
      if (!ext) return null;
      try {
        bytes = readFileSync(join(deckDir, src));
      } catch {
        return null;
      }
    }
    if (!magicMatches(bytes, ext)) return null;
    return { bytes, ext, size: imageSize(bytes) };
  };
}

/**
 * 导出项目包（deck.pptd + pages/*.page + media 图片 → zip）。
 * 原样打包磁盘文件（不经模型重序列化，保留注释/格式），解压后可直接被编辑器打开继续编辑。
 * @param {object} opts
 * @param {string} opts.manifest .pptd 文件路径
 * @param {string} [opts.outPath] 输出 zip 路径（缺省 <deck 目录>/<标题>-project.zip）
 */
export async function exportProject({ manifest, outPath = null }) {
  const { manifestText, manifestObj, deckDir, pageFiles } = loadProjectFiles(manifest);
  const zip = new ZipWriter();

  // 1. manifest（保留原文件名）
  zip.add(basename(manifest) || "deck.pptd", manifestText);

  // 2. 页面文件（原样）
  const pageRels = [...pageFiles.keys()];
  for (const rel of pageRels) {
    zip.add(rel, pageFiles.get(rel));
  }

  // 3. 图片（页面 image 元素引用的相对路径文件；dataURL 内嵌无需处理，远程 URL 跳过）
  const seen = new Set();
  for (const rel of pageRels) {
    let pageObj = null;
    try {
      pageObj = yaml.load(pageFiles.get(rel));
    } catch {
      continue; // 页面解析失败仍打包原文件，仅跳过图片扫描
    }
    walkElements([pageObj], (el) => {
      const src = el?.src;
      if (el?.elementType !== "image" || typeof src !== "string") return;
      if (src.startsWith("data:") || /^https?:/.test(src) || seen.has(src)) return;
      seen.add(src);
      try {
        zip.add(src, readFileSync(join(deckDir, src)));
      } catch (err) {
        console.warn(`[export-project] 图片缺失，已跳过: ${src}`);
      }
    });
  }

  const bytes = zip.build();
  const finalPath = outPath || join(deckDir, (manifestObj?.title || "deck").replace(/[\\/:*?"<>|]/g, "_") + "-project.zip");
  writeFileSync(finalPath, bytes);
  return { bytes, outPath: finalPath };
}

/** 导出 PPTX。字体嵌入统一由 writer 处理：deck.fonts 的 file/url 或注册表引用
 *  （{family: <注册名>}）→ 从内置字体库（FONT_LIB_DIR）取字 → 子集化 → EOT 嵌入。 */
export async function exportDeck({ manifest, outPath = null, embedFonts = true, theme = null }) {
  const { manifestText, deckDir, pageFiles } = loadProjectFiles(manifest);
  const deck = parseDeck(manifestText, pageFiles);
  // 导出前置闸门（v3 §4.4）：error 阻断导出，warning 报告后继续
  const fontRegistry = JSON.parse(readFileSync(join(FONT_LIB_DIR, "registry.json"), "utf8"));
  const iconRegistry = JSON.parse(readFileSync(join(ICON_LIB_DIR, "registry.json"), "utf8"));
  const report = validateDeck(deck, {
    fileExists: (rel) => existsSync(join(deckDir, rel)),
    fontRegistry,
    iconRegistry,
  });
  for (const issue of report.warnings) {
    const at = [issue.page != null ? `第${issue.page}页` : null, issue.elementId].filter(Boolean).join(" ");
    console.warn(`⚠ [${issue.rule}] ${at ? at + " " : ""}${issue.message}`);
  }
  if (report.errors.length) {
    const lines = report.errors.map((issue) => {
      const at = [issue.page != null ? `第${issue.page}页` : null, issue.elementId].filter(Boolean).join(" ");
      return `  ✗ [${issue.rule}] ${at ? at + " " : ""}${issue.message}`;
    });
    throw new Error(`deck 校验未通过（${report.errors.length} 个错误，先用 check 命令排查）:\n${lines.join("\n")}`);
  }
  // --theme <key>：应用配色预设（未知键报错，避免静默导出错误配色）
  if (theme) {
    const preset = THEME_PALETTES[theme];
    if (!preset) {
      throw new Error(`未知配色预设 "${theme}"，可用: ${Object.keys(THEME_PALETTES).join(" / ")}`);
    }
    // 预设键覆盖，deck 自定义色键保留（整套替换会令 $gold 等自有引用全部 unknown token）
    deck.theme = { ...(deck.theme || {}), colors: mergePaletteColors(deck.theme?.colors, preset.colors) };
  }
  const skipped = [];
  const skippedIcons = [];
  const bytes = await buildPptx(deck, {
    loadImage: createLoadImage(deckDir),
    embedFonts,
    fontDir: FONT_LIB_DIR,
    fs: { readFileSync },
    iconRegistry,
    iconDir: ICON_LIB_DIR,
    onFontSkipped: (list) => skipped.push(...list),
    onIconSkipped: (list) => skippedIcons.push(...list),
  });
  if (skipped.length) {
    console.warn(`⚠ ${skipped.length} 个字体未嵌入（打开时可能回退系统字体）:`);
    for (const s of skipped) console.warn(`   - ${skipReasonText(s)}`);
  }
  if (skippedIcons.length) {
    console.warn(`⚠ ${skippedIcons.length} 个图标未导出（名字未命中免费库或 SVG 获取失败）:`);
    for (const s of skippedIcons) console.warn(`   - ${s.iconName}（${s.reason === "unknown-name" ? "未命中 FA 免费库" : "SVG 获取失败"}）`);
  }
  const finalPath = outPath || join(deckDir, (deck.title || "deck").replace(/[\\/:*?"<>|]/g, "_") + ".pptx");
  writeFileSync(finalPath, bytes);
  return { bytes, outPath: finalPath };
}
