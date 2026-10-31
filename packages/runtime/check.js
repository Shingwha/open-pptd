// ============================================================================
// runtime/check.js — pure project validation (checkProject)
// ----------------------------------------------------------------------------
// Single validation entry shared by CLI/editor/server (interfaces.md §4):
//   parse -> layout -> validateDeck, with environment facts injected.
// It never reads files and never downloads: file existence, font/icon registries
// come from the caller (or optional ResourceProvider extensions).
//
// Default layout: layout(deck, fontMetricsMeasure) — the exact chain the CLI check
// used before this package existed, so `open-pptd check` output stays byte-identical.
// Pass { layout: false } to skip layout facts (e.g. a fast structural check).
// ============================================================================

import { layout as layoutDeck } from "../layout/index.js";
import { fontMetricsMeasure } from "../measure/index.js";
import { validateDeck } from "../model/validate.js";
import { parseProject } from "./parse.js";

/**
 * @typedef {Object} CheckReport
 * @property {boolean} ok
 * @property {object[]} errors
 * @property {object[]} warnings
 * @property {Map<number, object[]>} perPage
 */

function deckOf(project) {
  if (project && typeof project === "object") {
    if (project.deck && typeof project.deck === "object") return project.deck;
    if (typeof project.manifestText === "string") return parseProject(project);
    if (Array.isArray(project.pages)) return project;
  }
  throw new TypeError("checkProject 需要 Project、ProjectFiles 或 Deck");
}

function existsResolver(project, resources, explicit) {
  const probes = [];
  if (typeof explicit === "function") probes.push(explicit);
  if (typeof project?.fileExists === "function") probes.push((rel) => project.fileExists(rel));
  if (project?.media instanceof Map) probes.push((rel) => project.media.has(rel));
  if (typeof resources?.fileExists === "function") probes.push((rel) => resources.fileExists(rel));
  if (!probes.length) return undefined;
  return (rel) => probes.some((probe) => probe(rel));
}

/**
 * Validate a project with environment facts.
 * @param {object} project Project | ProjectFiles | Deck
 * @param {object} [options]
 * @param {import("./provider.js").ResourceProvider} [options.resources]
 * @param {object|false} [options.layout] precomputed LayoutTree; false skips layout facts
 * @param {(path:string)=>boolean} [options.fileExists] project-relative resource probe
 * @param {object} [options.fontRegistry] built-in font registry
 * @param {object} [options.iconRegistry] Font Awesome icon registry
 * @returns {CheckReport}
 */
export function checkProject(project, options = {}) {
  const { resources = null, layout = undefined, fileExists, fontRegistry, iconRegistry } = options;
  const deck = deckOf(project);
  const layoutTree = layout === false ? null : layout || layoutDeck(deck, fontMetricsMeasure);
  const report = validateDeck(deck, {
    fileExists: existsResolver(project, resources, fileExists),
    fontRegistry: fontRegistry ?? resources?.fontRegistry ?? null,
    iconRegistry: iconRegistry ?? resources?.iconRegistry ?? null,
    layout: layoutTree,
  });
  return {
    ok: report.errors.length === 0,
    errors: report.errors,
    warnings: report.warnings,
    perPage: report.perPage,
  };
}
