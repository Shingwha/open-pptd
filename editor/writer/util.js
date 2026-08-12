// ============================================================================
// util.js — 图片尺寸解析 / dataURL 解码（零依赖）
// ============================================================================

/** 解析 PNG/JPEG/GIF 图片字节的像素尺寸 [w, h]。失败返回 null。 */
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
    // SOF0-3, SOF5-7, SOF9-11, SOF13-15（非差分、非渐进需要看 marker）
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

/** 解码 data URL → { bytes: Uint8Array, ext }。非 data URL 返回 null。 */
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
    const bin = atobSafe(body);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } else {
    bytes = encodeUtf8Safe(decodeURIComponent(body));
  }
  const ext = mimeToExt(mime);
  if (!ext) return null; // 不支持的格式（svg/webp/…）直接拒绝
  return { bytes, ext };
}

function mimeToExt(mime) {
  const map = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif" };
  // svg/webp 等 PPT 不支持（Content_Types 无声明且字节不匹配），一律拒绝
  return map[mime] || null;
}

/** 图片扩展名 → MIME（"png" / ".png" 均可）；不支持返回 null。 */
export function extToMime(ext) {
  const e = String(ext || "").toLowerCase().replace(/^\./, "");
  return { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif" }[e] || null;
}

function atobSafe(s) {
  if (typeof atob === "function") return atob(s);
  // Node
  return Buffer.from(s, "base64").toString("binary");
}

function encodeUtf8Safe(s) {
  if (typeof TextEncoder === "function") return new TextEncoder().encode(s);
  return Buffer.from(s, "utf8");
}
