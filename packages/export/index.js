// export/index.js — ExportService (Contract 3.0 entry open-pptd/export)
// Single orchestration entry: exportProject(project, options, env) → ExportReport for
// check / pptx / bundle / png. options: format, outPath?, check?, fetchFonts?, offline?,
// strict?, embedFonts?, fullFonts?, pages?, scale?, backend?, browserPath?, timeoutMs?, bundleMode?;
// env: resources, renderBackend?, sink?, onProgress?. Kept here: check gate, strict policy,
// resolve diagnostics, report assembly, format routing. Dual-end: no node:/DOM; adapters injected via env.

import { checkProject, createProject, resolveProject } from "../runtime/index.js";
import { ExportError, EXPORT_ERRORS } from "./errors.js";
import { createReport, formatIssue } from "./report.js";
import { exportPptx } from "./pptx.js";
import { exportBundle } from "./bundle.js";
import { exportPng } from "./png.js";

/** Formats accepted by options.format. */
export const EXPORT_FORMATS = ["check", "pptx", "bundle", "png"];

/**
 * ExportReport (extensions documented in report.js).
 * @typedef {Object} ExportReport
 * @property {boolean} ok
 * @property {"check"|"pptx"|"bundle"|"png"} format
 * @property {string} [outPath]
 * @property {number[]} [pages]
 * @property {{fonts:number, icons:number, media:number}} checked
 * @property {object[]} fetched
 * @property {object[]} embedded
 * @property {object[]} skipped
 * @property {object[]} missing
 * @property {string[]} warnings
 * @property {string[]} errors
 * @property {object} [check] structured CheckReport (runtime/check.js)
 * @property {object[]} [skippedIcons]
 * @property {object[]} [unsupported]
 * @property {string[]} [files]
 * @property {Array<{name:string, bytes:Uint8Array}>} [artifacts]
 * @property {number} [bytes]
 */

/**
 * RenderBackend contract.
 * @typedef {Object} RenderBackend
 * @property {() => Promise<void>} prepare set viewport/deviceScaleFactor/pixelRatio before the first paint
 * @property {(page:number, opts:{pixelRatio:number}) => Promise<void>} paint 1-based page
 * @property {() => Promise<Uint8Array>} capture PNG bytes
 * @property {() => Promise<void>} dispose
 */

/**
 * RenderBackendFactory: hosts inject it as env.renderBackend.
 * @typedef {(options: {width:number,height:number,scale:number,mode:string,target:object,browserPath?:string,timeoutMs?:number}) => Promise<RenderBackend>} RenderBackendFactory
 */

export { ExportError, EXPORT_ERRORS } from "./errors.js";
export { formatIssue, issueLocation } from "./report.js";

/** Accept Project / ProjectFiles / Deck and normalize to a runtime Project. */
function asProject(input) {
  if (!input || typeof input !== "object") {
    throw new TypeError("exportProject 需要 Project、ProjectFiles 或 Deck");
  }
  if (input.deck && typeof input.deck === "object") {
    return {
      ...input,
      manifestName: input.manifestName || "deck.pptd",
      manifestPath: input.manifestPath || "",
      baseDir: input.baseDir || "",
      pageFiles: input.pageFiles instanceof Map ? input.pageFiles : new Map(),
      media: input.media instanceof Map ? input.media : new Map(input.media ? Object.entries(input.media) : []),
      revision: input.revision ?? null,
    };
  }
  if (typeof input.manifestText === "string") return createProject(input);
  if (Array.isArray(input.pages)) {
    return {
      manifestName: "deck.pptd",
      manifestPath: "",
      baseDir: "",
      manifestText: null,
      pageFiles: new Map(),
      media: new Map(),
      revision: null,
      deck: input,
    };
  }
  throw new TypeError("exportProject 需要 Project、ProjectFiles 或 Deck");
}

