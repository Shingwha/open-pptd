// ============================================================================
// server/font-library.js — Node storage adapter for the global font library
// ----------------------------------------------------------------------------
// User fonts: <home>/assets/fonts/user/*.ttf|otf + index.json (default
// ~/.open-pptd/assets/fonts/user, theme-font.md §6/§8). The pure factory
// (model/font-library.js) owns resolution/import semantics; this file does:
//   · index read/write ({version:1, fonts:[FontEntry]}) with atomic writes
//   · byte copy into the user dir (basename only; traversal-safe; unique names)
//   · built-in registry + in-package/home bytes (read-only)
//   · HTTPS font download for importUrl (bounded size/time)
// The browser editor and the CLI share this same home layout through the server
// API / provider (D14).
// ============================================================================

import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { paths, atomicWriteFile, FONT_REGISTRY_DIR, resolveResourceFile } from "../paths.js";
import { FontLibraryError, MAX_FONT_BYTES, createFontLibrary, safeFontFileName } from "../model/font-library.js";

/** Max bytes accepted from a URL download (same cap as the local importer). */
const MAX_DOWNLOAD_BYTES = MAX_FONT_BYTES;
const FETCH_TIMEOUT_MS = 60000;

/** Paths of the Node font library for a home dir. */
export function fontLibraryPaths({ home = paths.home } = {}) {
  const userDir = join(home, "assets", "fonts", "user");
  return { home, userDir, indexFile: join(userDir, "index.json"), tmpDir: join(home, "tmp") };
}

/**
 * Synchronous user-index read for the ResourceProvider's `fontRegistry` getter
 * (export/check ask the registry synchronously whether a family is available).
 * A missing/corrupt index degrades to [] with a warning.
 * @param {{home?:string}} [options]
 * @returns {Array<object>}
 */
export function readUserFontEntries({ home = paths.home } = {}) {
  try {
    return loadIndex(fontLibraryPaths({ home }).indexFile).fonts;
  } catch (err) {
    console.warn(`[fonts] 用户字体索引读取失败（视为空库）: ${err.message}`);
    return [];
  }
}

/**
 * Merge the user font library into a built-in registry view. This is the single
 * shared helper for the Node ResourceProvider (check/export) and the CLI export
 * preflight (cli/ensure.js), so "a deck declares only {family}" resolves through
 * the global user library everywhere. User entries carry `userFont: true` so
 * readiness checks can look in the user dir instead of the built-in roots.
 * @param {object} registry built-in registry ({fonts,systemFonts})
 * @param {{home?:string}} [options]
 * @returns {object} registry view with user entries first (same object when empty)
 */
export function mergeUserFonts(registry, { home = paths.home } = {}) {
  const base = registry && typeof registry === "object" ? registry : { fonts: [], systemFonts: [] };
  const users = readUserFontEntries({ home });
  if (!users.length) return base;
  const entries = users.map((e) => ({
    key: e.key,
    family: e.family,
    file: e.file,
    url: e.url || null,
    subset: e.subset,
    license: e.license || null,
    size: e.size,
    userFont: true,
  }));
  return { ...base, fonts: [...entries, ...(base.fonts || [])] };
}

/**
 * Is a user-library entry's byte file present (and, when the index records a
 * size, complete)? Used by the export preflight; built-in entries keep using
 * cli/resource-status.js#fontFileReady (home/package roots).
 * @param {object} entry entry from mergeUserFonts (with userFont:true)
 * @param {{home?:string}} [options]
 * @returns {boolean}
 */
export function userFontReady(entry, { home = paths.home } = {}) {
  const file = safeFontFileName(entry?.file);
  if (!file) return false;
  try {
    const stat = statSync(join(fontLibraryPaths({ home }).userDir, file));
    return typeof entry.size !== "number" || stat.size === entry.size;
  } catch {
    return false;
  }
}

function loadIndex(indexFile) {
  if (!existsSync(indexFile)) return { version: 1, fonts: [] };
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(indexFile, "utf8"));
  } catch (err) {
    throw new FontLibraryError("ERR_FONT_INDEX", `用户字体索引损坏（${indexFile}）: ${err.message}`);
  }
  const fonts = Array.isArray(parsed) ? parsed : parsed?.fonts;
  if (!Array.isArray(fonts)) {
    throw new FontLibraryError("ERR_FONT_INDEX", `用户字体索引格式不合法（${indexFile}）`);
  }
  return { version: 1, fonts: fonts.filter((e) => e && typeof e === "object") };
}

function saveIndex(indexFile, entries, tmpDir) {
  atomicWriteFile(indexFile, `${JSON.stringify({ version: 1, fonts: entries }, null, 2)}\n`, { tmpDir });
}

