// ============================================================================
// font.js — font byte utilities: metadata parsing / EOT wrapping / TTF subsetting (zero deps, browser + Node)
// ----------------------------------------------------------------------------
// Core of the whole PPTX embedded-font pipeline (spec in docs/pptx-font-embedding.md):
//   1. parseFontInfo  reads the OS/2/head/name tables -> embedding permission / font names / EOT header fields
//   2. checkEmbeddable fsType embedding permission check (0x0002 Restricted forbids embedding)
//   3. buildEot       TTF/OTF -> EOT v2.2 (plain FontData, same as PowerPoint/LibreOffice)
//   4. subsetTtf      TTF -> subset (keeps only the requested characters, byte-identical to the fontTools gold standard)
// Pure byte operations, shared by the browser (Uint8Array) and Node.
// ============================================================================

/** DataView view (with byte offset/length, avoiding a new allocation each time). */
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

/** sfnt table directory -> { tag: {offset, length} }. */
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
// 1. Metadata parsing (OS/2 + head + name)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Parse font metadata: embedding permission + EOT header fields + font names.
 * @param {Uint8Array} buf font bytes (TTF/OTF)
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
    // Variable fonts (Google Fonts Source family etc.) have an instance name in name ID 1
    // (e.g. "Noto Sans SC Thin"); prefer ID 16 typographic family ("Noto Sans SC"), else fall back to ID 1
    family: nameString(buf, tables.name, 16) || nameString(buf, tables.name, 1) || "Unknown",
    subfamily: nameString(buf, tables.name, 2) || "Regular",
  };
}

/**
 * Font single-line-height factor = (OS/2 usWinAscent + usWinDescent) / head.unitsPerEm.
 * The "single line spacing" of PowerPoint/WPS renders by this font metric (Microsoft YaHei
 * ≈1.32, SimSun 1.00, Calibri ≈1.22 times the font size) — not a plain 1× the font size — so
 * it is used to compensate the base difference when exporting percentage line spacing
 * (a:spcPct) (line spacing export in writer/text.js). A new font added to the library adapts
 * automatically (the bytes are at hand). Returns null when parsing fails (the caller falls
 * back to a static table/default).
 */
export function fontLineFactor(buf) {
  try {
    const tables = parseTables(buf);
    if (!tables["OS/2"] || !tables.head) return null;
    const upem = u16(table(buf, tables.head), 18);
    if (!upem) return null;
    const os2 = table(buf, tables["OS/2"]);
    return (u16(os2, 74) + u16(os2, 76)) / upem;
  } catch {
    return null;
  }
}

/** Font name normalization (key for the line-factor lookup): lowercase + whitespace removed. */
export const fontKey = (name) => String(name).toLowerCase().replace(/\s+/g, "");

/** Read a Windows/UCS-2/en-US record from the name table (ID = nameID). */
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

