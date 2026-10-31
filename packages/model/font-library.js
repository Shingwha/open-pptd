// ============================================================================
// model/font-library.js — global font library core (pure, browser + Node)
// ----------------------------------------------------------------------------
// One library shared by the editor and CLI (D14):
//   built-in registry (assets/fonts/registry.json, read-only)
//   + user fonts (copied bytes + metadata in an injected home store)
//   + system fonts (declared only, never embedded).
//
// Resolution order (interfaces.md §3 / theme-font.md §6): user library →
// built-in registry → system → missing. deck.fonts only references a family;
// byte reading/fetching is delegated to the injected adapter, so this module
// stays environment-free (no node:* / DOM).
// ============================================================================

import { parseFontInfo } from "./font.js";
import { findFont, findSystemFont } from "./font-registry.js";

/** Maximum user font file size accepted by the library core (64 MB). */
export const MAX_FONT_BYTES = 64 * 1024 * 1024;

/** Coded font-library error shared by the core, Node adapter and HTTP API. */
export class FontLibraryError extends Error {
  /**
   * @param {string} code ERR_FONT_* stable code
   * @param {string} message human-readable message (Chinese, user-facing)
   * @param {object} [details] optional structured fields
   */
  constructor(code, message, details = {}) {
    super(message);
    this.name = "FontLibraryError";
    this.code = code;
    Object.assign(this, details);
  }
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * Safe user-library file name (basename only; no traversal / Windows-hostile
 * characters). Returns null when nothing usable remains.
 * @param {string} name
 * @returns {string|null}
 */
export function safeFontFileName(name) {
  let base = String(name || "").replace(/\\/g, "/");
  base = base.split("/").pop() || "";
  base = base.replace(/[\u0000-\u001f<>:"|?*]/g, "_").trim();
  base = base.replace(/^\.+/, "");
  if (!base || base === "." || base === "..") return null;
  if (!/\.(ttf|otf)$/i.test(base)) return null;
  return base.slice(0, 160);
}

/** Normalize a display/metadata key (not a path; control chars stripped). */
function normalizeFontKey(raw) {
  const key = String(raw || "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 120);
  return key || null;
}

/** sfnt magic -> { ext, kind }; null/unsupported otherwise. */
function fontMagic(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 4) return null;
  if (bytes[0] === 0x00 && bytes[1] === 0x01 && bytes[2] === 0x00 && bytes[3] === 0x00) return { ext: "ttf", kind: "TrueType" };
  const tag = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (tag === "OTTO") return { ext: "otf", kind: "CFF/OTF" };
  if (tag === "ttcf") return { ext: "ttc", kind: "font-collection" };
  return null;
}

function toBytes(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  return null;
}

function deriveFile(key, family, ext) {
  const base = String(family || key || "font").replace(/[\u0000-\u001f<>:"|?*\\/]/g, "_").trim() || "font";
  return `${base.slice(0, 120)}.${ext}`;
}

function normalizeUserEntry(raw) {
  if (!isPlainObject(raw)) return null;
  const family = typeof raw.family === "string" ? raw.family.trim() : "";
  const key = normalizeFontKey(raw.key || family);
  const file = safeFontFileName(raw.file);
  if (!family || !key || !file) return null;
  const source = raw.source === "url" ? "url" : "user";
  const out = {
    key,
    family,
    file,
    source,
    license: typeof raw.license === "string" ? raw.license : null,
    size: Number.isFinite(raw.size) ? raw.size : 0,
    subset: raw.subset !== false,
  };
  if (typeof raw.url === "string" && raw.url) out.url = raw.url;
  return out;
}

/**
 * Create the FontLibrary over an injected storage/network adapter (factory).
 *
 * Adapter contract (all async unless noted):
 *   listUser(): FontEntry[]                  user index entries (normalized here)
 *   saveUser(entry, bytes): FontEntry        persist bytes + metadata; may rename `file`
 *   removeUser(key): boolean                 remove a user entry (bytes + index)
 *   readUser(entry): Uint8Array|null         user bytes
 *   readBuiltinRegistry(): {fonts,systemFonts}
 *   readBuiltinBytes(entry): Uint8Array|null
 *   fetchBytes(url): Uint8Array              optional; required for importUrl
 *
 * @param {object} adapter
 * @returns {{list:Function,read:Function,importFile:Function,importUrl:Function,remove:Function,resolve:Function}}
 */
export function createFontLibrary(adapter) {
  if (!adapter || typeof adapter.listUser !== "function" || typeof adapter.saveUser !== "function"
    || typeof adapter.removeUser !== "function" || typeof adapter.readUser !== "function"
    || typeof adapter.readBuiltinRegistry !== "function" || typeof adapter.readBuiltinBytes !== "function") {
    throw new TypeError("createFontLibrary 需要 {listUser,saveUser,removeUser,readUser,readBuiltinRegistry,readBuiltinBytes} 适配器");
  }
  let registryCache = null;
  const registry = async () => (registryCache ||= await adapter.readBuiltinRegistry());

  function builtinEntry(hit) {
    return {
      key: hit.key || hit.family,
      family: hit.family,
      file: hit.file || null,
      source: "builtin",
      license: hit.license || null,
      size: typeof hit.size === "number" ? hit.size : 0,
      subset: hit.subset !== false,
      url: hit.url || null,
    };
  }

  function systemEntry(hit) {
    return {
      key: hit.key || hit.family,
      family: hit.family,
      file: null,
      source: "system",
      license: null,
      size: 0,
      subset: false,
      platform: hit.platform || null,
    };
  }

  async function userEntries() {
    let raw;
    try {
      raw = await adapter.listUser();
    } catch {
      return [];
    }
    return (raw || []).map(normalizeUserEntry).filter(Boolean);
  }

  async function list({ includeSystem = false } = {}) {
    const reg = await registry();
    const builtin = (reg.fonts || []).map(builtinEntry);
    const user = await userEntries();
    const out = [...builtin, ...user];
    if (includeSystem) out.push(...(reg.systemFonts || []).map(systemEntry));
    return clone(out);
  }

  function matchUser(entries, ref) {
    const family = typeof ref === "string" ? ref : ref?.family;
    const key = typeof ref === "string" ? null : ref?.key;
    const file = typeof ref === "string" ? null : ref?.file;
    const base = file ? String(file).replace(/\\/g, "/").split("/").pop() : null;
    return entries.find((e) =>
      (family && e.family === family)
      || (key && e.key === key)
      || (base && e.file === base)
    ) || null;
  }

  function matchBuiltin(reg, ref) {
    const family = typeof ref === "string" ? ref : ref?.family;
    const key = typeof ref === "string" ? null : ref?.key;
    const file = typeof ref === "string" ? null : ref?.file;
    let hit = (family && findFont(reg, family)) || (key && findFont(reg, key)) || null;
    if (!hit && file) {
      const base = String(file).replace(/\\/g, "/").split("/").pop();
      hit = (reg.fonts || []).find((f) => f.file === base) || null;
    }
    return hit ? builtinEntry(hit) : null;
  }

  function matchSystem(reg, ref) {
    const family = typeof ref === "string" ? ref : ref?.family;
    const key = typeof ref === "string" ? null : ref?.key;
    const hit = (family && findSystemFont(reg, family)) || (key && findSystemFont(reg, key)) || null;
    return hit ? systemEntry(hit) : null;
  }

  /** deck/project ref -> user library -> built-in registry -> system -> null. */
  async function resolve(ref) {
    if (!ref || (typeof ref !== "string" && !isPlainObject(ref))) return null;
    if (typeof ref === "string" && !ref.trim()) return null;
    const users = await userEntries();
    const userHit = matchUser(users, ref);
    if (userHit) return clone(userHit);
    const reg = await registry();
    const builtinHit = matchBuiltin(reg, ref);
    if (builtinHit) return clone(builtinHit);
    const systemHit = matchSystem(reg, ref);
    if (systemHit) return clone(systemHit);
    return null;
  }

  /** Read entry bytes (user/builtin); system fonts and missing bytes return null. */
  async function read(ref) {
    const entry = await resolve(ref);
    if (!entry || entry.source === "system") return null;
    try {
      if (entry.source === "user" || entry.source === "url") return await adapter.readUser(entry);
      return await adapter.readBuiltinBytes(entry);
    } catch {
      return null;
    }
  }

  /**
   * Import font bytes into the user library.
   * Family falls back to the font's internal name (name ID16/ID1) when meta.family
   * is omitted; a non-sfnt payload is rejected with ERR_FONT_INVALID.
   */
  async function importFile(bytesInput, meta = {}) {
    const bytes = toBytes(bytesInput);
    if (!bytes || !bytes.length) throw new FontLibraryError("ERR_FONT_INVALID", "字体文件为空");
    if (bytes.length > MAX_FONT_BYTES) {
      throw new FontLibraryError("ERR_FONT_INVALID", `字体文件过大（${bytes.length} 字节，上限 ${MAX_FONT_BYTES}）`);
    }
    const magic = fontMagic(bytes);
    if (!magic) throw new FontLibraryError("ERR_FONT_INVALID", "不是有效的 TTF/OTF 字体（sfnt 魔数不匹配）");
    if (magic.kind === "font-collection") throw new FontLibraryError("ERR_FONT_INVALID", "暂不支持 TTC 字体集合，请导入单个 TTF/OTF");
    let family = typeof meta.family === "string" ? meta.family.trim() : "";
    if (!family) {
      try {
        family = parseFontInfo(bytes).family;
      } catch {
        family = "";
      }
    }
    if (!family) throw new FontLibraryError("ERR_FONT_INVALID", "无法确定字体族名（请提供 family，或导入含 name 表的 TTF/OTF）");
    const key = normalizeFontKey(meta.key || family);
    if (!key) throw new FontLibraryError("ERR_FONT_INVALID", "字体 key 为空");
    const file = (meta.file && safeFontFileName(meta.file)) || safeFontFileName(deriveFile(key, family, magic.ext));
    if (!file) throw new FontLibraryError("ERR_FONT_INVALID", `字体文件名不合法: ${meta.file || ""}`);
    const entry = {
      key,
      family,
      file,
      source: meta.source === "url" ? "url" : "user",
      license: typeof meta.license === "string" && meta.license.trim() ? meta.license.trim() : null,
      size: bytes.length,
      subset: meta.subset !== false,
    };
    if (typeof meta.url === "string" && meta.url) entry.url = meta.url;
    const stored = await adapter.saveUser(entry, bytes);
    return clone(normalizeUserEntry(stored && stored.key ? stored : entry) || entry);
  }

  /** Download a font URL through the injected adapter and store it in the user library. */
  async function importUrl(url, meta = {}) {
    let parsed;
    try {
      parsed = new URL(String(url || ""));
    } catch {
      throw new FontLibraryError("ERR_FONT_INVALID", `字体 URL 不合法: ${url}`);
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new FontLibraryError("ERR_FONT_INVALID", `字体 URL 只支持 http/https: ${url}`);
    }
    if (typeof adapter.fetchBytes !== "function") {
      throw new FontLibraryError("ERR_FONT_FETCH", "当前适配器不支持下载字体（缺少 fetchBytes）", { url: String(url) });
    }
    let bytes;
    try {
      bytes = await adapter.fetchBytes(parsed.href);
    } catch (err) {
      throw new FontLibraryError("ERR_FONT_FETCH", `字体下载失败: ${err?.message || err}`, { url: parsed.href });
    }
    const urlName = decodeURIComponent(parsed.pathname.split("/").pop() || "");
    return importFile(bytes, {
      ...meta,
      source: "url",
      url: parsed.href,
      file: meta.file || urlName || null,
    });
  }

  /** Remove a user font; built-in/system entries are read-only. */
  async function remove(ref) {
    const entry = await resolve(ref);
    if (!entry) throw new FontLibraryError("ERR_FONT_NOT_FOUND", `字体不存在: ${typeof ref === "string" ? ref : ref?.key || ref?.family || ""}`);
    if (entry.source !== "user" && entry.source !== "url") {
      throw new FontLibraryError("ERR_FONT_BUILTIN_READONLY", `字体 ${entry.family} 来自${entry.source === "system" ? "系统" : "内置库"}，不能删除`, { key: entry.key });
    }
    const removed = await adapter.removeUser(entry.key);
    if (!removed) throw new FontLibraryError("ERR_FONT_NOT_FOUND", `字体不存在: ${entry.key}`);
    return entry;
  }

  return { list, read, importFile, importUrl, remove, resolve };
}
