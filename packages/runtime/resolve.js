// ============================================================================
// runtime/resolve.js — Deck/Project + ResourceProvider -> ResolvedProject
// ----------------------------------------------------------------------------
// Resolves the environment-dependent parts of a project:
//   theme      — normalizeTheme + deck.fonts merged (model/theme resolveTheme)
//   imageMap   — every referenced image src -> { bytes, ext } (data URLs decoded)
//   iconMap    — every referenced iconName -> SVG text (null when missing)
//   fontStatus — every used font family -> ready/system/fetchable/missing
// Missing and unsupported resources are collected as diagnostics; nothing here
// throws for a missing resource (ExportService applies strict/warning policy).
//
// ResourceProvider is required: loadProject never touches fonts/images, all IO
// happens here (interfaces.md §4). The optional themeLibrary hook belongs to W6
// (ThemeStore) and is deliberately not implemented in this wave.
// ============================================================================

import { parseFontResources } from "../model/font.js";
import { resolveTheme } from "../model/theme.js";
import { collectImageSrcs, walkElements } from "../model/walk.js";
import { UnsupportedFormatError } from "./errors.js";
import { decodeImageDataUrl, IMAGE_EXTS, imageExtOf, imageFormatOfBytes } from "./provider.js";

/**
 * @typedef {Object} ResolvedProject
 * @property {object|null} project
 * @property {object} deck
 * @property {object} theme
 * @property {Map<string,{bytes:Uint8Array, ext:string}>} imageMap
 * @property {Map<string,string|null>} iconMap
 * @property {Record<string,"ready"|"system"|"fetchable"|"missing">} fontStatus
 * @property {{fonts:string[], icons:string[], images:string[]}} missing
 * @property {Array<{kind:string, ref:string, format:string}>} unsupported
 */

function allFamilies(deck) {
  const families = new Map(); // family -> FontRef
  for (const [key, res] of Object.entries(parseFontResources(deck?.fonts))) {
    families.set(res.family, {
      family: res.family,
      key,
      ...(res.file ? { file: res.file } : {}),
      ...(res.url ? { url: res.url } : {}),
      ...(res.subset == null ? {} : { subset: res.subset }),
    });
  }
  walkElements(deck?.pages, (el) => {
    if (el.elementType !== "text" || !el.content) return;
    const ff = el.content.fontFamily;
    const add = (family) => {
      if (typeof family === "string" && family && !families.has(family)) families.set(family, { family });
    };
    if (typeof ff === "string") add(ff);
    else if (ff && typeof ff === "object") {
      add(ff.latin);
      add(ff.ea);
    }
  });
  return families;
}

/**
 * @param {object} input deck model or Project
 * @param {{resources: import("./provider.js").ResourceProvider, themeLibrary?: object}} options
 * @returns {Promise<ResolvedProject>}
 */
export async function resolveProject(input, { resources } = {}) {
  if (!resources || typeof resources !== "object") {
    throw new TypeError("resolveProject 需要 resources（ResourceProvider）");
  }
  const project = input && typeof input === "object" && input.deck ? input : null;
  const deck = project ? project.deck : input;
  if (!deck || typeof deck !== "object") throw new TypeError("resolveProject 需要 Deck 或 Project");

  const theme = resolveTheme(deck);
  const imageMap = new Map();
  const iconMap = new Map();
  const fontStatus = {};
  const missing = { fonts: [], icons: [], images: [] };
  const unsupported = [];

  // ---- images: data URLs decode locally; project-relative/remote srcs go to the provider ----
  for (const src of collectImageSrcs(deck.pages, { includeDataUrl: true, includeRemote: true })) {
    if (src.startsWith("data:")) {
      let decoded = null;
      try {
        decoded = decodeImageDataUrl(src);
      } catch (err) {
        if (!(err instanceof UnsupportedFormatError)) throw err;
        unsupported.push({ kind: "image", ref: src, format: err.format });
      }
      if (decoded) imageMap.set(src, decoded);
      else if (!unsupported.some((u) => u.ref === src)) unsupported.push({ kind: "image", ref: src, format: "data-url" });
      continue;
    }
    const ext = imageExtOf(src);
    if (!IMAGE_EXTS.has(ext)) {
      // WebP/SVG conversion happens in the skill/agent layer, never in the core.
      unsupported.push({ kind: "image", ref: src, format: ext || "unknown" });
      continue;
    }
    const bytes = typeof resources.imageBytes === "function" ? await resources.imageBytes(src) : null;
    if (!bytes) {
      missing.images.push(src);
      continue;
    }
    const actual = imageFormatOfBytes(bytes);
    if (!actual || actual !== ext) {
      unsupported.push({ kind: "image", ref: src, format: actual || "unknown" });
      continue;
    }
    imageMap.set(src, { bytes, ext: actual });
  }

  // ---- icons ----
  const iconNames = new Set();
  walkElements(deck.pages, (el) => {
    if (el.elementType === "icon" && typeof el.iconName === "string" && el.iconName) iconNames.add(el.iconName);
  });
  for (const name of iconNames) {
    const svg = typeof resources.iconSvg === "function" ? await resources.iconSvg(name) : null;
    iconMap.set(name, svg ?? null);
    if (svg == null) missing.icons.push(name);
  }

  // ---- fonts (declared + used families) ----
  for (const [family, ref] of allFamilies(deck)) {
    const status = typeof resources.fontStatus === "function" ? await resources.fontStatus(ref) : "missing";
    fontStatus[family] = status || "missing";
    if (fontStatus[family] === "missing") missing.fonts.push(family);
  }

  return {
    project,
    deck,
    theme,
    imageMap,
    iconMap,
    fontStatus,
    missing,
    unsupported,
  };
}
