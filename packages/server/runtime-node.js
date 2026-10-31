// ============================================================================
// server/runtime-node.js — Node adapters for ProjectRuntime (Node-only)
// ----------------------------------------------------------------------------
// The runtime package is environment-free; all filesystem work lives here:
//
//   createDiskProjectSource(manifest)     ProjectSource over a local .pptd project
//     · readSync()  synchronous read (CLI export/check keep their sync command surface)
//     · read()      readSync + bytes of every referenced image (for serialize raw)
//     · readMedia() project-relative PNG/JPEG/GIF bytes (null for missing/unsupported)
//     · write()     atomic per-file write with revision conflict detection
//
//   createFsResourceProvider({baseDir})   ResourceProvider over home/package assets
//     · fontBytes/fontStatus  user library -> built-in registry -> system -> missing
//                             (global user library first, D14; no network)
//     · iconSvg               Font Awesome registry + local SVG library
//     · imageBytes            project-relative image files
//     · fontRegistry/iconRegistry getters + fileExists (validation facts)
//
// Revision = "<manifest mtimeMs>:<manifest size>" (opaque to callers). The Node
// provider never fetches from the network: `fetchFonts`/`--fetch` is W6/W3 scope.
// ============================================================================

import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import * as yaml from "../model/vendor/js-yaml.mjs";
import { collectImageSrcs } from "../model/walk.js";
import { resolveIconName } from "../model/icon-fa.js";
import { assertRevision } from "../runtime/index.js";
import { IMAGE_EXTS, imageExtOf } from "../runtime/provider.js";
import { FONT_REGISTRY_DIR, ICON_REGISTRY_DIR, paths, resolveResourceFile } from "../paths.js";
import { createFileFontLibrary, readUserFontEntries } from "./font-library.js";

/** Project-relative path -> absolute path, refusing escapes from the project dir. */
function safeProjectPath(baseDir, rel) {
  if (typeof rel !== "string" || !rel) return null;
  const baseAbs = resolve(baseDir || ".");
  const abs = resolve(baseAbs, rel);
  if (abs !== baseAbs && !abs.startsWith(baseAbs + sep)) return null;
  return abs;
}

/** Read a project-relative image file; null for missing, remote/data URLs, unsupported formats. */
function readProjectFile(baseDir, rel) {
  if (typeof rel !== "string" || !rel || rel.startsWith("data:") || /^https?:/i.test(rel)) return null;
  const ext = imageExtOf(rel);
  if (!IMAGE_EXTS.has(ext)) return null;
  const abs = safeProjectPath(baseDir, rel);
  if (!abs) return null;
  try {
    return new Uint8Array(readFileSync(abs));
  } catch {
    return null;
  }
}

