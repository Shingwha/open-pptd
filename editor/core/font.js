// ============================================================================
// font.js — 字体字节工具：元信息解析 / EOT 封装 / TTF 子集化（双端零依赖）
// ----------------------------------------------------------------------------
// PPTX 嵌入字体全链路的核心（规格见 docs/pptx-font-embedding.md）：
//   1. parseFontInfo  读 OS/2/head/name 表 → 嵌入权限 / 字体名 / EOT 头字段
//   2. checkEmbeddable fsType 嵌入权限校验（0x0002 Restricted 禁止嵌入）
//   3. buildEot       TTF/OTF → EOT v2.2（明文 FontData，PowerPoint/LibreOffice 同款）
//   4. subsetTtf      TTF → 子集（仅保留指定字符，与 fontTools 金标准逐字节一致）
// 纯字节操作，浏览器（Uint8Array）与 Node 共用。
// ============================================================================

/** DataView 视图（带字节偏移/长度，免去每次 new）。 */
const dv = (bytes, off = 0, len = bytes.length - off) =>
  new DataView(bytes.buffer, bytes.byteOffset + off, len);
const u16 = (b, o) => dv(b, o).getUint16(0, false);
const i16 = (b, o) => dv(b, o).getInt16(0, false);
const u32 = (b, o) => dv(b, o).getUint32(0, false);
const tagOf = (b, o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
const concat = (chunks) => {
  let len = 0;
  for (const c of chunks) len += c.length;
  const out = new Uint8Array(len);
  let p = 0;
  for (const c of chunks) { out.set(c, p); p += c.length; }
  return out;
};

/** sfnt 表目录 → { tag: {offset, length} }。 */
function parseTables(buf) {
  const num = u16(buf, 4);
  const tables = {};
  for (let i = 0; i < num; i++) {
    const o = 12 + i * 16;
    tables[tagOf(buf, o)] = { offset: u32(buf, o + 8), length: u32(buf, o + 12) };
  }
  return tables;
}
const table = (buf, t) => buf.subarray(t.offset, t.offset + t.length);

// ────────────────────────────────────────────────────────────────────────────
// 1. 元信息解析（OS/2 + head + name）
// ────────────────────────────────────────────────────────────────────────────

/**
 * 解析字体元信息：嵌入权限 + EOT 头字段 + 字体名。
 * @param {Uint8Array} buf 字体字节（TTF/OTF）
 * @returns {{ fsType, weight, italic, panose, unicodeRanges, codePageRanges,
 *             checkSumAdjustment, family, subfamily }}
 */
export function parseFontInfo(buf) {
  const tables = parseTables(buf);
  if (!tables["OS/2"] || !tables.head || !tables.name) {
    throw new Error("字体缺少 OS/2 / head / name 表，无法嵌入");
  }
  const os2 = table(buf, tables["OS/2"]);
  return {
    fsType: u16(os2, 8),
    weight: u16(os2, 4),
    italic: (u16(os2, 62) & 1) === 1, // fsSelection bit0
    panose: new Uint8Array(os2.subarray(32, 42)),
    unicodeRanges: [0, 1, 2, 3].map((k) => u32(os2, 42 + k * 4)),
    codePageRanges: [u32(os2, 78), u32(os2, 82)],
    checkSumAdjustment: u32(table(buf, tables.head), 8),
    // 可变字体（Google Fonts 思源系等）name ID 1 是实例名（如 "Noto Sans SC Thin"），
    // 优先取 ID 16 typographic family（"Noto Sans SC"），否则回退 ID 1
    family: nameString(buf, tables.name, 16) || nameString(buf, tables.name, 1) || "Unknown",
    subfamily: nameString(buf, tables.name, 2) || "Regular",
  };
}

/** name 表取 Windows/UCS-2/en-US 记录（ID = nameID）。 */
function nameString(buf, nameT, nameID) {
  const name = table(buf, nameT);
  const count = u16(name, 2);
  const strOff = u16(name, 4);
  for (let i = 0; i < count; i++) {
    const rec = 6 + i * 12;
    if (u16(name, rec) !== 3 || u16(name, rec + 2) !== 1 || u16(name, rec + 4) !== 0x409) continue;
    if (u16(name, rec + 6) !== nameID) continue;
    const len = u16(name, rec + 8), soff = u16(name, rec + 10);
    let s = "";
    for (let k = 0; k < len; k += 2) s += String.fromCharCode(u16(name, strOff + soff + k));
    return s;
  }
  return null;
}

/** 重写 name 表 ID 1/2（Windows/en-US）：实例名 → 族名 + Regular；返回新表或 null。 */
function normalizeNameFamily(buf, nameT) {
  const fam16 = nameString(buf, nameT, 16);
  const fam1 = nameString(buf, nameT, 1);
  if (!fam16 || !fam1 || fam16 === fam1 || !fam1.startsWith(fam16)) return null;
  const name = table(buf, nameT);
  const count = u16(name, 2);
  const strOff = u16(name, 4);
  // 预统计需要复制的字符串总字节：源 name 表的字符串可能重叠存储（如 Smiley Sans 的
  // 多条记录共享/交叉引用同一数据区），记录长度之和可能超过表内字符串区大小，
  // 不能按 name.length 估算缓冲区，否则重排时会 Uint8Array.set 越界。
  let copyBytes = 0;
  for (let i = 0; i < count; i++) {
    const rec = 6 + i * 12;
    const pid = u16(name, rec), eid = u16(name, rec + 2), lid = u16(name, rec + 4), nid = u16(name, rec + 6);
    if (pid === 3 && eid === 1 && lid === 0x409 && (nid === 1 || nid === 2)) continue;
    copyBytes += u16(name, rec + 8);
  }
  const out = new Uint8Array(6 + count * 12 + copyBytes + (fam16.length + 8) * 2 + 32);
  const ov = dv(out);
  ov.setUint16(0, 0, false); // version 0（不做重复记录检测）
  ov.setUint16(2, count, false);
  const storage = [];
  let storageLen = 0;
  const add = (s) => {
    const off = storageLen;
    const b = new Uint8Array(s.length * 2);
    for (let i = 0; i < s.length; i++) dv(b).setUint16(i * 2, s.charCodeAt(i), false);
    storage.push(b);
    storageLen += s.length * 2;
    return off;
  };
  const newId1 = add(fam16);
  const newId2 = add("Regular");
  for (let i = 0; i < count; i++) {
    const rec = 6 + i * 12;
    const pid = u16(name, rec), eid = u16(name, rec + 2), lid = u16(name, rec + 4), nid = u16(name, rec + 6);
    const len = u16(name, rec + 8), soff = u16(name, rec + 10);
    ov.setUint16(rec, pid, false);
    ov.setUint16(rec + 2, eid, false);
    ov.setUint16(rec + 4, lid, false);
    ov.setUint16(rec + 6, nid, false);
    if (pid === 3 && eid === 1 && lid === 0x409 && (nid === 1 || nid === 2)) {
      const s = nid === 1 ? fam16 : "Regular";
      ov.setUint16(rec + 8, s.length * 2, false);
      ov.setUint16(rec + 10, nid === 1 ? newId1 : newId2, false);
    } else {
      const b = name.subarray(strOff + soff, strOff + soff + len);
      const off = storageLen;
      storage.push(b);
      storageLen += b.length;
      ov.setUint16(rec + 8, len, false);
      ov.setUint16(rec + 10, off, false);
    }
  }
  ov.setUint16(4, 6 + count * 12, false);
  let off = 6 + count * 12;
  for (const b of storage) {
    out.set(b, off);
    off += b.length;
  }
  return out.subarray(0, off);
}

/** 可变字体归一：实例名 name ID1/2 → 族名；默认字重 <400 → 400（OS/2）。无变化返回 null。 */
function normalizeVariableFont(buf) {
  const tables = parseTables(buf);
  const nameT = tables.name, os2T = tables["OS/2"];
  if (!nameT || !os2T) return null;
  const nameOut = normalizeNameFamily(buf, nameT);
  let os2Out = null;
  if (tables.fvar && u16(table(buf, os2T), 4) < 400) {
    os2Out = new Uint8Array(table(buf, os2T));
    dv(os2Out).setUint16(4, 400, false);
  }
  if (!nameOut && !os2Out) return null;
  const patched = {};
  for (const t of Object.keys(tables)) patched[t] = new Uint8Array(table(buf, tables[t]));
  if (nameOut) patched.name = nameOut;
  if (os2Out) patched["OS/2"] = os2Out;
  return assemble(patched);
}

/** fsType 嵌入权限：0x0002 Restricted 禁止嵌入；0x0000/0x0004/0x0008 允许。 */
export function checkEmbeddable(fsType) {
  if ((fsType & 0x0002) !== 0) {
    return { ok: false, reason: `字体禁止嵌入（fsType=0x${fsType.toString(16)} Restricted）` };
  }
  return { ok: true };
}

// ────────────────────────────────────────────────────────────────────────────
// 2. EOT v2.2 封装（fntdata 部件格式）
// ────────────────────────────────────────────────────────────────────────────

const u16le = (v) => {
  const b = new Uint8Array(2);
  dv(b).setUint16(0, v, true);
  return b;
};
const u32le = (v) => {
  const b = new Uint8Array(4);
  dv(b).setUint32(0, v >>> 0, true);
  return b;
};

/**
 * TTF/OTF → EOT v2.2 字节（Flags=0 明文 FontData；子集化时传 0x1 SUBSET）。
 * @param {Uint8Array} ttf 字体字节
 * @param {object} [info] parseFontInfo 结果（避免重复解析）
 * @param {number} [flags=0] EOT Flags
 */
export function buildEot(ttf, info = null, flags = 0) {
  let buf = ttf instanceof Uint8Array ? ttf : new Uint8Array(ttf);
  // FontData 归一：可变字体实例名 → 族名（PowerPoint 按 FontData name 表匹配引用名）
  const norm = normalizeVariableFont(buf);
  if (norm) {
    buf = norm;
    info = null; // 归一后 family/weight 变化，重新解析
  }
  const fi = info || parseFontInfo(buf);
  const nstr = (s) => {
    // UTF-16LE + 结尾 \0（PowerPoint 同款：size 含 \0）
    const b = new Uint8Array((s.length + 1) * 2);
    for (let i = 0; i < s.length; i++) dv(b).setUint16(i * 2, s.charCodeAt(i), true);
    return b;
  };

  const chunks = [
    u32le(0), u32le(0), u32le(0x00020002), u32le(flags), // EOTSize/FontDataSize 占位, Version, Flags
    fi.panose,                                           // 10B PANOSE
    new Uint8Array([0x86, fi.italic ? 1 : 0]),           // charset=134(中文), italic
    u32le(fi.weight),
    u16le(fi.fsType),
    u16le(0x504c),                                       // MagicNumber "LP"
    ...fi.unicodeRanges.map(u32le),                      // UnicodeRange1-4
    ...fi.codePageRanges.map(u32le),                     // CodePageRange1-2
    u32le(fi.checkSumAdjustment),
    new Uint8Array(16),                                  // Reserved1-4
    u16le(0),                                            // Padding1
  ];
  for (const s of [fi.family, fi.subfamily, "Version 1.0", `${fi.family} ${fi.subfamily}`]) {
    const b = nstr(s);
    chunks.push(u16le(b.length), b, u16le(0));           // size + UTF-16LE + padding
  }
  chunks.push(
    u16le(0),      // RootStringSize
    u32le(0x50475342), // RootStringCheckSum "BSGP"
    u32le(0x4e4),  // EUDCCodePage
    u16le(0),      // Padding6
    u16le(0),      // SignatureSize
    u32le(0),      // EUDCFlags
    u32le(0),      // EUDCFontSize
  );

  const headBytes = concat(chunks);
  const eot = new Uint8Array(headBytes.length + buf.length);
  eot.set(headBytes, 0);
  eot.set(buf, headBytes.length);
  dv(eot).setUint32(0, eot.length, true);  // EOTSize
  dv(eot).setUint32(4, buf.length, true);  // FontDataSize
  return eot;
}

// ────────────────────────────────────────────────────────────────────────────
// 3. TTF 子集化（仅 TrueType 轮廓；CFF/OTTO 抛错由调用方回退全量）
// ────────────────────────────────────────────────────────────────────────────

/** cmap 读取（format 4 + 12）→ Map<charCode, glyphId>。 */
function readCmap(buf, cmapT) {
  const cmap = table(buf, cmapT);
  const n = u16(cmap, 2);
  let best = null;
  for (let i = 0; i < n; i++) {
    const pid = u16(cmap, 4 + i * 8), eid = u16(cmap, 6 + i * 8);
    if (!best || (pid === 3 && eid === 1) || (pid === 0 && eid === 3)) {
      best = { pid, eid, off: u32(cmap, 8 + i * 8) };
    }
  }
  const map = new Map();
  if (!best) return map;
  const fmt = u16(cmap, best.off);
  if (fmt === 4) {
    const segCount = u16(cmap, best.off + 6) >> 1;
    const endOff = best.off + 14;
    const startOff = endOff + segCount * 2 + 2;
    const deltaOff = startOff + segCount * 2;
    const rangeOff = deltaOff + segCount * 2;
    for (let k = 0; k < segCount; k++) {
      const end = u16(cmap, endOff + k * 2);
      const start = u16(cmap, startOff + k * 2);
      if (start === 0xffff) break;
      const delta = i16(cmap, deltaOff + k * 2);
      const rOff = u16(cmap, rangeOff + k * 2);
      for (let c = start; c <= end; c++) {
        const g = rOff === 0
          ? (c + delta) & 0xffff
          : (u16(cmap, rangeOff + k * 2 + rOff + (c - start) * 2) + delta) & 0xffff;
        if (g !== 0) map.set(c, g);
      }
    }
  } else if (fmt === 12) {
    const nGroups = u32(cmap, best.off + 12);
    for (let i = 0; i < nGroups; i++) {
      const g = best.off + 16 + i * 12;
      const s = u32(cmap, g), e = u32(cmap, g + 4), startG = u32(cmap, g + 8);
      for (let c = s; c <= e; c++) map.set(c, startG + (c - s));
    }
  }
  return map;
}

/** glyf 复合字形组件收集（递归）。 */
function collectComponents(buf, glyfT, locaT, locFormat, glyphId) {
  const loca = table(buf, locaT);
  const glyf = table(buf, glyfT);
  const off = (g) => (locFormat === 0 ? u16(loca, g * 2) * 2 : u32(loca, g * 4));
  const comps = [];
  const seen = new Set([glyphId]);
  const stack = [glyphId];
  while (stack.length) {
    const g = stack.pop();
    const s = off(g), e = off(g + 1);
    if (s === e || i16(glyf, s) >= 0) continue; // 空 / simple
    let p = s + 10;
    for (;;) {
      const flags = u16(glyf, p);
      const gi = u16(glyf, p + 2);
      comps.push(gi);
      if (!seen.has(gi)) { seen.add(gi); stack.push(gi); }
      p += 4;
      if (flags & 0x0001) p += 4; else p += 2;
      if (flags & 0x0008) p += 2;
      else if (flags & 0x0040) p += 4;
      else if (flags & 0x0080) p += 8;
      if (!(flags & 0x0020)) break;
    }
  }
  return comps;
}

/** cmap format 4 重建（段式：连续 glyph 用 delta，否则 rangeOffset）。 */
function buildCmapFormat4(pairs) {
  const segs = [];
  for (const [c, g] of pairs) {
    const last = segs[segs.length - 1];
    if (last && c === last.end + 1) { last.end = c; last.glyphs.push(g); }
    else segs.push({ start: c, end: c, glyphs: [g] });
  }
  const segCount = segs.length + 1; // + 0xFFFF 终结段
  const pow = Math.floor(Math.log2(segCount));
  const searchRange = 2 * 2 ** pow;
  const entrySelector = pow;
  const rangeShift = segCount * 2 - searchRange;
  const glyphIdArray = [];
  const endCodes = [], startCodes = [], deltas = [], rangeOffsets = [];
  for (let k = 0; k < segs.length; k++) {
    const s = segs[k];
    endCodes.push(s.end);
    startCodes.push(s.start);
    if (s.glyphs.every((g, i) => g === s.glyphs[0] + i)) {
      deltas.push(s.glyphs[0] - s.start);
      rangeOffsets.push(0);
    } else {
      deltas.push(0);
      // idRangeOffset[i] = segCount*2 + 本段前 glyphIdArray 字节数 - i*2
      rangeOffsets.push(segCount * 2 + glyphIdArray.length * 2 - k * 2);
      glyphIdArray.push(...s.glyphs);
    }
  }
  endCodes.push(0xffff); startCodes.push(0xffff); deltas.push(1); rangeOffsets.push(0);
  const u16arr = (arr) => {
    const b = new Uint8Array(arr.length * 2);
    arr.forEach((v, i) => dv(b).setUint16(i * 2, v & 0xffff, false));
    return b;
  };
  const body = concat([
    u16arr(endCodes), new Uint8Array(2), u16arr(startCodes),
    u16arr(deltas), u16arr(rangeOffsets), u16arr(glyphIdArray),
  ]);
  const head = new Uint8Array(14);
  const h = dv(head);
  h.setUint16(0, 4, false);                  // format
  h.setUint16(2, 14 + body.length, false);   // length
  h.setUint16(6, segCount * 2, false);
  h.setUint16(8, searchRange, false);
  h.setUint16(10, entrySelector, false);
  h.setUint16(12, rangeShift, false);
  return concat([head, body]);
}

/** 表校验和（head 的 checkSumAdjustment 字段按 0 计）。 */
function tableChecksum(data) {
  let cs = 0;
  for (let i = 0; i < data.length; i += 4) {
    const v = i === 8 ? 0 : u32(data, i);
    cs = (cs + v) >>> 0;
  }
  return cs;
}

/** 子集字体组装：表排序 / 4 字节对齐 / 校验和 / checkSumAdjustment。 */
function assemble(tables) {
  const tags = Object.keys(tables).sort();
  const dirLen = 12 + tags.length * 16;
  const records = [];
  let offset = dirLen;
  for (const tag of tags) {
    let data = tables[tag];
    const rawLen = data.length;
    const pad = (4 - (data.length % 4)) % 4;
    if (pad) {
      const padded = new Uint8Array(data.length + pad);
      padded.set(data);
      data = padded;
    }
    records.push({ tag, data, rawLen, offset });
    offset += data.length;
  }
  let total = 0;
  for (const r of records) {
    r.checksum = tableChecksum(r.data);
    total = (total + r.checksum) >>> 0;
  }
  const headRec = records.find((r) => r.tag === "head");
  dv(headRec.data).setUint32(8, (0xb1b0afba - total) >>> 0, false);
  headRec.checksum = tableChecksum(headRec.data);

  const out = new Uint8Array(dirLen + records.reduce((s, r) => s + r.data.length, 0));
  const o = dv(out);
  o.setUint32(0, 0x00010000, false);
  o.setUint16(4, tags.length, false);
  records.forEach((r, i) => {
    const p = 12 + i * 16;
    for (let k = 0; k < 4; k++) out[p + k] = r.tag.charCodeAt(k);
    o.setUint32(p + 4, r.checksum, false);
    o.setUint32(p + 8, r.offset, false);
    o.setUint32(p + 12, r.rawLen, false);
    out.set(r.data, r.offset);
  });
  return out;
}

/**
 * TTF 子集化：保留指定字符 + .notdef + 复合字形组件。
 * 保留表：OS/2 cmap glyf head hhea hmtx loca maxp name post（丢弃布局表与 DSIG）。
 * @param {Uint8Array} buf 原字体字节
 * @param {string} text 需要保留的字符（按码点去重）
 * @throws {Error} 非 TrueType 轮廓（CFF/OTTO）→ 调用方应回退全量嵌入
 */
export function subsetTtf(buf, text) {
  if (tagOf(buf, 0) !== "\x00\x01\x00\x00") {
    const kind = tagOf(buf, 0) === "OTTO" ? "CFF/OTF" : tagOf(buf, 0);
    throw new Error(`不支持子集化的字体格式（${kind}），回退全量嵌入`);
  }
  const tables = parseTables(buf);
  const locFormat = i16(table(buf, tables.head), 50);

  // 收集保留字符 → 原 glyph
  const chars = new Set();
  for (const ch of String(text)) chars.add(ch.codePointAt(0));
  const keep = new Set([0]);          // 原 glyphId 集合（.notdef 必留）
  const keepChars = new Map();        // char → 原 glyphId
  const cmap = readCmap(buf, tables.cmap);
  for (const c of chars) {
    const g = cmap.get(c);
    if (g != null && g !== 0) { keep.add(g); keepChars.set(c, g); }
  }
  // composite 组件递归收集
  let grew = true;
  while (grew) {
    grew = false;
    for (const g of [...keep]) {
      for (const c of collectComponents(buf, tables.glyf, tables.loca, locFormat, g)) {
        if (!keep.has(c)) { keep.add(c); grew = true; }
      }
    }
  }
  const sortedGlyphs = [...keep].sort((a, b) => a - b);
  const remap = new Map(sortedGlyphs.map((g, i) => [g, i]));
  const numGlyphs = sortedGlyphs.length;

  // glyf / loca 重建（composite 组件 ID 重写；short loca 需 2 字节对齐）
  const glyfData = table(buf, tables.glyf);
  const locaData = table(buf, tables.loca);
  const off = (g) => (locFormat === 0 ? u16(locaData, g * 2) * 2 : u32(locaData, g * 4));
  const newGlyf = [];
  const newLoca = [0];
  for (const g of sortedGlyphs) {
    const s = off(g), e = off(g + 1);
    if (s === e) { newLoca.push(newLoca[newLoca.length - 1]); continue; }
    let data = new Uint8Array(glyfData.subarray(s, e));
    if (i16(glyfData, s) < 0) {
      const gd = dv(data);
      let p = 10;
      while (p < data.length) {
        const flags = gd.getUint16(p, false);
        gd.setUint16(p + 2, remap.get(gd.getUint16(p + 2, false)) ?? 0, false);
        p += 4;
        if (flags & 0x0001) p += 4; else p += 2;
        if (flags & 0x0008) p += 2;
        else if (flags & 0x0040) p += 4;
        else if (flags & 0x0080) p += 8;
        if (!(flags & 0x0020)) break;
      }
    }
    if (data.length % 2 === 1) { // short loca 偶数对齐（fontTools 同款）
      const padded = new Uint8Array(data.length + 1);
      padded.set(data);
      data = padded;
    }
    newGlyf.push(data);
    newLoca.push(newLoca[newLoca.length - 1] + data.length);
  }
  const totalGlyf = newLoca[newLoca.length - 1];
  const useShort = totalGlyf < 0x20000;
  const locaOut = new Uint8Array((numGlyphs + 1) * (useShort ? 2 : 4));
  const lv = dv(locaOut);
  newLoca.forEach((v, i) => {
    if (useShort) lv.setUint16(i * 2, v / 2, false);
    else lv.setUint32(i * 4, v, false);
  });

  // cmap 重建：BMP → format 4；非 BMP → format 12（platform 0/3 双子表）
  const bmp = [...keepChars.entries()].filter(([c]) => c < 0xffff).sort((a, b) => a[0] - b[0])
    .map(([c, g]) => [c, remap.get(g)]);
  const nonBmp = [...keepChars.entries()].filter(([c]) => c >= 0x10000).sort((a, b) => a[0] - b[0]);
  const subs = [[0, 3, buildCmapFormat4(bmp)], [3, 1, buildCmapFormat4(bmp)]];
  if (nonBmp.length) {
    const groups = [];
    for (const [c, g] of nonBmp) {
      const ng = remap.get(g);
      const last = groups[groups.length - 1];
      if (last && c === last.eg + 1 && ng === last.sg + (last.eg - last.sc) + 1) last.eg = c;
      else groups.push({ sc: c, eg: c, sg: ng });
    }
    const body = concat(groups.map((gr) => {
      const b = new Uint8Array(12);
      const v = dv(b);
      v.setUint32(0, gr.sc, false); v.setUint32(4, gr.eg, false); v.setUint32(8, gr.sg, false);
      return b;
    }));
    const h = new Uint8Array(16);
    const hv = dv(h);
    hv.setUint16(0, 12, false);
    hv.setUint32(4, 16 + body.length, false);
    hv.setUint32(12, groups.length, false);
    const fmt12 = concat([h, body]);
    subs.push([0, 4, fmt12], [3, 10, fmt12]);
  }
  const cmapHead = new Uint8Array(4 + subs.length * 8);
  const cv = dv(cmapHead);
  cv.setUint16(2, subs.length, false);
  let cmapOff = 4 + subs.length * 8;
  subs.forEach(([pid, eid, sub], i) => {
    cv.setUint16(4 + i * 8, pid, false);
    cv.setUint16(6 + i * 8, eid, false);
    cv.setUint32(8 + i * 8, cmapOff, false);
    cmapOff += sub.length;
  });
  const cmapOut = concat([cmapHead, ...subs.map((s) => s[2])]);

  // hmtx / hhea / maxp / head / OS/2 / post / name（拷贝 + 更新字段）
  const hmtxSrc = table(buf, tables.hmtx);
  const numHMetricsSrc = u16(table(buf, tables.hhea), 34);
  const hmtxOut = new Uint8Array(numGlyphs * 4);
  sortedGlyphs.forEach((g, i) => {
    if (g < numHMetricsSrc) {
      hmtxOut.set(hmtxSrc.subarray(g * 4, g * 4 + 4), i * 4);
    } else {
      hmtxOut.set(hmtxSrc.subarray(0, 2), i * 4); // advance 取第一条
      dv(hmtxOut).setInt16(i * 4 + 2, i16(hmtxSrc, numHMetricsSrc * 2 + (g - numHMetricsSrc) * 2), false);
    }
  });
  const hheaOut = new Uint8Array(table(buf, tables.hhea));
  dv(hheaOut).setUint16(34, numGlyphs, false);
  const maxpOut = new Uint8Array(table(buf, tables.maxp));
  dv(maxpOut).setUint16(4, numGlyphs, false);
  const headOut = new Uint8Array(table(buf, tables.head));
  dv(headOut).setUint16(50, useShort ? 0 : 1, false); // indexToLocFormat
  const postSrc = table(buf, tables.post);
  const postOut = new Uint8Array(32);
  dv(postOut).setUint32(0, 0x00030000, false);        // post format 3.0
  if (postSrc.length >= 12) postOut.set(postSrc.subarray(4, 12), 4);

  return assemble({
    "OS/2": (() => {
      const out = new Uint8Array(table(buf, tables["OS/2"]));
      // 可变字体默认字重 <400 归一到 400（PowerPoint 按 usWeightClass 判定 regular）
      if (tables.fvar && u16(out, 4) < 400) dv(out).setUint16(4, 400, false);
      return out;
    })(),
    cmap: cmapOut,
    glyf: concat(newGlyf),
    head: headOut,
    hhea: hheaOut,
    hmtx: hmtxOut,
    loca: locaOut,
    maxp: maxpOut,
    name: normalizeNameFamily(buf, tables.name) || new Uint8Array(table(buf, tables.name)),
    post: postOut,
  });
}
