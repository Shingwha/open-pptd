// ============================================================================
// export/pptx.js — PPTX format router (writer reuse, no zip/report duplication)
// ----------------------------------------------------------------------------
// Builds the deck through packages/writer exactly like the historical CLI path:
//   · images: resolveProject imageMap / project.media / data: URLs (sync writer loader)
//   · fonts: deck.fonts + registry hits preloaded through ResourceProvider.fontBytes;
//     the registry itself is handed to the writer as a data: URL so writers resolve
//     subset advice/file names without Node fs (browser + Node identical semantics)
//   · icons: resources.iconRegistry + resources.iconSvg
// Output naming/default path is the CLI contract (title → safeFileName + .pptx).
// ============================================================================

import { buildPptx, magicMatches, imageSize, safeFileName } from "../writer/index.js";
import { collectFontSpecs } from "../writer/font.js";
import { findFont } from "../model/font-registry.js";
import { encodeUtf8, bytesToBase64 } from "../model/bytes.js";
import { decodeImageDataUrl, imageExtOf } from "../runtime/provider.js";
import { ExportError, EXPORT_ERRORS } from "./errors.js";
import { joinPath } from "./report.js";

/** data: URL carrying the in-package font registry (writer fetch path works in Node + browser). */
function registryDataUrl(registry) {
  if (!registry || typeof registry !== "object") return null;
  try {
    return `data:application/json;base64,${bytesToBase64(encodeUtf8(JSON.stringify(registry)))}`;
  } catch {
    return null;
  }
}

function getter(obj, name) {
  try {
    return obj?.[name] ?? null;
  } catch {
    return null;
  }
}

/** Sync image loader over the resolved imageMap, project.media and data: URLs. */
function makeImageLoader(project, resolved) {
  const media = project.media instanceof Map ? project.media : new Map();
  return (src) => {
    if (typeof src !== "string" || !src) return null;
    if (src.startsWith("data:")) {
      let decoded = null;
      try {
        decoded = decodeImageDataUrl(src);
      } catch {
        return null; // WebP/SVG data URLs are unsupported by the writer
      }
      if (!decoded || !magicMatches(decoded.bytes, decoded.ext)) return null;
      return { bytes: decoded.bytes, ext: decoded.ext, size: imageSize(decoded.bytes) };
    }
    let entry = resolved.imageMap.get(src) || null;
    if (!entry && media.has(src)) {
      const bytes = media.get(src);
      const ext = imageExtOf(src);
      if (bytes && magicMatches(bytes, ext)) entry = { bytes, ext };
    }
    if (!entry || !magicMatches(entry.bytes, entry.ext)) return null;
    return { bytes: entry.bytes, ext: entry.ext, size: imageSize(entry.bytes) };
  };
}

/**
 * Preload font bytes through the ResourceProvider (fontFiles is the writer's
 * cross-environment preload channel).
 * @returns {Promise<{fontFiles: object, registryUrl: string|null, families: string[]}>}
 */
async function preloadFonts(deck, resources) {
  const specs = collectFontSpecs(deck);
  const families = specs.map((s) => s.family);
  if (!specs.length) return { fontFiles: {}, registryUrl: null, families };
  const registry = getter(resources, "fontRegistry");
  const registryUrl = specs.some((s) => s.needRegistry) ? registryDataUrl(registry) : null;
  const fontFiles = {};
  for (const spec of specs) {
    let ref = null;
    if (spec.file) ref = { family: spec.family, file: spec.file, ...(spec.subset == null ? {} : { subset: spec.subset }) };
    else if (spec.url) ref = { family: spec.family, url: spec.url };
    else if (registry) {
      const hit = findFont(registry, spec.family);
      if (hit?.file) ref = { family: spec.family, file: hit.file, ...(hit.subset == null ? {} : { subset: hit.subset }) };
      else if (hit?.url) ref = { family: spec.family, url: hit.url };
    }
    if (!ref || typeof resources.fontBytes !== "function") continue;
    const bytes = await resources.fontBytes(ref);
    if (bytes instanceof Uint8Array && bytes.length) fontFiles[spec.family] = bytes;
  }
  return { fontFiles, registryUrl, families };
}

/**
 * Build and write the PPTX artifact.
 * @param {object} ctx {project, deck, resolved, options, env, report}
 */
export async function exportPptx(ctx) {
  const { project, deck, resolved, options, env, report } = ctx;
  const resources = env.resources;
  const embedFonts = options.embedFonts !== false;
  const fullFonts = options.fullFonts === true;

  let fontFiles = {};
  let registryUrl = null;
  let fontFamilies = [];
  if (embedFonts) {
    const preloaded = await preloadFonts(deck, resources);
    fontFiles = preloaded.fontFiles;
    registryUrl = preloaded.registryUrl;
    fontFamilies = preloaded.families;
  }

  const iconRegistry = getter(resources, "iconRegistry");
  const loadIconSvg =
    typeof resources.iconSvg === "function"
      ? (hit) => resources.iconSvg(hit ? `${hit.prefix}:${hit.name}` : null)
      : undefined;

  const skipped = [];
  const skippedIcons = [];
  let bytes;
  try {
    bytes = await buildPptx(deck, {
      loadImage: makeImageLoader(project, resolved),
      embedFonts,
      fullFonts,
      fontFiles,
      ...(registryUrl ? { registryUrl } : {}),
      iconRegistry,
      ...(loadIconSvg ? { loadIconSvg } : {}),
      onFontSkipped: (list) => skipped.push(...list),
      onIconSkipped: (list) => skippedIcons.push(...list),
    });
  } catch (err) {
    throw new ExportError(EXPORT_ERRORS.EXPORT, err?.message || String(err), { cause: err });
  }

  const outPath =
    options.outPath ||
    joinPath(project.baseDir || ".", `${safeFileName(deck.title || "deck")}.pptx`);
  const sink = env.sink;
  if (typeof sink?.writeFile === "function") {
    await sink.writeFile(outPath, bytes);
  } else {
    report.artifacts = [{ name: outPath, bytes }];
  }

  report.outPath = outPath;
  report.files = [outPath];
  report.bytes = bytes.length;
  report.skipped = skipped;
  report.skippedIcons = skippedIcons;
  const skippedFamilies = new Set(skipped.map((s) => s.family));
  report.embedded = embedFonts
    ? fontFamilies
        .filter((family) => !skippedFamilies.has(family))
        .map((family) => ({ family }))
    : [];
}