/** Rewrite name table IDs 1/2 (Windows/en-US): instance name -> family name + Regular; returns the new table or null. */
function normalizeNameFamily(buf, nameT) {
  const fam16 = nameString(buf, nameT, 16);
  const fam1 = nameString(buf, nameT, 1);
  if (!fam16 || !fam1 || fam16 === fam1 || !fam1.startsWith(fam16)) return null;
  const name = table(buf, nameT);
  const count = u16(name, 2);
  const strOff = u16(name, 4);
  // Pre-count the total string bytes that need copying: strings in the source name table may
  // be stored overlapping (e.g. several Smiley Sans records share/cross-reference one data
  // region), so the sum of record lengths can exceed the string area size; estimating the
  // buffer from name.length would make Uint8Array.set go out of range during the rewrite.
  let copyBytes = 0;
  for (let i = 0; i < count; i++) {
    const rec = 6 + i * 12;
    const pid = u16(name, rec), eid = u16(name, rec + 2), lid = u16(name, rec + 4), nid = u16(name, rec + 6);
    if (pid === 3 && eid === 1 && lid === 0x409 && (nid === 1 || nid === 2)) continue;
    copyBytes += u16(name, rec + 8);
  }
  const out = new Uint8Array(6 + count * 12 + copyBytes + (fam16.length + 8) * 2 + 32);
  const ov = dv(out);
  ov.setUint16(0, 0, false); // version 0 (no duplicate-record detection)
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

/** Variable font normalization: instance name in name ID1/2 -> family name; default weight <400 -> 400 (OS/2). Returns null when nothing changes. */
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

/** fsType embedding permission: 0x0002 Restricted forbids embedding; 0x0000/0x0004/0x0008 allow it. */
export function checkEmbeddable(fsType) {
  if ((fsType & 0x0002) !== 0) {
    return { ok: false, reason: `字体禁止嵌入（fsType=0x${fsType.toString(16)} Restricted）` };
  }
  return { ok: true };
}

// ────────────────────────────────────────────────────────────────────────────
// 2. EOT v2.2 wrapping (the fntdata part format)
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
 * TTF/OTF -> EOT v2.2 bytes (Flags=0 means plain FontData; pass 0x1 SUBSET when subsetted).
 * @param {Uint8Array} ttf font bytes
 * @param {object} [info] parseFontInfo result (avoids re-parsing)
 * @param {number} [flags=0] EOT Flags
 */
export function buildEot(ttf, info = null, flags = 0) {
  let buf = ttf instanceof Uint8Array ? ttf : new Uint8Array(ttf);
  // FontData normalization: variable-font instance name -> family name (PowerPoint matches the
  // reference name against the FontData name table)
  const norm = normalizeVariableFont(buf);
  if (norm) {
    buf = norm;
    info = null; // family/weight changed after normalization, so re-parse
  }
  const fi = info || parseFontInfo(buf);
  const nstr = (s) => {
    // UTF-16LE + trailing \0 (same as PowerPoint: the recorded size includes the \0)
    const b = new Uint8Array((s.length + 1) * 2);
    for (let i = 0; i < s.length; i++) dv(b).setUint16(i * 2, s.charCodeAt(i), true);
    return b;
  };

  const chunks = [
    u32le(0), u32le(0), u32le(0x00020002), u32le(flags), // EOTSize/FontDataSize placeholders, Version, Flags
    fi.panose,                                           // 10B PANOSE
    new Uint8Array([0x86, fi.italic ? 1 : 0]),           // charset=134 (CJK), italic
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
// 3. TTF subsetting (TrueType outlines only; CFF/OTTO throws so the caller can fall back to full embedding)
// ────────────────────────────────────────────────────────────────────────────

/** cmap read (format 4 + 12) -> Map<charCode, glyphId>. */
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

/** Collect glyf composite-glyph components (recursively). */
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
    if (s === e || i16(glyf, s) >= 0) continue; // empty / simple
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

/** Rebuild cmap format 4 (segmented: consecutive glyphs use delta, otherwise rangeOffset). */
function buildCmapFormat4(pairs) {
  const segs = [];
  for (const [c, g] of pairs) {
    const last = segs[segs.length - 1];
    if (last && c === last.end + 1) { last.end = c; last.glyphs.push(g); }
    else segs.push({ start: c, end: c, glyphs: [g] });
  }
  const segCount = segs.length + 1; // + the 0xFFFF terminating segment
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
      // idRangeOffset[i] = segCount*2 + bytes of glyphIdArray before this segment - i*2
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

/** Table checksum (the head checkSumAdjustment field counts as 0). */
function tableChecksum(data) {
  let cs = 0;
  for (let i = 0; i < data.length; i += 4) {
    const v = i === 8 ? 0 : u32(data, i);
    cs = (cs + v) >>> 0;
  }
  return cs;
}

/** Subset font assembly: table sorting / 4-byte alignment / checksums / checkSumAdjustment. */
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
 * TTF subsetting: keeps the requested characters + .notdef + composite-glyph components.
 * Kept tables: OS/2 cmap glyf head hhea hmtx loca maxp name post (layout tables and DSIG are dropped).
 * @param {Uint8Array} buf original font bytes
 * @param {string} text characters to keep (deduped by code point)
 * @throws {Error} non-TrueType outlines (CFF/OTTO) -> the caller should fall back to full embedding
 */
export function subsetTtf(buf, text) {
  if (tagOf(buf, 0) !== "\x00\x01\x00\x00") {
    const kind = tagOf(buf, 0) === "OTTO" ? "CFF/OTF" : tagOf(buf, 0);
    throw new Error(`不支持子集化的字体格式（${kind}），回退全量嵌入`);
  }
  const tables = parseTables(buf);
  const locFormat = i16(table(buf, tables.head), 50);

  // Collect the kept characters -> original glyphs
  const chars = new Set();
  for (const ch of String(text)) chars.add(ch.codePointAt(0));
  const keep = new Set([0]);          // original glyphId set (.notdef must stay)
  const keepChars = new Map();        // char -> original glyphId
  const cmap = readCmap(buf, tables.cmap);
  for (const c of chars) {
    const g = cmap.get(c);
    if (g != null && g !== 0) { keep.add(g); keepChars.set(c, g); }
  }
  // Recursively collect composite components
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

  // Rebuild glyf / loca (rewrite composite-glyph component IDs; short loca needs 2-byte alignment)
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
    if (data.length % 2 === 1) { // short loca even alignment (same as fontTools)
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

  // Rebuild cmap: BMP -> format 4; non-BMP -> format 12 (platform 0/3 subtables)
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

  // hmtx / hhea / maxp / head / OS/2 / post / name (copy + update fields)
  const hmtxSrc = table(buf, tables.hmtx);
  const numHMetricsSrc = u16(table(buf, tables.hhea), 34);
  const hmtxOut = new Uint8Array(numGlyphs * 4);
  sortedGlyphs.forEach((g, i) => {
    if (g < numHMetricsSrc) {
      hmtxOut.set(hmtxSrc.subarray(g * 4, g * 4 + 4), i * 4);
    } else {
      hmtxOut.set(hmtxSrc.subarray(0, 2), i * 4); // advance taken from the first entry
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
      // Variable font default weight <400 normalized to 400 (PowerPoint judges regular by usWeightClass)
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

/**
 * Font resource table: any key of deck.fonts = a font resource declaration ({family, url/file, subset}).
 * A fontFamily string first looks up the resource table (key -> family) and takes the family on a hit.
 * A resource with file/url is embedded on export (writer/font.js collectFontSpecs).
 */
export function parseFontResources(fonts) {
  const out = {};
  if (!fonts || typeof fonts !== "object") return out;
  for (const [key, v] of Object.entries(fonts)) {
    if (!v || typeof v !== "object") continue;
    const family = v.family || v.name;
    if (typeof family !== "string" || !family) continue;
    out[key] = {
      family,
      file: typeof v.file === "string" ? v.file : null,
      url: typeof v.url === "string" ? v.url : null,
      subset: v.subset == null ? null : !!v.subset, // null = not explicitly set (the registry suggestion is used on export)
    };
  }
  return out;
}
