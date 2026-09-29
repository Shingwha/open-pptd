// ============================================================================
// server/gallery.js — gallery index scan (YAML via js-yaml, same as model)
// ----------------------------------------------------------------------------
// Scans every project folder under examples/ (examples/<id>/deck.pptd + pages/
// + media/) and builds gallery entries. The same scan serves two consumers:
//   1. local serve: GET /examples/manifest.json generated on the fly (drop a
//      folder in and it appears, always up to date)
//   2. CLI `open-pptd gallery scan`: writes the static examples/manifest.json
//      (for GitHub Pages)
// Entry facts are extracted from the project itself where possible
// (title/fonts/pages/size) without requiring extra metadata; an optional
// examples/<id>/meta.yaml adds description/tags/kind:
//   title: display title (defaults to deck.title)
//   description: one-line description
//   tags: comma-separated tags (scenario/capability, e.g. academic defense, chart, formula)
//   kind: work type, set explicitly (ppt default / poster); the gallery tabs by it
// ============================================================================

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import * as yaml from "../model/vendor/js-yaml.mjs";
import { PAGE_WIDTH, PAGE_HEIGHT, deckSize } from "../model/model.js";

const GALLERY_VERSION = 2;

/** Parse deck.pptd / meta.yaml; returns null on failure (caller falls back to defaults). */
function loadYaml(text) {
  try {
    return yaml.load(text) || null;
  } catch {
    return null;
  }
}

/**
 * Scan the examples/ directory → array of gallery entries (paths relative to the repo root).
 * @param {string} examplesDir absolute path of examples/
 * @returns {Array<{id,title,description,tags,pages,fonts,deck}>}
 */
export function scanExamples(examplesDir) {
  if (!existsSync(examplesDir)) return [];
  const entries = [];
  for (const id of readdirSync(examplesDir, { withFileTypes: true })) {
    if (!id.isDirectory() || id.name.startsWith(".")) continue;
    const dir = join(examplesDir, id.name);
    const deckPath = join(dir, "deck.pptd");
    if (!existsSync(deckPath)) continue; // a directory without a manifest is not a gallery project

    const deckObj = loadYaml(readFileSync(deckPath, "utf8"));
    const size = deckSize(deckObj);
    const entry = {
      id: id.name,
      title: (typeof deckObj?.title === "string" && deckObj.title) || id.name,
      description: "",
      tags: [],
      pages: 0,
      fonts: deckObj?.fonts && typeof deckObj.fonts === "object" ? Object.keys(deckObj.fonts) : [],
      size: [Number(size[0]) || PAGE_WIDTH, Number(size[1]) || PAGE_HEIGHT],
      kind: "ppt",
      deck: `examples/${id.name}/deck.pptd`,
    };

    // page count = number of pages/*.page files (names need not be numbered; all count)
    const pagesDir = join(dir, "pages");
    if (existsSync(pagesDir)) {
      entry.pages = readdirSync(pagesDir).filter((f) => f.endsWith(".page")).length;
    }

    // optional meta.yaml adds description/tags/title/kind
    const metaPath = join(dir, "meta.yaml");
    if (existsSync(metaPath)) {
      const meta = loadYaml(readFileSync(metaPath, "utf8"));
      if (meta?.title) entry.title = String(meta.title);
      if (meta?.description) entry.description = String(meta.description);
      if (meta?.tags) entry.tags = String(meta.tags).split(/[,，]/).map((t) => t.trim()).filter(Boolean);
      if (meta?.kind) entry.kind = String(meta.kind) === "poster" ? "poster" : "ppt";
    }
    entries.push(entry);
  }
  // stable sort: entries with a description first (richer metadata), then by id
  entries.sort((a, b) => (a.description ? 0 : 1) - (b.description ? 0 : 1) || a.id.localeCompare(b.id, "zh"));
  return entries;
}

/** Build the full manifest object. */
export function buildManifest(examplesDir) {
  return {
    version: GALLERY_VERSION,
    generated: new Date().toISOString(),
    entries: scanExamples(examplesDir),
  };
}