function writeAtomic(abs, data) {
  mkdirSync(dirname(abs), { recursive: true });
  const tmp = `${abs}.${process.pid.toString(36)}${Date.now().toString(36)}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, abs);
}

/**
 * Disk ProjectSource for a local .pptd project.
 * @param {string|{manifest:string}} manifestOrOptions manifest path (.pptd)
 * @returns {object} ProjectSource + readSync()
 */
export function createDiskProjectSource(manifestOrOptions) {
  const manifest = typeof manifestOrOptions === "string" ? manifestOrOptions : manifestOrOptions?.manifest;
  if (!manifest) throw new TypeError("createDiskProjectSource 需要 manifest 路径");
  const manifestPath = String(manifest);
  const baseDir = dirname(manifestPath);
  const manifestName = basename(manifestPath);

  const currentRevision = () => {
    try {
      const s = statSync(manifestPath);
      return `${s.mtimeMs}:${s.size}`;
    } catch {
      return "missing";
    }
  };

  /** Synchronous manifest + page read (same semantics as the old CLI loadProjectFiles). */
  function readSync() {
    const manifestText = readFileSync(manifestPath, "utf8");
    const manifestObj = yaml.load(manifestText);
    const pageFiles = new Map();
    for (const rel of manifestObj?.pages || []) {
      pageFiles.set(String(rel), readFileSync(join(baseDir, String(rel)), "utf8"));
    }
    return {
      manifestText,
      pageFiles,
      media: new Map(),
      manifestPath,
      manifestName,
      baseDir,
      revision: currentRevision(),
    };
  }

  return {
    capabilities: { writable: true, liveWatch: false, binary: true },

    readSync,

    /** @returns {Promise<object>} ProjectFiles including referenced image bytes */
    async read() {
      const files = readSync();
      const pageObjs = [];
      for (const text of files.pageFiles.values()) {
        try {
          pageObjs.push(yaml.load(text));
        } catch {
          /* a page parse failure only skips its image scan */
        }
      }
      const media = new Map();
      for (const src of collectImageSrcs(pageObjs)) {
        const bytes = readProjectFile(baseDir, src);
        if (bytes) media.set(src, bytes);
      }
      return { ...files, media };
    },

    /** @param {string} path @returns {Promise<Uint8Array|null>} */
    async readMedia(path) {
      return readProjectFile(baseDir, path);
    },

    /**
     * Atomic batch write with optional revision conflict detection.
     * @param {Array<{path:string,text?:string,bytes?:Uint8Array}>} files
     * @param {{expectedRevision?: string}} [opts]
     * @returns {Promise<number>}
     */
    async write(files, { expectedRevision } = {}) {
      if (!Array.isArray(files)) throw new TypeError("write 需要 SourceFile[]");
      assertRevision(currentRevision(), expectedRevision);
      for (const file of files) {
        if (!file || typeof file.path !== "string" || !file.path) throw new TypeError("SourceFile.path 必须是非空字符串");
        const abs = safeProjectPath(baseDir, file.path);
        if (!abs) throw new Error(`拒绝写入项目目录之外: ${file.path}`);
        if (file.bytes instanceof Uint8Array) writeAtomic(abs, file.bytes);
        else if (typeof file.text === "string") writeAtomic(abs, file.text);
        else throw new TypeError(`SourceFile ${file.path} 需要 text 或 bytes`);
      }
      return files.length;
    },
  };
}

function readRegistry(dir, label) {
  try {
    return JSON.parse(readFileSync(join(dir, "registry.json"), "utf8"));
  } catch (err) {
    throw new Error(`${label}注册表读取失败（${join(dir, "registry.json")}）: ${err.message}`);
  }
}

/**
 * ResourceProvider over the local asset libraries.
 * @param {object} [options]
 * @param {string} [options.baseDir] project directory for imageBytes/fileExists
 * @param {object} [options.fontRegistry] preloaded font registry
 * @param {object} [options.iconRegistry] preloaded icon registry
 * @param {object} [options.fontLibrary] injected FontLibrary (default: file-backed user library + package registry)
 * @param {string} [options.home] home override for the default font library (tests)
 * @returns {object} ResourceProvider + fontRegistry/iconRegistry/fileExists
 */
export function createFsResourceProvider({ baseDir = ".", fontRegistry = null, iconRegistry = null, fontLibrary = null, home = null } = {}) {
  let fontReg = fontRegistry;
  let iconReg = iconRegistry;
  const userHome = home || paths.home;
  // The registry exposed to check/export includes user entries first, so a deck
  // that declares only {family} still resolves through the global user library
  // (findFont sees user families/keys; bytes are then read by the provider).
  const fonts = () => {
    const base = (fontReg ??= readRegistry(FONT_REGISTRY_DIR, "字体"));
    const users = readUserFontEntries({ home: userHome });
    if (!users.length) return base;
    const entries = users.map((e) => ({
      key: e.key,
      family: e.family,
      file: e.file,
      url: e.url || null,
      subset: e.subset,
      license: e.license || null,
      size: e.size,
    }));
    return { ...base, fonts: [...entries, ...(base.fonts || [])] };
  };
  const icons = () => (iconReg ??= readRegistry(ICON_REGISTRY_DIR, "图标"));
  // Global user font library (user -> built-in registry -> system); bytes never fetched here.
  const library = fontLibrary || createFileFontLibrary(home ? { home } : {});

  /** Direct deck/project font file references win over library lookups (same roots as before). */
  const directFontBytes = async (ref) => {
    if (!ref?.file) return null;
    const p = resolveResourceFile("fonts", ref.file);
    if (!p) return null;
    try {
      return new Uint8Array(readFileSync(p));
    } catch {
      return null;
    }
  };

  return {
    /** @returns {object} font registry (lazy, package-only) */
    get fontRegistry() {
      return fonts();
    },

    /** @returns {object} icon registry (lazy, package-only) */
    get iconRegistry() {
      return icons();
    },

    /** @param {object} ref @returns {Promise<Uint8Array|null>} */
    async fontBytes(ref) {
      const direct = await directFontBytes(ref);
      if (direct) return direct;
      const entry = await library.resolve(ref);
      if (!entry || entry.source === "system") return null;
      return library.read(entry);
    },

    /** @param {object} ref @returns {Promise<"ready"|"system"|"missing"|"fetchable">} */
    async fontStatus(ref) {
      if (!ref) return "missing";
      if (ref.file && resolveResourceFile("fonts", ref.file)) return "ready";
      const entry = await library.resolve(ref);
      if (!entry) return ref.url ? "fetchable" : "missing";
      if (entry.source === "system") return "system";
      if (entry.source === "builtin") {
        if (entry.file && resolveResourceFile("fonts", entry.file)) return "ready";
        // Injected/custom libraries may serve built-in bytes outside the standard roots.
        if (await library.read(entry)) return "ready";
        return entry.url || ref.url ? "fetchable" : "missing";
      }
      // user library entry: bytes present -> ready; stale index with a URL -> fetchable
      if (await library.read(entry)) return "ready";
      return entry.url || ref.url ? "fetchable" : "missing";
    },

    /** @param {string} name @returns {Promise<string|null>} */
    async iconSvg(name) {
      const hit = resolveIconName(name, icons());
      if (!hit) return null;
      const p = resolveResourceFile("icons", `${hit.dir}/${hit.name}.svg`);
      if (!p) return null;
      try {
        return readFileSync(p, "utf8");
      } catch {
        return null;
      }
    },

    /** @param {string} src @returns {Promise<Uint8Array|null>} */
    async imageBytes(src) {
      return readProjectFile(baseDir, src);
    },

    /** @param {string} rel @returns {boolean} */
    fileExists(rel) {
      const abs = safeProjectPath(baseDir, rel);
      return !!abs && existsSync(abs);
    },

    async inventory() {
      const entries = await library.list({ includeSystem: true });
      return {
        fonts: entries.map((f) => ({
          key: f.key,
          family: f.family,
          file: f.file,
          source: f.source === "builtin"
            ? (f.file && resolveResourceFile("fonts", f.file) ? "builtin" : "fetchable")
            : f.source,
          size: f.size,
          subset: f.subset,
        })),
        icons: (icons().icons || []).map((i) => ({ name: i.name, styles: i.styles })),
        themes: [],
      };
    },
  };
}
