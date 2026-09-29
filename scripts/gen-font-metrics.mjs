#!/usr/bin/env node
// ============================================================================
// scripts/gen-font-metrics.mjs — 字体度量表一次性构建（spec 09 T1 / 方案 §3.1）
// ----------------------------------------------------------------------------
// 从注册表 27 个内置字体里，对本机存在的字节实测 OS/2 + hhea + cmap + hmtx，
// 产出 `packages/measure/metrics-data.json`（入库）供 packages/measure 纯函数消费。
//
// 产物字段（每字体）：
//   lineFactor  单倍行距系数 = (usWinAscent + usWinDescent) / unitsPerEm
//               （与 model/font.js#fontLineFactor 同式——writer spcPct 补偿同表推导）
//   ascent/descent/lineGap   em 分数（OS/2 usWin 与 sTypo/hhea lineGap）
//   cjkWidth/latinWidth      字宽类加权（样本平均 advance / em）——贪心断行用
//   category/weight/italic/upem
//   estimated   true = 非实测（本机缺失字体用系统字体常量兜底，或系统字体常量本身）
//   source      "embedded" | "system-constant"
//
// 字体字节来源（只读）：
//   1. --fonts <dir>          显式指定字体目录
//   2. $OPEN_PPTD_FONT_DIR    环境变量
//   3. <repo>/assets/fonts    包内字体目录（默认）
//   本机缺失的注册字体（约 11/27）**不下载**，用系统字体常量（默认微软雅黑）兜底
//   并标 estimated:true。
//
// 用法：
//   node scripts/gen-font-metrics.mjs
//   node scripts/gen-font-metrics.mjs --fonts "C:/path/to/assets/fonts"
// 零依赖、零构建。
// ============================================================================

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFontInfo, fontLineFactor, fontKey } from "../packages/model/font.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "packages", "measure", "metrics-data.json");

// ---------------------------------------------------------------------------
// 字体目录解析
// ---------------------------------------------------------------------------
const argIdx = process.argv.indexOf("--fonts");
const cliFonts = argIdx > 0 ? process.argv[argIdx + 1] : null;
const FONT_DIRS = [cliFonts, process.env.OPEN_PPTD_FONT_DIR, join(ROOT, "assets", "fonts")].filter(Boolean);

