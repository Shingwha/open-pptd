// ============================================================================
// runtime/parse.js — ProjectFiles -> Deck, Project assembly
// ----------------------------------------------------------------------------
// parseProject is the single PPTD parse entry for the runtime: it accepts
// ProjectFiles (or an already assembled Project via .manifestText) and delegates
// to model/pptd-io (lenient parse, unknown fields kept in `extra`).
//
// Project (interfaces.md §4): { manifestName, manifestPath, baseDir?, pageFiles,
// media?, deck }. The runtime Project additionally keeps manifestText/revision so
// raw serialization and conflict detection need no second source read.
// ============================================================================

import { parseDeck } from "../model/pptd-io.js";
import { normalizeProjectFiles } from "./source.js";

/**
 * @typedef {Object} Project
 * @property {string} manifestName
 * @property {string} manifestPath
 * @property {string} baseDir
 * @property {string} manifestText
 * @property {Map<string,string>} pageFiles
 * @property {Map<string,Uint8Array>} media
 * @property {string|null} revision
 * @property {object} deck
 */

/**
 * Parse a PPTD project from ProjectFiles (or a Project carrying manifestText).
 * @param {object} files
 * @returns {object} deck model
 */
export function parseProject(files) {
  if (!files || typeof files !== "object" || typeof files.manifestText !== "string") {
    throw new TypeError("parseProject 需要 ProjectFiles（含 manifestText）");
  }
  const pageFiles = files.pageFiles instanceof Map ? files.pageFiles : new Map(Object.entries(files.pageFiles || {}));
  return parseDeck(files.manifestText, pageFiles);
}

/**
 * Assemble a Project from ProjectFiles (parsing the deck unless one is given).
 * @param {object} files ProjectFiles (or an already normalized project)
 * @param {object} [deck] optional pre-parsed deck model
 * @returns {Project}
 */
export function createProject(files, deck = null) {
  const normalized = normalizeProjectFiles(files);
  return {
    manifestName: normalized.manifestName,
    manifestPath: normalized.manifestPath,
    baseDir: normalized.baseDir,
    manifestText: normalized.manifestText,
    pageFiles: normalized.pageFiles,
    media: normalized.media,
    revision: normalized.revision,
    deck: deck || parseProject(normalized),
  };
}
