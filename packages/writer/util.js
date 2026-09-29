// ============================================================================
// util.js — image size parsing / dataURL decoding (zero dependencies)
// ============================================================================

import { base64ToBytes, bytesToBase64, encodeUtf8 } from "../model/bytes.js";

/** Parse pixel dimensions [w, h] from PNG/JPEG/GIF bytes. Returns null on failure. */
export function imageSize(bytes) {
  if (!bytes || bytes.length < 24) return null;
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (isPng) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return [view.getUint32(16), view.getUint32(20)];
  }
  const isGif = bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46;
  if (isGif) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return [view.getUint16(6, true), view.getUint16(8, true)];
  }
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
  if (isJpeg) {
    const size = jpegSize(bytes);
    if (size) return size;
  }
  return null;
}

function jpegSize(bytes) {
  let i = 2;
  const len = bytes.length;
  while (i + 9 < len) {
    if (bytes[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = bytes[i + 1];
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      i += 2;
      continue;
    }
    const segLen = (bytes[i + 2] << 8) | bytes[i + 3];
    if (segLen < 2) return null;
    // SOF0-3, SOF5-7, SOF9-11, SOF13-15 (marker tells apart non-differential, non-progressive)
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      const height = (bytes[i + 5] << 8) | bytes[i + 6];
      const width = (bytes[i + 7] << 8) | bytes[i + 8];
      if (width > 0 && height > 0) return [width, height];
      return null;
    }
    i += 2 + segLen;
  }
  return null;
}

/** Decode a data URL → { bytes: Uint8Array, ext }. Returns null for a non-data URL. */
export function decodeDataUrl(dataUrl) {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) return null;
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  const meta = dataUrl.slice(5, comma);
  const mime = meta.split(";")[0] || "";
  const base64 = meta.includes(";base64");
  const body = dataUrl.slice(comma + 1);
  let bytes;
  if (base64) {
    bytes = base64ToBytes(body);
  } else {
    bytes = encodeUtf8(decodeURIComponent(body));
  }
  const ext = mimeToExt(mime);
  if (!ext) return null; // reject unsupported formats (svg/webp/…) outright
  return { bytes, ext };
}

function mimeToExt(mime) {
  const map = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif" };
  // svg/webp etc. are unsupported by PPT (no Content_Types declaration and no byte match), rejected outright
  return map[mime] || null;
}

/** Image extension → MIME ("png" / ".png" both accepted); null when unsupported. */
export function extToMime(ext) {
  const e = String(ext || "").toLowerCase().replace(/^\./, "");
  return { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif" }[e] || null;
}

/** Bytes + MIME → data URL (the inverse of decodeDataUrl; shared by editor image preload / handle reads). */
export function dataUrlOf(buf, mime) {
  return `data:${mime};base64,${bytesToBase64(new Uint8Array(buf))}`;
}

/** Replace illegal filename characters with underscores (Windows reserved chars + quotes/angle brackets; shared for export naming). */
export function safeFileName(name) {
  return String(name ?? "").replace(/[\\/:*?"<>|]/g, "_");
}
