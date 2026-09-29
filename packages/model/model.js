// ============================================================================
// model.js — unified data model (single source of truth shared by renderer and writer)
// ----------------------------------------------------------------------------
// Supported components (aligned with official PPTD v2):
//   text / shape (187 preset geometries + custom path) / line / image / icon /
//   table / chart (13 series types)
// Page background, page type, fade transition and speaker notes are written
// directly by the writer.
// ============================================================================

import { PRESET_SHAPES } from "./preset-geometry.data.js";

export const PAGE_WIDTH = 960;
export const PAGE_HEIGHT = 540;

/** Deck canvas size (falls back to 960×540 when size is missing/invalid); used by render/export/thumbnails/gallery. */
export function deckSize(deck) {
  return Array.isArray(deck?.size) && deck.size.length === 2 ? deck.size : [PAGE_WIDTH, PAGE_HEIGHT];
}

/** Supported shape list (key = shapeName): all come from the ECMA-376 preset geometry data (187 shapes, including the 5 basic ones). */
export const SUPPORTED_SHAPES = Object.fromEntries(
  Object.entries(PRESET_SHAPES).map(([name, def]) => [
    name,
    { label: def.label, category: def.category, preset: name, adjustments: def.adjDefault.length ? def.adjDefault : null },
  ])
);

export const PAGE_TYPES = ["cover", "table_of_contents", "chapter", "content", "final"];

// ---- shot headless-render contract (shared by editor/app/shot.js <-> renderer/headless/cdp.js) ----
// document.title signal: ready to screenshot / initialization failed.
export const SHOT_READY_TITLE = "PPTD_READY";
export const SHOT_ERROR_TITLE = "PPTD_ERROR";

// ----------------------------------------------------------------------------
// Creation and validation
// ----------------------------------------------------------------------------
export function createDeck({ title = "未命名演示文稿", size = [PAGE_WIDTH, PAGE_HEIGHT], theme = null, fonts = null, pages = [] } = {}) {
  return { version: "v2", title, size, theme, fonts, pages };
}

export function createPage({ pageType = "content", background = null, notes = "", elements = [] } = {}) {
  return { pageType, background, notes, elements };
}

let _idSeq = 0;
/** Generate a unique elementId. */
export function nextElementId(prefix = "el") {
  _idSeq += 1;
  return `${prefix}${_idSeq}`;
}

/**
 * Scan the largest elementId number currently in the deck and reset the counter,
 * so that ids of newly created elements stay contiguous and readable after
 * loading a project (el4, el5…).
 */
export function syncElementId(deck) {
  let max = 0;
  for (const page of deck.pages || []) {
    for (const el of page.elements || []) {
      const m = /^el(\d+)$/.exec(el.elementId || "");
      if (m) max = Math.max(max, Number(m[1]));
    }
  }
  _idSeq = max;
}