/** Unique file name in the user dir (never overwrite an unrelated font). */
function uniqueFile(userDir, file, ownerFile, entries, selfKey) {
  const used = new Set(entries.filter((e) => e.key !== selfKey && e.file).map((e) => e.file));
  const exists = (name) => used.has(name) || (name !== ownerFile && existsSync(join(userDir, name)));
  if (!exists(file)) return file;
  const m = /^(.*?)(\.[^.]+)$/.exec(file);
  const stem = m ? m[1] : file;
  const ext = m ? m[2] : "";
  for (let n = 2; n < 1000; n++) {
    const candidate = `${stem}-${n}${ext}`;
    if (!exists(candidate)) return candidate;
  }
  throw new FontLibraryError("ERR_FONT_STORE", `用户字体文件名冲突过多: ${file}`);
}

/**
 * Create the file-backed FontLibrary.
 * @param {object} [options]
 * @param {string} [options.home] home override (tests)
 * @param {Function} [options.fetchBytes] network override for importUrl (tests)
 * @param {object} [options.registry] preloaded built-in registry (tests)
 * @param {Function} [options.readBuiltinBytes] built-in byte reader override (tests)
 * @returns {ReturnType<typeof createFontLibrary>}
 */
export function createFileFontLibrary({ home = paths.home, fetchBytes = null, registry = null, readBuiltinBytes = null } = {}) {
  const { userDir, indexFile, tmpDir } = fontLibraryPaths({ home });
  let registryCache = registry;
  let builtinReader = readBuiltinBytes;

  const builtinRegistry = async () => {
    if (!registryCache) {
      try {
        registryCache = JSON.parse(readFileSync(join(FONT_REGISTRY_DIR, "registry.json"), "utf8"));
      } catch (err) {
        throw new FontLibraryError("ERR_FONT_INDEX", `内置字体注册表读取失败（${FONT_REGISTRY_DIR}）: ${err.message}`);
      }
    }
    return registryCache;
  };

  const defaultBuiltinBytes = async (entry) => {
    if (!entry?.file) return null;
    const p = resolveResourceFile("fonts", entry.file);
    if (!p) return null;
    try {
      return new Uint8Array(readFileSync(p));
    } catch {
      return null;
    }
  };

  const download = async (url) => {
    if (typeof fetchBytes === "function") return fetchBytes(url);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: ctl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const declared = Number(res.headers.get("content-length") || 0);
      if (declared > MAX_DOWNLOAD_BYTES) throw new Error(`响应过大（${declared} 字节）`);
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.length > MAX_DOWNLOAD_BYTES) throw new Error(`响应过大（${buf.length} 字节）`);
      return buf;
    } finally {
      clearTimeout(timer);
    }
  };

  const adapter = {
    async listUser() {
      return loadIndex(indexFile).fonts;
    },

    async saveUser(entry, bytes) {
      mkdirSync(userDir, { recursive: true });
      const requested = safeFontFileName(entry.file);
      if (!requested) throw new FontLibraryError("ERR_FONT_INVALID", `字体文件名不合法: ${entry.file}`);
      const state = loadIndex(indexFile);
      const idx = state.fonts.findIndex((e) => e.key === entry.key);
      const owner = idx >= 0 ? state.fonts[idx] : null;
      const file = uniqueFile(userDir, requested, owner?.file || null, state.fonts, entry.key);
      const target = resolve(userDir, file);
      if (target !== userDir && !target.startsWith(userDir + sep)) {
        throw new FontLibraryError("ERR_FONT_INVALID", `字体路径越界: ${file}`);
      }
      atomicWriteFile(target, bytes, { tmpDir });
      const stored = { ...entry, file };
      if (idx >= 0) state.fonts[idx] = stored;
      else state.fonts.push(stored);
      saveIndex(indexFile, state.fonts, tmpDir);
      // The previous file of this key is no longer referenced -> drop it.
      if (owner?.file && owner.file !== file && !state.fonts.some((e) => e.file === owner.file)) {
        try {
          rmSync(join(userDir, owner.file), { force: true });
        } catch {
          /* cleanup failure does not undo the import */
        }
      }
      return stored;
    },

    async removeUser(key) {
      const state = loadIndex(indexFile);
      const idx = state.fonts.findIndex((e) => e.key === key || e.family === key);
      if (idx < 0) return false;
      const [removed] = state.fonts.splice(idx, 1);
      saveIndex(indexFile, state.fonts, tmpDir);
      if (removed?.file && !state.fonts.some((e) => e.file === removed.file)) {
        try {
          rmSync(join(userDir, removed.file), { force: true });
        } catch {
          /* missing file is fine */
        }
      }
      return true;
    },

    async readUser(entry) {
      let file = entry?.file;
      if (!file && typeof entry === "string") {
        const state = loadIndex(indexFile);
        file = state.fonts.find((e) => e.key === entry || e.family === entry)?.file;
      }
      const safe = safeFontFileName(file);
      if (!safe) return null;
      const target = resolve(userDir, safe);
      if (target !== userDir && !target.startsWith(userDir + sep)) return null;
      try {
        return new Uint8Array(readFileSync(target));
      } catch {
        return null;
      }
    },

    readBuiltinRegistry: builtinRegistry,

    async readBuiltinBytes(entry) {
      return (builtinReader || defaultBuiltinBytes)(entry);
    },

    fetchBytes: download,
  };
  return createFontLibrary(adapter);
}
