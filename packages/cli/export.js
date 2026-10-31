// ============================================================================
// cli/export.js — command-line export (Node adapter over ExportService)
// ----------------------------------------------------------------------------
// The command surface and human output are unchanged (W10 owns the new face):
//   · export          → ExportService format:"pptx"
//   · export-project  → ExportService format:"bundle", bundleMode:"raw"
// Node-only work that stays here is exactly the adapter layer: disk ProjectSource,
// fs/registry ResourceProvider, file sink and the CLI's warnings/exit contract.
// Validation, report assembly, zip and naming are no longer duplicated here.
// ============================================================================

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as yaml from "../model/vendor/js-yaml.mjs";
import { safeFileName } from "../writer/index.js";
import { skipReasonText } from "../writer/font.js";
import { paths, FONT_REGISTRY_DIR, ICON_REGISTRY_DIR } from "../paths.js";
import { createDiskProjectSource, createFsResourceProvider } from "../server/runtime-node.js";
import { createProject } from "../runtime/index.js";
import { exportProject as runExport, formatIssue, issueLocation } from "../export/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
/** Skill root dir (assets/ is located relative to this); kept as an export for existing deep importers. */
export const SKILL_ROOT = join(__dirname, "..", "..");

// ----------------------------------------------------------------------------
// Constant split (contract 5): **registry dirs** (in-package, registry.json only,
// version-coupled) are separate from **byte dirs** (large files in home, deletable
// and re-downloadable). The registry dirs are single-sourced in packages/paths.js
// (FONT_REGISTRY_DIR/ICON_REGISTRY_DIR) and re-exported here for compatibility;
// the writer reads registry.json from the package (home never shadows it), while
// bytes read home-first with package fallback (zero migration for existing installs).
// ----------------------------------------------------------------------------
export { FONT_REGISTRY_DIR, ICON_REGISTRY_DIR };
/** Font bytes dir in home (write target). */
export const FONT_BYTES_DIR = paths.fonts;
/** Icon bytes dir in home (write target). */
export const ICON_BYTES_DIR = paths.icons;
/** Compatibility aliases (external scripts/existing callers): semantics = in-package registry dir. */
export const FONT_LIB_DIR = FONT_REGISTRY_DIR;
export const ICON_LIB_DIR = ICON_REGISTRY_DIR;
export { issueLocation };

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
 * layer. Kept as a public helper for existing deep importers (ExportService now
 * loads font bytes through ResourceProvider instead).
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

/**
 * Read the manifest plus all page files (shared by regression/layout consumers).
 * Delegates to the runtime disk source (packages/server/runtime-node.js); the returned
 * shape stays the historical one.
 * @param {string} manifest .pptd file path
 * @returns {{ manifestText: string, manifestObj: object, deckDir: string, pageFiles: Map<string,string> }}
 */
export function loadProjectFiles(manifest) {
  const files = createDiskProjectSource(manifest).readSync();
  return {
    manifestText: files.manifestText,
    manifestObj: yaml.load(files.manifestText),
    deckDir: dirname(manifest),
    pageFiles: files.pageFiles,
  };
}

/** CLI adapter: disk project + fs/registry provider + capture file sink. */
async function prepare(manifest) {
  const source = createDiskProjectSource(manifest);
  const files = await source.read(); // media bytes for referenced images
  const project = createProject(files);
  const resources = createFsResourceProvider({ baseDir: files.baseDir });
  return { project, resources };
}

/** The historical export-gate message (kept byte-identical for CLI users/tests). */
function checkFailure(report) {
  const errors = report.check?.errors || [];
  const lines = errors.map((issue) => `  ✗ ${formatIssue(issue)}`);
  return new Error(`deck 校验未通过（${errors.length} 个错误，先用 check 命令排查）:\n${lines.join("\n")}`);
}

/**
 * Export a project bundle (deck.pptd + pages/*.page + media images → zip).
 * Packs the on-disk files verbatim (bundleMode:"raw", preserving comments/format).
 * @param {object} opts
 * @param {string} opts.manifest .pptd file path
 * @param {string} [opts.outPath] output zip path (defaults to <deck dir>/<title>-project.zip)
 */
export async function exportProject({ manifest, outPath = null }) {
  const { project, resources } = await prepare(manifest);
  let bytes = null;
  const env = {
    resources,
    sink: {
      writeFile(path, data) {
        writeFileSync(path, data);
        bytes = data;
      },
    },
  };
  // Keep the historical default output path exactly (Node path.join separators).
  const finalOutPath =
    outPath ||
    join(project.baseDir || ".", `${safeFileName(project.deck.title || "deck")}-project.zip`);
  const report = await runExport(project, { format: "bundle", bundleMode: "raw", outPath: finalOutPath, checkLayout: false }, env);
  if (!report.ok) throw checkFailure(report);
  // export-project historically only surfaced missing-image warnings.
  for (const warning of report.warnings) {
    if (warning.startsWith("[export-project]")) console.warn(warning);
  }
  return { bytes, outPath: report.outPath };
}

/** Export PPTX. Font embedding is handled through the ResourceProvider/writer:
 *  deck.fonts file/url or a registry reference ({family: <registry name>}) → bytes
 *  from the font library (home first → package fallback) → subset → EOT embed.
 *  fullFonts=true embeds the full font (maps to --full-fonts). */
export async function exportDeck({ manifest, outPath = null, embedFonts = true, fullFonts = false, theme = null }) {
  const { project, resources } = await prepare(manifest);
  let bytes = null;
  let checkWarnings = [];
  const env = {
    resources,
    sink: {
      writeFile(path, data) {
        writeFileSync(path, data);
        bytes = data;
      },
    },
    onProgress(evt) {
      if (evt.stage === "check") checkWarnings = evt.warnings || [];
    },
  };
  const finalOutPath =
    outPath || join(project.baseDir || ".", `${safeFileName(project.deck.title || "deck")}.pptx`);
  const report = await runExport(
    project,
    { format: "pptx", outPath: finalOutPath, embedFonts, fullFonts, theme, checkLayout: false },
    env
  );
  // Validation warnings were printed before the build historically.
  for (const issue of checkWarnings) {
    const at = issueLocation(issue);
    console.warn(`⚠ [${issue.rule}]${at ? " " + at : ""} ${issue.message}`);
  }
  if (!report.ok) throw checkFailure(report);
  if (report.skipped?.length) {
    console.warn(`⚠ ${report.skipped.length} 个字体未嵌入（打开时可能回退系统字体）:`);
    for (const s of report.skipped) console.warn(`   - ${skipReasonText(s)}`);
  }
  if (report.skippedIcons?.length) {
    console.warn(`⚠ ${report.skippedIcons.length} 个图标未导出（名字未命中免费库或 SVG 获取失败）:`);
    for (const s of report.skippedIcons) {
      console.warn(`   - ${s.iconName}（${s.reason === "unknown-name" ? "未命中 FA 免费库" : "SVG 获取失败"}）`);
    }
  }
  return { bytes, outPath: report.outPath, skipped: report.skipped || [], skippedIcons: report.skippedIcons || [] };
}