function countChecked(resolved) {
  return {
    fonts: Object.keys(resolved.fontStatus || {}).length,
    icons: resolved.iconMap instanceof Map ? resolved.iconMap.size : 0,
    media: (resolved.imageMap instanceof Map ? resolved.imageMap.size : 0) + (resolved.missing?.images?.length || 0),
  };
}

function collectMissing(resolved) {
  const missing = [];
  for (const ref of resolved.missing?.fonts || []) missing.push({ kind: "font", ref });
  for (const ref of resolved.missing?.icons || []) missing.push({ kind: "icon", ref });
  for (const ref of resolved.missing?.images || []) missing.push({ kind: "image", ref });
  return missing;
}

/**
 * Export a project.
 * @param {object} projectInput Project | ProjectFiles | Deck
 * @param {object} [options] see the module header
 * @param {object} [env] {resources, renderBackend?, sink?, onProgress?}
 * @returns {Promise<object>} ExportReport (check failures are report.ok=false, not throws)
 */
export async function exportProject(projectInput, options = {}, env = {}) {
  if (options.theme != null) {
    throw new ExportError(EXPORT_ERRORS.INVALID_OPTION, "theme 覆盖已移除（主题库已删除）");
  }
  const format = options.format || "check";
  if (!EXPORT_FORMATS.includes(format)) {
    throw new ExportError(
      EXPORT_ERRORS.INVALID_FORMAT,
      `不支持的导出格式: ${format}（支持 ${EXPORT_FORMATS.join(" / ")}）`
    );
  }
  const resources = env.resources || null;
  if (format !== "check" && !resources) {
    throw new ExportError(
      EXPORT_ERRORS.NO_RESOURCES,
      `${format} 导出需要 env.resources（ResourceProvider）`
    );
  }
  const project = asProject(projectInput);
  const deck = project.deck;

  const report = createReport(format);

  const emit = (evt) => {
    if (typeof env.onProgress !== "function") return;
    try {
      env.onProgress(evt);
    } catch {
      /* a host progress callback must never break the export */
    }
  };

  // ---- 1. Check gate (errors block; warnings are soft unless strict) ----
  if (options.check !== false) {
    // checkLayout:false keeps the CLI export gate (schema/resources only,
    // no LayoutTree geometry facts); the default full check matches `open-pptd check`.
    const check = checkProject(project, {
      resources,
      ...(options.checkLayout === false ? { layout: false } : {}),
    });
    report.check = check;
    report.warnings.push(...check.warnings.map(formatIssue));
    emit({ stage: "check", format, warnings: check.warnings, errors: check.errors, ok: check.ok });
    if (!check.ok) {
      report.errors.push(...check.errors.map(formatIssue));
      report.ok = false;
      return report;
    }
  }

  // ---- 2. Resolve environment resources (diagnostics + format inputs) ----
  let resolved = null;
  if (resources) {
    resolved = await resolveProject(project, { resources });
    report.checked = countChecked(resolved);
    report.missing = collectMissing(resolved);
    if (resolved.unsupported?.length) report.unsupported = resolved.unsupported;
    emit({ stage: "resolve", format, checked: report.checked, missing: report.missing });
  }

  // ---- 3. Strict: warnings/missing/unsupported block the artifact ----
  if (options.strict && (report.warnings.length || report.missing.length || report.unsupported?.length)) {
    report.ok = false;
    report.errors.push(
      `strict：存在 ${report.warnings.length} 个警告 / ${report.missing.length} 个缺失资源` +
        `${report.unsupported?.length ? ` / ${report.unsupported.length} 个不支持资源` : ""}，已中止导出`
    );
    return report;
  }

  if (format === "check") return report;

  // ---- 4. Format router ----
  const ctx = { project, deck, resolved, options, env, report };
  if (format === "pptx") await exportPptx(ctx);
  else if (format === "bundle") await exportBundle(ctx);
  else if (format === "png") await exportPng(ctx);

  report.ok = report.errors.length === 0;
  return report;
}

export { exportPptx, exportBundle, exportPng };
