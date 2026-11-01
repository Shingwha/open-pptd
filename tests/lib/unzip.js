// ============================================================================
// tests/lib/unzip.js — minimal ZIP reader (test-only, zero dependencies)
// ----------------------------------------------------------------------------
// Parses EOCD + Central Directory and reads entries by name. Stored (method 0)
// and deflated (method 8) entries are supported, so the same reader serves the
// writer's store-only PPTX output and release zip packages. Used by tests/ to
// inspect package structure; `readZipEntries` exposes metadata only.
// ============================================================================

import { inflateRawSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;

function asBytes(bytes) {
  return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
}

/** Locate the End Of Central Directory record (last 22 bytes + optional comment). */
function findEocd(dv, length) {
  const first = Math.max(0, length - 22 - 0xffff);
  for (let i = length - 22; i >= first; i--) {
    if (dv.getUint32(i, true) === EOCD_SIG) return i;
  }
  throw new Error("不是有效的 ZIP（未找到 EOCD）");
}

/** Read every central-directory entry → [{ name, size, compSize, method, localOff }]. */
export function readZipEntries(bytes) {
  const b = asBytes(bytes);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const eocd = findEocd(dv, b.length);
  const entryCount = dv.getUint16(eocd + 10, true);
  const cdOffset = dv.getUint32(eocd + 16, true);

  const entries = [];
  let off = cdOffset;
  for (let i = 0; i < entryCount; i++) {
    if (dv.getUint32(off, true) !== CENTRAL_SIG) throw new Error("Central Directory 解析失败");
    const method = dv.getUint16(off + 10, true);
    const compSize = dv.getUint32(off + 20, true);
    const size = dv.getUint32(off + 24, true);
    const nameLen = dv.getUint16(off + 28, true);
    const extraLen = dv.getUint16(off + 30, true);
    const commentLen = dv.getUint16(off + 32, true);
    const localOff = dv.getUint32(off + 42, true);
    const name = Buffer.from(b.subarray(off + 46, off + 46 + nameLen)).toString("utf8");
    entries.push({ name, size, compSize, method, localOff });
    off += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** Read all ZIP entries → [{ name, data }] (binary-safe, store + deflate). */
export function readZip(bytes) {
  const b = asBytes(bytes);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const entries = [];
  for (const entry of readZipEntries(b)) {
    const { localOff, compSize, method } = entry;
    const nameLenL = dv.getUint16(localOff + 26, true);
    const extraLenL = dv.getUint16(localOff + 28, true);
    const dataStart = localOff + 30 + nameLenL + extraLenL;
    const raw = b.subarray(dataStart, dataStart + compSize);
    let data;
    if (method === 0) data = raw;
    else if (method === 8) data = new Uint8Array(inflateRawSync(raw));
    else throw new Error(`不支持的 ZIP 压缩方式（method=${method}），测试仅支持 store/deflate`);
    entries.push({ name: entry.name, data });
  }
  return entries;
}

/** Get an entry's text by name (UTF-8). */
export function readText(bytes, name) {
  const e = readZip(bytes).find((x) => x.name === name);
  return e ? Buffer.from(e.data).toString("utf8") : null;
}

/** Extract every entry into a directory, returning the list of relative paths. */
export function unzip(bytes, dir) {
  const files = [];
  for (const e of readZip(bytes)) {
    if (e.name.endsWith("/")) continue;
    const p = join(dir, e.name);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, e.data);
    files.push(e.name);
  }
  return files;
}
