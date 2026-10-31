// ============================================================================
// runtime/source.js — ProjectSource contract, normalization and the memory source
// ----------------------------------------------------------------------------
// ProjectSource (interfaces.md §2):
//   capabilities: { writable, liveWatch, binary }
//   read(input?): Promise<ProjectFiles>
//   write?(files: SourceFile[], opts?: { expectedRevision? }): Promise<number>
//   readMedia?(path): Promise<Uint8Array|null>
//   watch?(cb): () => void
//
// ProjectFiles: { manifestText, pageFiles: Map, media?: Map, manifestPath?, revision? }
// SourceFile:   { path, text?, bytes? }
//
// The memory source is pure (Map-backed) and is reused by tests and browser
// hosts. Node disk IO lives in packages/server/runtime-node.js.
// ============================================================================

import { assertRevision } from "./errors.js";
import { basename, dirname } from "./paths.js";

/**
 * @typedef {Object} SourceFile
 * @property {string} path project-relative path
 * @property {string} [text] UTF-8 text payload
 * @property {Uint8Array} [bytes] binary payload
 */

/**
 * @typedef {Object} ProjectFiles
 * @property {string} manifestText manifest YAML text
 * @property {Map<string,string>} pageFiles page path -> page YAML text
 * @property {Map<string,Uint8Array>} [media] media path -> raw bytes
 * @property {string} [manifestPath] source-specific manifest location
 * @property {string} [revision] opaque revision for conflict detection
 */

/**
 * @typedef {Object} ProjectSource
 * @property {{writable:boolean, liveWatch:boolean, binary:boolean}} capabilities
 * @property {(input?: any) => Promise<ProjectFiles>} read
 * @property {(files: SourceFile[], opts?: {expectedRevision?: string}) => Promise<number>} [write]
 * @property {(path: string) => Promise<Uint8Array|null>} [readMedia]
 * @property {(cb: (evt: {kind:"deck"|"page"|"media", path:string}) => void) => (() => void)} [watch]
 */

/** Validate/normalize one SourceFile. */
export function normalizeSourceFile(file) {
  if (!file || typeof file !== "object") throw new TypeError("SourceFile 必须是对象");
  if (typeof file.path !== "string" || !file.path) throw new TypeError("SourceFile.path 必须是非空字符串");
  const hasText = typeof file.text === "string";
  const hasBytes = file.bytes instanceof Uint8Array;
  if (!hasText && !hasBytes) throw new TypeError(`SourceFile ${file.path} 需要 text 或 bytes`);
  return { path: file.path, ...(hasText ? { text: file.text } : { bytes: file.bytes }) };
}

/**
 * Normalize a source read result into ProjectFiles (never mutates the input).
 * pageFiles/media accept Map or plain object.
 * @param {object} files
 * @returns {ProjectFiles & {manifestName: string, baseDir: string, media: Map<string,Uint8Array>}}
 */
export function normalizeProjectFiles(files) {
  if (!files || typeof files !== "object") throw new TypeError("ProjectFiles 必须是对象");
  if (typeof files.manifestText !== "string") throw new TypeError("ProjectFiles.manifestText 必须是字符串");
  const toMap = (value) => {
    if (value == null) return new Map();
    if (value instanceof Map) return new Map(value);
    if (typeof value === "object") return new Map(Object.entries(value));
    throw new TypeError("ProjectFiles.pageFiles/media 必须是 Map 或普通对象");
  };
  const manifestPath = typeof files.manifestPath === "string" ? files.manifestPath : "";
  const manifestName =
    typeof files.manifestName === "string" && files.manifestName ? files.manifestName : basename(manifestPath) || "deck.pptd";
  return {
    manifestText: files.manifestText,
    pageFiles: toMap(files.pageFiles),
    media: toMap(files.media),
    manifestPath,
    manifestName,
    baseDir: dirname(manifestPath),
    revision: files.revision ?? null,
  };
}

/** Duck-type check for a ProjectSource. */
export function isProjectSource(source) {
  return !!source && typeof source === "object" && typeof source.read === "function";
}

