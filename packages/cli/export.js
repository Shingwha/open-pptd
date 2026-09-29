// ============================================================================
// cli/export.js — command-line export (Node: load a PPTD project → buildPptx)
// ----------------------------------------------------------------------------
// The only difference from browser export is image loading: here files are read by
// relative path (dataURL also supported) and the writer's byte-signature check is
// reused, keeping the PPTX file safe.
// ============================================================================

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import * as yaml from "../model/vendor/js-yaml.mjs";
import { parseDeck } from "../model/pptd-io.js";
import { collectImageSrcs } from "../model/walk.js";
import { validateDeck } from "../model/validate.js";
import { THEME_PALETTES, mergePaletteColors } from "../model/theme.js";
import { buildPptx, magicMatches } from "../writer/pptx.js";
import { skipReasonText } from "../writer/font.js";
import { decodeDataUrl, imageSize, safeFileName } from "../writer/util.js";
import { ZipWriter } from "../writer/zip.js";
import { paths } from "../paths.js";
import { readFontRegistry, readIconRegistry } from "./resource-status.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
/** Skill root dir (assets/ is located relative to this). */
export const SKILL_ROOT = join(__dirname, "..", "..");

// ----------------------------------------------------------------------------
// Constant split (contract 5): **registry dirs** (in-package, registry.json only,
// version-coupled) are separate from **byte dirs** (large files in home, deletable
// and re-downloadable). Historically both shared FONT_LIB_DIR/ICON_LIB_DIR; after
// resources were externalized they must split: the registry reads from the package
// (home never shadows it), bytes read home-first with package fallback (zero
// migration for existing installs).
// ----------------------------------------------------------------------------
/** Font registry dir inside the package (registry.json only). */
export const FONT_REGISTRY_DIR = join(SKILL_ROOT, "assets", "fonts");
/** Icon registry dir inside the package (registry.json only). */
export const ICON_REGISTRY_DIR = join(SKILL_ROOT, "assets", "icons");
/** Font bytes dir in home (write target). */
export const FONT_BYTES_DIR = paths.fonts;
/** Icon bytes dir in home (write target). */
export const ICON_BYTES_DIR = paths.icons;
/** Compatibility aliases (external scripts/existing callers): semantics = in-package registry dir. */
export const FONT_LIB_DIR = FONT_REGISTRY_DIR;
export const ICON_LIB_DIR = ICON_REGISTRY_DIR;

/** home bytes dir → same-named package dir (read-side fallback map; the read-side mirror of the same-volume rename). */
const READ_FALLBACKS = [
  [FONT_BYTES_DIR, FONT_REGISTRY_DIR],
  [ICON_BYTES_DIR, ICON_REGISTRY_DIR],
];

function fallbackPath(p) {
  const norm = String(p).replace(/\\/g, "/");
  for (const [from, to] of READ_FALLBACKS) {
    const f = String(from).replace(/\\/g, "/").replace(/\/+$/, "");
    const t = String(to).replace(/\\/g, "/").replace(/\/+$/, "");
    if (f === t) continue;
    if (norm === f) return to;
    if (norm.startsWith(f + "/")) return join(to, norm.slice(f.length + 1));
  }
  return null;
}

/**
 * fs injected into the writer: the three-level read is enforced at the resolution
 * layer. The writer loads fonts/icons with `join(fontDir|iconDir, name)` and its
 * logic is frozen, so the fallback happens inside the injected fs: when a file is
 * missing in home (including `registry.json` — by design never in home, only in the
 * package) it reads the same-named package path. The browser branch never goes
 * through this function (Node-only).
 */
export function createResourceFs() {
  return {
    readFileSync(p, ...rest) {
      try {
        return readFileSync(p, ...rest);
      } catch (err) {
        const alt = fallbackPath(p);
        if (alt) return readFileSync(alt, ...rest);
        throw err;
      }
    },
  };
}

const EXT_BY_EXTNAME = { ".png": "png", ".jpg": "jpg", ".jpeg": "jpg", ".gif": "gif" };

/**
 * Read the manifest plus all page files (shared by exportDeck / exportProject / check
 * to avoid duplicate implementations drifting).
 * @param {string} manifest .pptd file path
 * @returns {{ manifestText: string, manifestObj: object, deckDir: string, pageFiles: Map<string,string> }}
 *  pageFiles: page relative path → file text
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

/** Validation-issue location prefix ("page N elementId", either part optional); shared by the check and export gates. */
export function issueLocation(issue) {
  return [issue.page != null ? `第${issue.page}页` : null, issue.elementId].filter(Boolean).join(" ");
}

