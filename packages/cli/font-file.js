// cli/font-file.js — font byte validation shared by readiness and download
// Integrity model (deliberately not "size == registry size"):
//   transport: Content-Length vs received bytes, only for identity responses (fetch
//   decodes gzip/br, so the header then describes the compressed body and is ignored).
//   format: sfnt magic (OTTO / 0x00010000 / "true"). Atomic writes mean readiness only
//   needs presence + magic; registry `size` is advisory (upstream re-releases change length).

import { closeSync, openSync, readSync } from "node:fs";

/** Is the buffer a plausible sfnt (TrueType/OpenType/TrueType-collection) header? */
export function isSfntMagic(buf) {
  if (!buf || buf.length < 4) return false;
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  const sig = b.subarray(0, 4).toString("latin1");
  return sig === "OTTO" || sig === "true" || (b[0] === 0 && b[1] === 1 && b[2] === 0 && b[3] === 0);
}

/** Read the first 4 bytes of a font file (null when the file is shorter/unreadable). */
export function readFontMagic(path) {
  let fd;
  try {
    fd = openSync(path, "r");
    const head = Buffer.alloc(4);
    return readSync(fd, head, 0, 4, 0) === 4 ? head : null;
  } catch {
    return null;
  } finally {
    if (fd != null) {
      try {
        closeSync(fd);
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * Verify downloaded font bytes.
 * @param {Buffer|Uint8Array} bytes
 * @param {{contentLength?: number|null}} [opts] declared Content-Length (omit for encoded/chunked responses)
 * @returns {{ok:boolean, reason?:string}}
 */
export function verifyFontBytes(bytes, { contentLength = null } = {}) {
  if (!bytes || bytes.length < 4) return { ok: false, reason: "响应为空或过短" };
  if (Number.isFinite(contentLength) && contentLength > 0 && bytes.length !== contentLength) {
    return { ok: false, reason: `传输不完整（${bytes.length}/${contentLength} 字节）` };
  }
  if (!isSfntMagic(bytes)) return { ok: false, reason: "响应不是有效字体文件" };
  return { ok: true };
}
