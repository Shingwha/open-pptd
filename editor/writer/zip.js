// ============================================================================
// zip.js — 最小 ZIP 写入器（零依赖，store 无压缩方法）
// ----------------------------------------------------------------------------
// PPTX 允许 method 0（stored），无需压缩库。CRC32 用标准查表法。
// 文件名一律 UTF-8 编码（设置 flag bit 11）。
// ============================================================================

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data) {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export class ZipWriter {
  constructor() {
    this.entries = []; // { name, data: Uint8Array, mtime }
  }

  /** 添加一个文件条目。name 为 ZIP 内路径（正斜杠）。data 可为 string/Uint8Array。 */
  add(name, data) {
    const bytes = typeof data === "string" ? encodeUtf8(data) : data;
    this.entries.push({ name, data: bytes });
  }

  build() {
    const enc = (s) => encodeUtf8(s);
    const chunks = [];
    const central = [];
    let offset = 0;

    for (const entry of this.entries) {
      const nameBytes = enc(entry.name);
      const crc = crc32(entry.data);
      const size = entry.data.length;
      const mtime = dosDateTime(new Date());

      // Local file header
      const local = new Uint8Array(30 + nameBytes.length);
      const dv = new DataView(local.buffer);
      dv.setUint32(0, 0x04034b50, true); // signature
      dv.setUint16(4, 20, true); // version needed
      dv.setUint16(6, 0x0800, true); // flags: UTF-8 name
      dv.setUint16(8, 0, true); // method: store
      dv.setUint16(10, mtime.time, true);
      dv.setUint16(12, mtime.date, true);
      dv.setUint32(14, crc, true);
      dv.setUint32(18, size, true); // compressed size
      dv.setUint32(22, size, true); // uncompressed size
      dv.setUint16(26, nameBytes.length, true);
      dv.setUint16(28, 0, true); // extra length
      local.set(nameBytes, 30);
      chunks.push(local, entry.data);

      central.push({
        nameBytes,
        crc,
        size,
        localOffset: offset,
        time: mtime.time,
        date: mtime.date,
      });
      offset += local.length + size;
    }

    const cdStart = offset;
    const cdChunks = [];
    for (const c of central) {
      const rec = new Uint8Array(46 + c.nameBytes.length);
      const dv = new DataView(rec.buffer);
      dv.setUint32(0, 0x02014b50, true); // central directory signature
      dv.setUint16(4, 20, true); // version made by
      dv.setUint16(6, 20, true); // version needed
      dv.setUint16(8, 0x0800, true); // flags
      dv.setUint16(10, 0, true); // method store
      dv.setUint16(12, c.time, true);
      dv.setUint16(14, c.date, true);
      dv.setUint32(16, c.crc, true);
      dv.setUint32(20, c.size, true);
      dv.setUint32(24, c.size, true);
      dv.setUint16(28, c.nameBytes.length, true);
      dv.setUint16(30, 0, true); // extra
      dv.setUint16(32, 0, true); // comment
      dv.setUint16(34, 0, true); // disk number
      dv.setUint16(36, 0, true); // internal attrs
      dv.setUint32(38, 0, true); // external attrs
      dv.setUint32(42, c.localOffset, true);
      rec.set(c.nameBytes, 46);
      cdChunks.push(rec);
    }

    const cdSize = cdChunks.reduce((s, c) => s + c.length, 0);
    const eocd = new Uint8Array(22);
    const dv = new DataView(eocd.buffer);
    dv.setUint32(0, 0x06054b50, true); // EOCD signature
    dv.setUint16(8, central.length, true); // total entries (disk)
    dv.setUint16(10, central.length, true); // total entries
    dv.setUint32(12, cdSize, true);
    dv.setUint32(16, cdStart, true);
    dv.setUint16(20, 0, true); // comment length

    const total = cdStart + cdSize + eocd.length;
    const out = new Uint8Array(total);
    let pos = 0;
    for (const chunk of [...chunks, ...cdChunks, eocd]) {
      out.set(chunk, pos);
      pos += chunk.length;
    }
    return out;
  }
}

function dosDateTime(date) {
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

export function encodeUtf8(str) {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(str);
  }
  // Node fallback
  return Buffer.from(str, "utf8");
}