/** Image loader: a dataURL src is decoded directly, otherwise read as a deck-relative path. */
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
 * Export a project bundle (deck.pptd + pages/*.page + media images → zip).
 * Packs the on-disk files verbatim (no model re-serialization, preserving
 * comments/format); after extraction the editor can open it for further editing.
 * @param {object} opts
 * @param {string} opts.manifest .pptd file path
 * @param {string} [opts.outPath] output zip path (defaults to <deck dir>/<title>-project.zip)
 */
export async function exportProject({ manifest, outPath = null }) {
  const { manifestText, manifestObj, deckDir, pageFiles } = loadProjectFiles(manifest);
  const zip = new ZipWriter();

  // 1. manifest (keeps its original file name)
  zip.add(basename(manifest) || "deck.pptd", manifestText);

  // 2. page files (verbatim)
  const pageRels = [...pageFiles.keys()];
  for (const rel of pageRels) {
    zip.add(rel, pageFiles.get(rel));
  }

  // 3. images (files referenced by page image elements; embedded dataURL needs no work, remote URLs are skipped)
  // pages are parsed one by one (a failure still packs the raw file, only skipping image scan); image collection goes through walk.js
  const pageObjs = [];
  for (const rel of pageRels) {
    try {
      pageObjs.push(yaml.load(pageFiles.get(rel)));
    } catch {
      continue; // a page parse failure still packs the raw file, only skipping image scan
    }
  }
  for (const src of collectImageSrcs(pageObjs)) {
    try {
      zip.add(src, readFileSync(join(deckDir, src)));
    } catch {
      console.warn(`[export-project] 图片缺失，已跳过: ${src}`);
    }
  }

  const bytes = zip.build();
  const finalPath = outPath || join(deckDir, safeFileName(manifestObj?.title || "deck") + "-project.zip");
  writeFileSync(finalPath, bytes);
  return { bytes, outPath: finalPath };
}

/** Export PPTX. Font embedding is handled entirely by the writer: deck.fonts file/url or
 *  a registry reference ({family: <registry name>}) → load bytes from the font library
 *  (home first → package fallback) → subset → EOT embed.
 *  fullFonts=true embeds the full font (skips subsetting; editable after export; maps to --full-fonts). */
export async function exportDeck({ manifest, outPath = null, embedFonts = true, fullFonts = false, theme = null }) {
  const { manifestText, deckDir, pageFiles } = loadProjectFiles(manifest);
  const deck = parseDeck(manifestText, pageFiles);
  // Export preflight gate: an error blocks export, a warning is reported and export continues
  const fontRegistry = readFontRegistry();
  const iconRegistry = readIconRegistry();
  const report = validateDeck(deck, {
    fileExists: (rel) => existsSync(join(deckDir, rel)),
    fontRegistry,
    iconRegistry,
  });
  for (const issue of report.warnings) {
    const at = issueLocation(issue);
    console.warn(`⚠ [${issue.rule}] ${at ? at + " " : ""}${issue.message}`);
  }
  if (report.errors.length) {
    const lines = report.errors.map((issue) => {
      const at = issueLocation(issue);
      return `  ✗ [${issue.rule}] ${at ? at + " " : ""}${issue.message}`;
    });
    throw new Error(`deck 校验未通过（${report.errors.length} 个错误，先用 check 命令排查）:\n${lines.join("\n")}`);
  }
  // --theme <key>: apply a palette preset (an unknown key errors, avoiding a silent wrong-colored export)
  if (theme) {
    const preset = THEME_PALETTES[theme];
    if (!preset) {
      throw new Error(`未知配色预设 "${theme}"，可用: ${Object.keys(THEME_PALETTES).join(" / ")}`);
    }
    // preset keys override, deck's own color keys are kept (a full replacement would turn $gold etc. into unknown tokens)
    deck.theme = { ...(deck.theme || {}), colors: mergePaletteColors(deck.theme?.colors, preset.colors) };
  }
  const skipped = [];
  const skippedIcons = [];
  const bytes = await buildPptx(deck, {
    loadImage: createLoadImage(deckDir),
    embedFonts,
    fullFonts,
    // bytes read home-first → package fallback; registry.json always from the package (registryDir set explicitly)
    fontDir: FONT_BYTES_DIR,
    registryDir: FONT_REGISTRY_DIR,
    fs: createResourceFs(),
    iconRegistry,
    iconDir: ICON_BYTES_DIR,
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
  const finalPath = outPath || join(deckDir, safeFileName(deck.title || "deck") + ".pptx");
  writeFileSync(finalPath, bytes);
  return { bytes, outPath: finalPath, skipped, skippedIcons };
}
