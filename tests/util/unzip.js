// ============================================================================
// tests/util/unzip.js — 极简 ZIP 读取器（仅测试用，零依赖）
// ----------------------------------------------------------------------------
// 配合 ZipWriter（store 无压缩）使用：解析 EOCD + Central Directory，
// 按文件名读取条目数据。用途：tests/ 校验 buildPptx 输出的包结构。
// ============================================================================

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

/** 读取 ZIP 全部条目 → [{ name, data }]（二进制安全）。 */
export function readZip(bytes) {
  // EOCD：末尾 22 字节 + 注释（倒找签名 PK\x05\x06）
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0 && eocd < 0; i--) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) {
      eocd = i;
    }
  }
  if (eocd < 0) throw new Error("不是有效的 ZIP（未找到 EOCD）");
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entryCount = dv.getUint16(eocd + 10, true);
  const cdOffset = dv.getUint32(eocd + 16, true);

  const entries = [];
  let off = cdOffset;
  for (let i = 0; i < entryCount; i++) {
    if (bytes[off] !== 0x50 || bytes[off + 1] !== 0x4b || bytes[off + 2] !== 0x01 || bytes[off + 3] !== 0x02) {
      throw new Error("Central Directory 解析失败");
    }
    const method = dv.getUint16(off + 10, true);
    if (method !== 0) throw new Error(`条目使用了压缩（method=${method}），测试仅支持 store`);
    const compSize = dv.getUint32(off + 20, true);
    const nameLen = dv.getUint16(off + 28, true);
    const extraLen = dv.getUint16(off + 30, true);
    const commentLen = dv.getUint16(off + 32, true);
    const localOff = dv.getUint32(off + 42, true);
    const name = Buffer.from(bytes.subarray(off + 46, off + 46 + nameLen)).toString("utf8");

    const nameLenL = dv.getUint16(localOff + 26, true);
    const extraLenL = dv.getUint16(localOff + 28, true);
    const dataStart = localOff + 30 + nameLenL + extraLenL;
    entries.push({ name, data: bytes.subarray(dataStart, dataStart + compSize) });

    off += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** 按名取条目文本（UTF-8）。 */
export function readText(bytes, name) {
  const e = readZip(bytes).find((x) => x.name === name);
  return e ? Buffer.from(e.data).toString("utf8") : null;
}

/** 解压全部条目到目录，返回文件相对路径列表。 */
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
