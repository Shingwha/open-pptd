// ============================================================================
// measure/font-metrics.js — 确定性排版度量纯函数（方案 §3.1，默认 MeasurePort）
// ----------------------------------------------------------------------------
// 输入 = 富文本 runs + 样式 + 字体度量；输出 = 几何。零 DOM、零 Node API，
// Node/CLI/CI 可跑可快照（三铁律之「MeasurePort 默认确定性纯函数」）。
//
//   measureTextRuns(runs, style, maxWidth, fonts) → { lines, height }
//   measureCell(cell, colWidth, fonts)           → number（单元格内容高 px）
//   measureTable(table, fonts)                   → { columnWidths, rowHeights, totalHeight }
//
// 断行：贪心按字宽类（CJK ≈ cjkWidth em、拉丁 ≈ latinWidth em、公式按简化式），
// **宁高勿低**——安全余量系数（默认 1.06，metrics-data.json 可配）乘在最终高度。
// 行高单源：lineHeightPx > fontSize × lineHeight（与 writer spcPct 补偿同表推导，
// 补偿后两端有效行高同为 fontSize × lineHeight）。LaTeX 维持方案简化式。
// ============================================================================

import { parseRichText } from "../model/richtext.js";
import { TABLE_CELL_PAD, TABLE_CELL_PAD_X, TABLE_FONT_SIZE } from "../model/table.js";
import { tableGrid, estimateTableLayout } from "../model/table.js";
import { defaultMetricsTable } from "./metrics-table.js";

const DEFAULT_FONT_SIZE = 18;
const DEFAULT_LINE_HEIGHT = 1;
const FORMULA_LINE_FACTOR = 1.6; // 独占段落公式行高倍数（方案 §3.1 简化式）
const SPACE_EM = 0.3; // 空格宽（em）

// 宽字符（CJK/假名/全角/emoji）：≈1 em
const WIDE_RE =
  /[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]|[\u{1F300}-\u{1FAFF}]/u;

const isWide = (ch) => WIDE_RE.test(ch);

/** fontFamily（字符串 | {latin,ea} | 数组）→ 名字数组。 */
export function familiesOf(fontFamily) {
  if (!fontFamily) return [];
  if (typeof fontFamily === "string") return [fontFamily];
  if (Array.isArray(fontFamily)) return fontFamily.filter((n) => typeof n === "string");
  if (typeof fontFamily === "object") return [fontFamily.latin, fontFamily.ea].filter((n) => typeof n === "string");
  return [];
}

/** 单个字符的宽度（px）：按宽/窄类与度量表字宽类加权。 */
function charWidth(ch, fontSize, m) {
  if (ch === "\t") return fontSize * m.latinWidth * 4;
  if (ch === " ") return fontSize * SPACE_EM;
  return isWide(ch) ? fontSize * m.cjkWidth : fontSize * m.latinWidth;
}

/** 行内公式简化宽度：0.5em × max(2, 长度/4)（方案 §3.1）。 */
function formulaWidth(latex, fontSize) {
  return 0.5 * fontSize * Math.max(2, String(latex || "").length / 4);
}

/** 富文本 → 扁平 run（段落间硬断行；公式 run 标 formula）。 */
export function runsFromRichText(text) {
  const tree = parseRichText(text == null ? "" : String(text));
  const runs = [];
  tree.paragraphs.forEach((p, i) => {
    if (i > 0) runs.push({ text: "\n" });
    for (const r of p.runs) runs.push(r);
    if (!p.runs.length) runs.push({ text: "" });
  });
  return runs;
}

/**
 * 断行 + 行高：rich text runs → { lines, height }。
 * @param {Array<{text?, formula?, latex?, style?: {fontSize?, bold?, italic?}}>} runs
 * @param {{fontSize?, lineHeight?, lineHeightPx?, fontFamily?}} style 基础样式（已解析具体字族）
 * @param {number} maxWidth 可用宽度 px
 * @param {object} [fonts] 度量表（缺省包内单例）
 * @returns {{ lines: number, height: number, maxFontSize: number }}
 */
