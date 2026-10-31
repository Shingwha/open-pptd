// ============================================================================
// runtime/provider.js — ResourceProvider contract, image helpers, memory provider
// ----------------------------------------------------------------------------
// ResourceProvider (interfaces.md §3):
//   fontBytes(ref): Promise<Uint8Array|null>
//   fontStatus(ref): Promise<"ready"|"system"|"missing"|"fetchable">
//   iconSvg(name): Promise<string|null>
//   imageBytes(src): Promise<Uint8Array|null>
//   inventory?(): Promise<{fonts: object[], icons: object[], themes: object[]}>
//
// Core image formats are PNG/JPEG/GIF only (the writer embeds exactly these);
// WebP/SVG conversion belongs to the skill/agent side, not the core. Missing and
// unsupported resources resolve to null plus diagnostics in resolveProject.
// ============================================================================

import { base64ToBytes, encodeUtf8 } from "../model/bytes.js";
import { UnsupportedFormatError } from "./errors.js";
import { extname, normalizePath } from "./paths.js";

/** Image extensions accepted by the core. */
export const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif"]);

/** Normalize an extension to the canonical core id ("jpeg" -> "jpg"). */
export function canonicalImageExt(ext) {
  const e = String(ext ?? "").toLowerCase().replace(/^\./, "");
  return e === "jpeg" ? "jpg" : e;
}

/** Project path/URL -> canonical image extension ("" when absent). */
export function imageExtOf(src) {
  const clean = normalizePath(src).split(/[?#]/)[0];
  return canonicalImageExt(extname(clean));
}

/** Byte signature -> canonical format id, or null when not PNG/JPEG/GIF. */
export function imageFormatOfBytes(bytes) {
  if (!bytes || bytes.length < 8) return null;
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "jpg";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "gif";
  return null;
}

/**
 * Strict format gate for callers that cannot silently drop an image.
 * @param {Uint8Array} bytes
 * @param {string} ext expected extension
 * @returns {Uint8Array} bytes
 * @throws {UnsupportedFormatError}
 */
export function assertImageFormat(bytes, ext) {
  const expected = canonicalImageExt(ext);
  if (!IMAGE_EXTS.has(expected)) {
    throw new UnsupportedFormatError(expected || "unknown", "核心仅支持 png/jpg/gif");
  }
  const actual = imageFormatOfBytes(bytes);
  if (actual == null) throw new UnsupportedFormatError(expected, "字节签名不是 png/jpg/gif");
  if (actual !== expected) {
    throw new UnsupportedFormatError(actual, `字节签名与扩展名 ${expected} 不一致`);
  }
  return bytes;
}

const DATA_MIME_EXT = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif" };

/**
 * Decode a data: URL into image bytes.
 * @param {string} dataUrl
 * @returns {{bytes: Uint8Array, ext: string}|null} null for malformed/signature-mismatched payloads
 * @throws {UnsupportedFormatError} for formats the core does not accept (webp/svg/...)
 */
export function decodeImageDataUrl(dataUrl) {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) return null;
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  const meta = dataUrl.slice(5, comma);
  const mime = (meta.split(";")[0] || "").toLowerCase();
  const ext = DATA_MIME_EXT[mime];
  if (!ext) throw new UnsupportedFormatError(mime || "data-url", "核心仅支持 png/jpg/gif");
  const body = dataUrl.slice(comma + 1);
  let bytes;
  try {
    bytes = meta.toLowerCase().includes(";base64") ? base64ToBytes(body) : encodeUtf8(decodeURIComponent(body));
  } catch {
    return null;
  }
  if (imageFormatOfBytes(bytes) !== ext) return null;
  return { bytes, ext };
}

/**
 * @typedef {Object} FontRef
 * @property {string} family
 * @property {string} [key]
 * @property {string} [file]
 * @property {string} [url]
 * @property {boolean} [subset]
 */

/**
 * @typedef {Object} ResourceProvider
 * @property {(ref: FontRef) => Promise<Uint8Array|null>} fontBytes
 * @property {(ref: FontRef) => Promise<"ready"|"system"|"missing"|"fetchable">} fontStatus
 * @property {(name: string) => Promise<string|null>} iconSvg
 * @property {(src: string) => Promise<Uint8Array|null>} imageBytes
 * @property {() => Promise<{fonts: object[], icons: object[], themes: object[]}>} [inventory]
 */

function entryBytes(value) {
  if (value == null) return null;
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return value.bytes instanceof Uint8Array ? value.bytes : null;
}

function entryStatus(value) {
  if (value == null) return "missing";
  if (value instanceof Uint8Array || value instanceof ArrayBuffer || value.bytes instanceof Uint8Array) return "ready";
  if (typeof value === "object" && typeof value.status === "string") return value.status;
  if (typeof value === "string") return value;
  return "missing";
}

/**
 * In-memory ResourceProvider for tests and browser hosts.
 * Entries may be raw bytes (ready) or a status string ("system"/"fetchable"/"missing").
 * @param {object} [options]
 * @param {Record<string, any>} [options.fonts] family/key/file -> bytes or status
 * @param {Record<string, string>} [options.icons] iconName -> SVG text
 * @param {Record<string, any>} [options.images] project-relative src -> bytes
 * @param {object} [options.fontRegistry] registry object exposed for checkProject
 * @param {object} [options.iconRegistry] registry object exposed for checkProject
 * @returns {ResourceProvider & {fileExists: (path:string)=>boolean, fontRegistry?: object, iconRegistry?: object}}
 */
export function memoryProvider({ fonts = {}, icons = {}, images = {}, fontRegistry, iconRegistry } = {}) {
  const pick = (record, ref) => {
    if (!ref) return undefined;
    for (const key of [ref.family, ref.key, ref.file]) {
      if (key != null && Object.prototype.hasOwnProperty.call(record, key)) return record[key];
    }
    return undefined;
  };

  return {
    fontRegistry,
    iconRegistry,

    async fontBytes(ref) {
      return entryBytes(pick(fonts, ref));
    },

    async fontStatus(ref) {
      return entryStatus(pick(fonts, ref));
    },

    async iconSvg(name) {
      const value = icons[name];
      return typeof value === "string" ? value : null;
    },

    async imageBytes(src) {
      return entryBytes(images[src]);
    },

    fileExists(path) {
      return Object.prototype.hasOwnProperty.call(images, path);
    },

    async inventory() {
      return {
        fonts: Object.entries(fonts).map(([family, value]) => ({ family, status: entryStatus(value) })),
        icons: Object.keys(icons).map((name) => ({ name })),
        themes: [],
      };
    },
  };
}