/**
 * Load a project through a ProjectSource.
 * With no source, a ready ProjectFiles object is accepted as-is (useful for tests
 * and for hosts that already read their project).
 * @param {any} input source read hint (deck URL / manifest / memory key)
 * @param {{source?: ProjectSource}} [options]
 * @returns {Promise<ProjectFiles>}
 */
export async function loadProject(input, { source } = {}) {
  if (!source) {
    if (input && typeof input === "object" && typeof input.manifestText === "string") {
      return normalizeProjectFiles(input);
    }
    throw new TypeError("loadProject 需要 source（ProjectSource）或现成的 ProjectFiles");
  }
  if (!isProjectSource(source)) throw new TypeError("source 必须实现 read()（ProjectSource）");
  const files = await source.read(input);
  return normalizeProjectFiles(files);
}

const MEDIA_KINDS = new Set(["deck", "page", "media"]);

function kindOf(path) {
  const p = String(path).toLowerCase();
  if (p.endsWith(".pptd")) return "deck";
  if (p.endsWith(".page")) return "page";
  return "media";
}

/**
 * In-memory ProjectSource (tests, embedding, browser hosts).
 * @param {object} [options]
 * @param {Record<string, string|Uint8Array|ArrayBuffer>} [options.files]
 *   project files keyed by project-relative path; strings are page texts, bytes are media
 * @param {boolean} [options.writable]
 * @param {string} [options.revision] initial opaque revision (defaults to "r0")
 * @returns {ProjectSource}
 */
export function memorySource({ files = {}, writable = true, revision = "r0" } = {}) {
  const store = new Map();
  for (const [path, value] of Object.entries(files)) {
    store.set(String(path), value instanceof ArrayBuffer ? new Uint8Array(value) : value);
  }
  const watchers = new Set();
  let seq = 0;
  let rev = String(revision ?? "r0");

  const textOf = (value) => (typeof value === "string" ? value : new TextDecoder().decode(value));
  const manifestPathOf = () => {
    if (store.has("deck.pptd")) return "deck.pptd";
    for (const key of store.keys()) if (/\.pptd$/i.test(key)) return key;
    return "deck.pptd";
  };

  return {
    capabilities: { writable: !!writable, liveWatch: true, binary: true },

    /** @returns {Promise<ProjectFiles>} */
    async read() {
      const mPath = manifestPathOf();
      const pageFiles = new Map();
      const media = new Map();
      for (const [path, value] of store.entries()) {
        if (path === mPath) continue;
        if (typeof value === "string") pageFiles.set(path, value);
        else media.set(path, value);
      }
      return {
        manifestText: store.has(mPath) ? textOf(store.get(mPath)) : "",
        pageFiles,
        media,
        manifestPath: mPath,
        revision: rev,
      };
    },

    /**
     * Batch write with optional revision-conflict check.
     * @param {SourceFile[]} files
     * @param {{expectedRevision?: string}} [opts]
     * @returns {Promise<number>}
     */
    async write(files, { expectedRevision } = {}) {
      if (!writable) throw new Error("memorySource 只读");
      if (!Array.isArray(files)) throw new TypeError("write 需要 SourceFile[]");
      assertRevision(rev, expectedRevision);
      const normalized = files.map(normalizeSourceFile);
      for (const file of normalized) {
        store.set(file.path, file.bytes != null ? file.bytes : file.text);
      }
      seq += 1;
      rev = `r${seq}`;
      for (const cb of [...watchers]) {
        for (const file of normalized) {
          if (MEDIA_KINDS.has(kindOf(file.path))) cb({ kind: kindOf(file.path), path: file.path });
        }
      }
      return normalized.length;
    },

    /** @param {string} path @returns {Promise<Uint8Array|null>} */
    async readMedia(path) {
      const value = store.get(path);
      if (value == null) return null;
      return typeof value === "string" ? new TextEncoder().encode(value) : value;
    },

    /** @param {(evt: {kind:"deck"|"page"|"media", path:string}) => void} cb */
    watch(cb) {
      watchers.add(cb);
      return () => watchers.delete(cb);
    },

    /** Test/debug helper: current revision. */
    revision() {
      return rev;
    },
  };
}