export function measureTextRuns(runs, style = {}, maxWidth = Infinity, fonts = defaultMetricsTable) {
  const table = fonts || defaultMetricsTable;
  const baseSize = numOr(style.fontSize, DEFAULT_FONT_SIZE);
  const lhm = style.lineHeightPx == null ? numOr(style.lineHeight, DEFAULT_LINE_HEIGHT) : null;
  const families = familiesOf(style.fontFamily);
  const m = table.metricsFor(families.length ? families : null);
  const width = Math.max(1, numOr(maxWidth, 1));

  // 展平为原子：CJK 单字可断行；拉丁按「词」聚合（浏览器在词边界断行，贪心
  // 字符级会高估每行容量 → 行数偏少 → 高度偏低，这里对齐浏览器的断行机会）
  const atoms = [];
  let maxFontSize = baseSize;
  const pushText = (str, fs) => {
    let i = 0;
    while (i < str.length) {
      const ch = str[i];
      if (ch === "\n") { atoms.push({ kind: "nl" }); i++; continue; }
      if (ch === " ") {
        let w = 0;
        while (str[i] === " ") { w += charWidth(" ", fs, m); i++; }
        atoms.push({ kind: "space", w, fs });
        continue;
      }
      if (isWide(ch)) {
        atoms.push({ kind: "ch", w: charWidth(ch, fs, m), fs });
        i++;
        continue;
      }
      let w = 0;
      while (i < str.length && str[i] !== " " && str[i] !== "\n" && !isWide(str[i])) {
        w += charWidth(str[i], fs, m);
        i++;
      }
      atoms.push({ kind: "word", w, fs });
    }
  };
  for (const run of runs || []) {
    if (!run) continue;
    if (run.formula) {
      const fs = numOr(run.style?.fontSize, baseSize);
      maxFontSize = Math.max(maxFontSize, fs);
      atoms.push({ kind: "formula", w: formulaWidth(run.latex, fs), fs });
      continue;
    }
    const fs = numOr(run.style?.fontSize, baseSize);
    if (run.style?.fontSize) maxFontSize = Math.max(maxFontSize, fs);
    pushText(String(run.text ?? ""), fs);
  }

  // 贪心断行（断点：CJK 单字前 / 词前 / 空格处；行首空格丢弃）
  const lines = [];
  let cur = { width: 0, maxFs: baseSize, hasText: false, hasFormula: false, hasNonFormula: false };
  const flush = () => {
    lines.push(cur);
    cur = { width: 0, maxFs: baseSize, hasText: false, hasFormula: false, hasNonFormula: false };
  };
  for (const a of atoms) {
    if (a.kind === "nl") { flush(); continue; }
    if (a.kind === "space" && !cur.hasText) continue; // 行首空格折叠
    if (cur.hasText && cur.width + a.w > width) flush();
    cur.width += a.w;
    cur.maxFs = Math.max(cur.maxFs, a.fs ?? baseSize);
    cur.hasText = true;
    if (a.kind === "formula") cur.hasFormula = true;
    else if (a.kind !== "space") cur.hasNonFormula = true;
  }
  flush();

  let height = 0;
  for (const ln of lines) {
    const base = style.lineHeightPx != null ? style.lineHeightPx : ln.maxFs * lhm;
    // 纯公式行（含公式、无普通字符）按 1.6 倍行高
    const formulaOnly = ln.hasFormula && !ln.hasNonFormula;
    height += formulaOnly ? base * FORMULA_LINE_FACTOR : base;
  }
  const safety = typeof table.safetyFactor === "number" ? table.safetyFactor : 1.06;
  return { lines: lines.length, height: round2(height * safety), maxFontSize };
}


/**
 * 单元格内容高（px）：colWidth（含 padding）内排版 + 上下内边距。
 * @param {{text?: string, fontSize?, lineHeight?, lineHeightPx?, fontFamily?}} cell
 * @param {number} colWidth px
 * @param {object} [fonts]
 */
export function measureCell(cell, colWidth, fonts = defaultMetricsTable) {
  const style = {
    fontSize: numOr(cell?.fontSize, TABLE_FONT_SIZE),
    lineHeight: cell?.lineHeight,
    lineHeightPx: cell?.lineHeightPx,
    fontFamily: cell?.fontFamily,
  };
  const runs = runsFromRichText(cell?.text);
  const inner = Math.max(1, numOr(colWidth, 1) - 2 * TABLE_CELL_PAD_X);
  const { height } = measureTextRuns(runs, style, inner, fonts);
  return Math.ceil(height + 2 * TABLE_CELL_PAD);
}

/**
 * 表格布局：列宽（比例）+ 精确行高 + 总高（R3 的确定值）。
 * 行高 = max(model 最小行高, 该行内容高)；rowSpan>1 的内容按跨行数摊分。
 * @param {object} table 表格元素（rows/columnWidths/rowHeights/bounds/fill/style）
 * @param {object} [fonts]
 * @returns {{ columnWidths: number[], columnWidthsPx: number[], rowHeights: number[], totalHeight: number }}
 */
export function measureTable(table, fonts = defaultMetricsTable) {
  const el = table || {};
  const rows = Array.isArray(el.rows) ? el.rows : [];
  const boundsW = Array.isArray(el.bounds) ? numOr(el.bounds[2], 0) : 0;
  const base = estimateTableLayout(el); // { rowHeights(min), columnWidths(ratios) }
  const colRatios = base.columnWidths;
  const cols = colRatios.length;
  const colPx = colRatios.map((r) => r * boundsW);
  const { grid } = tableGrid(rows, cols);

  const rowHeights = base.rowHeights.slice();
  for (let r = 0; r < grid.length; r++) {
    let contentH = rowHeights[r] ?? 0;
    for (const g of grid[r]) {
      if (g.covered || !g.cell) continue;
      const span = Math.max(1, g.cell.colSpan || 1);
      const rowSpan = Math.max(1, g.cell.rowSpan || 1);
      let w = 0;
      for (let k = 0; k < span && g.c + k < cols; k++) w += colPx[g.c + k];
      const h = measureCell(g.cell, w, fonts) / rowSpan;
      contentH = Math.max(contentH, h);
    }
    rowHeights[r] = Math.ceil(contentH);
  }
  const totalHeight = rowHeights.reduce((a, b) => a + b, 0);
  return { columnWidths: colRatios, columnWidthsPx: colPx, rowHeights, totalHeight };
}

/**
 * Single-line-height multiplier for a font (writer consumes it for the
 * spcPct compensation: spcPct = lineHeight / multiplier). Derived from the
 * same metrics table as the rest of this package.
 * @param {string|{latin,ea}|string[]} font
 * @param {object} [fonts]
 */
export function lineHeightMultiplierFor(font, fonts = defaultMetricsTable) {
  const table = fonts || defaultMetricsTable;
  const families = familiesOf(font);
  return table.metricsFor(families.length ? families : null).lineFactor;
}

function numOr(v, d) {
  return typeof v === "number" && Number.isFinite(v) ? v : d;
}
function round2(v) {
  return Math.round(v * 100) / 100;
}
