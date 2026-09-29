// ============================================================================
// measure/font-metrics.js — deterministic typographic measurement pure functions (default MeasurePort)
// ----------------------------------------------------------------------------
// Input = rich-text runs + style + font metrics; output = geometry. Zero DOM, zero Node
// APIs, so it runs and snapshots on Node/CLI/CI (the "MeasurePort defaults to a
// deterministic pure function" invariant).
//
//   measureTextRuns(runs, style, maxWidth, fonts) → { lines, height }
//   measureCell(cell, colWidth, fonts)           → number (cell content height in px)
//   measureTable(table, fonts)                   → { columnWidths, rowHeights, totalHeight }
//
// Wrapping: greedy by character-width class (CJK ≈ cjkWidth em, Latin ≈ latinWidth em,
// formulas via the closed form), biased to over- rather than under-estimate — a safety
// factor (default 1.06, configurable in metrics-data.json) multiplies the final height.
// Single source of line height: lineHeightPx > fontSize × lineHeight (derived from the same
// table as the writer's spcPct compensation, so both ends end up at fontSize × lineHeight).
// LaTeX keeps the simplified closed form.
// ============================================================================

import { parseRichText } from "../model/richtext.js";
import { TABLE_CELL_PAD, TABLE_CELL_PAD_X, TABLE_FONT_SIZE } from "../model/table.js";
import { tableGrid, estimateTableLayout } from "../model/table.js";
import { defaultMetricsTable } from "./metrics-table.js";

const DEFAULT_FONT_SIZE = 18;
const DEFAULT_LINE_HEIGHT = 1;
const FORMULA_LINE_FACTOR = 1.6; // line-height multiplier for a formula-only paragraph
const SPACE_EM = 0.3; // space width (em)

// Wide characters (CJK/kana/fullwidth/emoji): ≈1 em
const WIDE_RE =
  /[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]|[\u{1F300}-\u{1FAFF}]/u;

const isWide = (ch) => WIDE_RE.test(ch);

/** fontFamily (string | {latin,ea} | array) → array of names. */
export function familiesOf(fontFamily) {
  if (!fontFamily) return [];
  if (typeof fontFamily === "string") return [fontFamily];
  if (Array.isArray(fontFamily)) return fontFamily.filter((n) => typeof n === "string");
  if (typeof fontFamily === "object") return [fontFamily.latin, fontFamily.ea].filter((n) => typeof n === "string");
  return [];
}

/** Width of a single character (px): wide/narrow class × the table's width class. */
function charWidth(ch, fontSize, m) {
  if (ch === "\t") return fontSize * m.latinWidth * 4;
  if (ch === " ") return fontSize * SPACE_EM;
  return isWide(ch) ? fontSize * m.cjkWidth : fontSize * m.latinWidth;
}

/** Simplified inline-formula width: 0.5em × max(2, length/4). */
function formulaWidth(latex, fontSize) {
  return 0.5 * fontSize * Math.max(2, String(latex || "").length / 4);
}

/** Rich text → flat runs (hard line break between paragraphs; formula runs flagged). */
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
 * Wrapping + line height: rich-text runs → { lines, height }.
 * @param {Array<{text?, formula?, latex?, style?: {fontSize?, bold?, italic?}}>} runs
 * @param {{fontSize?, lineHeight?, lineHeightPx?, fontFamily?}} style base style (font family already resolved)
 * @param {number} maxWidth available width in px
 * @param {object} [fonts] metrics table (defaults to the in-package singleton)
 * @returns {{ lines: number, height: number, maxFontSize: number }}
 */
export function measureTextRuns(runs, style = {}, maxWidth = Infinity, fonts = defaultMetricsTable) {
  const table = fonts || defaultMetricsTable;
  const baseSize = numOr(style.fontSize, DEFAULT_FONT_SIZE);
  const lhm = style.lineHeightPx == null ? numOr(style.lineHeight, DEFAULT_LINE_HEIGHT) : null;
  const families = familiesOf(style.fontFamily);
  const m = table.metricsFor(families.length ? families : null);
  const width = Math.max(1, numOr(maxWidth, 1));

  // Flatten to atoms: CJK breaks per character; Latin is grouped into "words" (a browser
  // breaks at word boundaries, so greedy per-character would overestimate per-line capacity
  // → too few lines → too low a height; grouping matches the browser's break opportunities)
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

  // Greedy wrapping (break before a CJK character / a word / at a space; leading spaces dropped)
  const lines = [];
  let cur = { width: 0, maxFs: baseSize, hasText: false, hasFormula: false, hasNonFormula: false };
  const flush = () => {
    lines.push(cur);
    cur = { width: 0, maxFs: baseSize, hasText: false, hasFormula: false, hasNonFormula: false };
  };
  for (const a of atoms) {
    if (a.kind === "nl") { flush(); continue; }
    if (a.kind === "space" && !cur.hasText) continue; // collapse leading spaces
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
    // A formula-only line (has a formula, no plain characters) uses 1.6× the line height
    const formulaOnly = ln.hasFormula && !ln.hasNonFormula;
    height += formulaOnly ? base * FORMULA_LINE_FACTOR : base;
  }
  const safety = typeof table.safetyFactor === "number" ? table.safetyFactor : 1.06;
  return { lines: lines.length, height: round2(height * safety), maxFontSize };
}


/**
 * Cell content height (px): laid out within colWidth (padding included) plus top/bottom padding.
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
 * Table layout: column widths (ratios) + exact row heights + total height (the deterministic value).
 * Row height = max(model minimum row height, content height of that row); content of a rowSpan>1
 * cell is split across the spanned rows.
 * @param {object} table table element (rows/columnWidths/rowHeights/bounds/fill/style)
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