function findFontFile(file) {
  for (const dir of FONT_DIRS) {
    if (!existsSync(dir)) continue;
    const p = join(dir, file);
    if (existsSync(p)) return p;
    // 大小写不敏感兜底（Windows 上通常直接命中，跨平台保险）
    try {
      const hit = readdirSync(dir).find((n) => n.toLowerCase() === file.toLowerCase());
      if (hit) return join(dir, hit);
    } catch {
      /* 目录不可读则跳过 */
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// 最小 sfnt 解析（本脚本自足，不复用/不修改 model/font.js 的内部非导出工具）
// ---------------------------------------------------------------------------
const dvOf = (b, off = 0, len = b.length - off) => new DataView(b.buffer, b.byteOffset + off, len);
const u16 = (b, o) => dvOf(b, o).getUint16(0, false);
const i16 = (b, o) => dvOf(b, o).getInt16(0, false);
const u32 = (b, o) => dvOf(b, o).getUint32(0, false);
const tagOf = (b, o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);

function parseTables(buf) {
  const n = u16(buf, 4);
  const tables = {};
  for (let i = 0; i < n; i++) {
    const o = 12 + i * 16;
    tables[tagOf(buf, o)] = { offset: u32(buf, o + 8), length: u32(buf, o + 12) };
  }
  return tables;
}
const table = (buf, t) => buf.subarray(t.offset, t.offset + t.length);

/** cmap（format 4 + 12）→ Map<codePoint, glyphId>。 */
function readCmap(buf, cmapT) {
  const cmap = table(buf, cmapT);
  const n = u16(cmap, 2);
  let best = null;
  for (let i = 0; i < n; i++) {
    const pid = u16(cmap, 4 + i * 8), eid = u16(cmap, 6 + i * 8);
    if (!best || (pid === 3 && eid === 1) || (pid === 0 && eid === 3)) best = { pid, eid, off: u32(cmap, 8 + i * 8) };
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

/** advance width（em 分数）读取：hmtx + hhea.numberOfHMetrics + head.unitsPerEm。 */
function makeAdvanceReader(buf, tables) {
  const upem = u16(table(buf, tables.head), 18) || 1000;
  const numH = u16(table(buf, tables.hhea), 34);
  const hmtx = table(buf, tables.hmtx);
  const adv = (g) => {
    const i = g < numH ? g : numH - 1;
    return u16(hmtx, i * 4);
  };
  return { upem, adv, em: (g) => adv(g) / upem };
}

// ---------------------------------------------------------------------------
// 采样字符串（字宽类加权）
// ---------------------------------------------------------------------------
const CJK_SAMPLE = "永中文国体的人一二三四五六七八九十";
const LATIN_SAMPLE = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function avgEm(sample, cmap, reader) {
  let sum = 0, n = 0;
  for (const ch of sample) {
    const g = cmap.get(ch.codePointAt(0));
    if (g == null) continue;
    sum += reader.em(g);
    n += 1;
  }
  return n ? sum / n : null;
}

// ---------------------------------------------------------------------------
// 系统字体常量（公开已知单倍行距系数，方案 §3.1；雅黑 1.32 / 宋体 1.00 / Calibri 1.22）
// ---------------------------------------------------------------------------
const SYSTEM_CONSTANTS = {
  "Microsoft YaHei": { lineFactor: 1.32, cjkWidth: 1.0, latinWidth: 0.52, ascent: 1.06, descent: 0.26, lineGap: 0 },
  SimSun: { lineFactor: 1.0, cjkWidth: 1.0, latinWidth: 0.5, ascent: 0.86, descent: 0.14, lineGap: 0 },
  FangSong: { lineFactor: 1.0, cjkWidth: 1.0, latinWidth: 0.5, ascent: 0.86, descent: 0.14, lineGap: 0 },
  KaiTi: { lineFactor: 1.16, cjkWidth: 1.0, latinWidth: 0.5, ascent: 0.88, descent: 0.12, lineGap: 0 },
  SimHei: { lineFactor: 1.16, cjkWidth: 1.0, latinWidth: 0.5, ascent: 0.88, descent: 0.12, lineGap: 0 },
  YouYuan: { lineFactor: 1.32, cjkWidth: 1.0, latinWidth: 0.52, ascent: 1.06, descent: 0.26, lineGap: 0 },
  LiSu: { lineFactor: 1.32, cjkWidth: 1.0, latinWidth: 0.52, ascent: 1.06, descent: 0.26, lineGap: 0 },
  DengXian: { lineFactor: 1.3, cjkWidth: 1.0, latinWidth: 0.52, ascent: 1.04, descent: 0.26, lineGap: 0 },
  "Times New Roman": { lineFactor: 1.15, cjkWidth: 1.0, latinWidth: 0.5, ascent: 0.9, descent: 0.25, lineGap: 0 },
  Arial: { lineFactor: 1.15, cjkWidth: 1.0, latinWidth: 0.55, ascent: 0.91, descent: 0.24, lineGap: 0 },
  Calibri: { lineFactor: 1.22, cjkWidth: 1.0, latinWidth: 0.48, ascent: 0.95, descent: 0.27, lineGap: 0 },
  "PingFang SC": { lineFactor: 1.3, cjkWidth: 1.0, latinWidth: 0.52, ascent: 1.05, descent: 0.25, lineGap: 0 },
};
const DEFAULT_FALLBACK_FAMILY = "Microsoft YaHei"; // 默认字体常量（CJK 正文首选）

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------
const registryPath = join(ROOT, "assets", "fonts", "registry.json");
if (!existsSync(registryPath)) {
  console.error(`✗ 找不到字体注册表: ${registryPath}`);
  process.exit(1);
}
const registry = JSON.parse(readFileSync(registryPath, "utf8"));

const fonts = {};
let measured = 0, estimated = 0;
const names = new Map(); // fontKey → 条目（family/key/aliases 全部归一到同一条目）

function register(name, entry) {
  if (!name) return;
  names.set(fontKey(name), entry);
}

function measureEmbedded(file) {
  const p = findFontFile(file);
  if (!p) return null;
  const buf = new Uint8Array(readFileSync(p));
  const info = parseFontInfo(buf);
  const tables = parseTables(buf);
  const upem = u16(table(buf, tables.head), 18) || 1000;
  const os2 = table(buf, tables["OS/2"]);
  const hhea = table(buf, tables.hhea);
  const winAsc = u16(os2, 74), winDesc = u16(os2, 76);
  const typoGap = u16(os2, 72), hheaGap = i16(hhea, 8);
  const lineFactor = fontLineFactor(buf) || (winAsc + winDesc) / upem;
  const cmap = readCmap(buf, tables.cmap);
  const reader = makeAdvanceReader(buf, tables);
  return {
    lineFactor: round4(lineFactor),
    ascent: round4(winAsc / upem),
    descent: round4(winDesc / upem),
    lineGap: round4((typoGap || hheaGap || 0) / upem),
    cjkWidth: round4(avgEm(CJK_SAMPLE, cmap, reader) ?? 1.0),
    latinWidth: round4(avgEm(LATIN_SAMPLE, cmap, reader) ?? 0.5),
    category: null,
    weight: info.weight,
    italic: !!info.italic,
    upem,
    estimated: false,
    source: "embedded",
  };
}

for (const f of registry.fonts) {
  const entry = {
    family: f.family,
    declared: [f.key, f.family, ...(f.aliases || [])],
    category: f.category || null,
    style: f.style || null,
  };
  const m = measureEmbedded(f.file);
  if (m) {
    Object.assign(entry, m, { category: f.category || null });
    measured += 1;
    console.log(`✓ 实测 ${f.family}（${f.file}）lineFactor=${entry.lineFactor} cjk=${entry.cjkWidth} latin=${entry.latinWidth}`);
  } else {
    // 本机缺失：不下载，用系统字体常量兜底（默认微软雅黑），标 estimated
    const base = SYSTEM_CONSTANTS[DEFAULT_FALLBACK_FAMILY];
    Object.assign(entry, {
      lineFactor: base.lineFactor,
      ascent: base.ascent,
      descent: base.descent,
      lineGap: base.lineGap,
      cjkWidth: base.cjkWidth,
      latinWidth: base.latinWidth,
      weight: f.weight ?? 400,
      italic: !!f.italic,
      upem: null,
      estimated: true,
      source: "system-constant",
      fallbackFrom: DEFAULT_FALLBACK_FAMILY,
      missingFile: f.file || null,
    });
    estimated += 1;
    console.log(`· 兜底 ${f.family}（${f.file} 本机缺失 → ${DEFAULT_FALLBACK_FAMILY} 常量，estimated）`);
  }
  fonts[fontKey(f.family)] = entry;
  for (const n of entry.declared) register(n, entry);
}

// 系统字体常量（无字节，公开常量，estimated:true）
const systemFonts = {};
for (const sf of registry.systemFonts || []) {
  const c = SYSTEM_CONSTANTS[sf.family];
  if (!c) continue;
  const entry = {
    family: sf.family,
    declared: [sf.key, sf.family],
    category: "system",
    lineFactor: c.lineFactor,
    ascent: c.ascent,
    descent: c.descent,
    lineGap: c.lineGap,
    cjkWidth: c.cjkWidth,
    latinWidth: c.latinWidth,
    weight: 400,
    italic: false,
    upem: null,
    estimated: true,
    source: "system-constant",
  };
  systemFonts[fontKey(sf.family)] = entry;
  for (const n of entry.declared) register(n, entry);
}

const data = {
  version: 1,
  generated: new Date().toISOString(),
  note: "spec 09 T1：注册字体实测（estimated=false）+ 系统字体常量（estimated=true）；缺失注册字体用系统常量兜底并标 estimated。",
  defaultFallbackFamily: DEFAULT_FALLBACK_FAMILY,
  safetyFactor: 1.06,
  registryFonts: fonts,
  systemFonts,
  lookup: Object.fromEntries([...names.entries()].map(([k, e]) => [k, e.family])),
};

writeFileSync(OUT, JSON.stringify(data, null, 2) + "\n", "utf8");
console.log(`\n产物 ${OUT}`);
console.log(`注册字体 ${registry.fonts.length}：实测 ${measured} / 兜底 ${estimated}；系统常量 ${Object.keys(systemFonts).length}`);
console.log(`查找名（family/key/alias 归一）${Object.keys(data.lookup).length} 条`);

function round4(v) {
  return Math.round(v * 10000) / 10000;
}
