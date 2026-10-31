// ============================================================================
// measure/font-metrics.js — deterministic typographic measurement pure functions (default MeasurePort)
// ----------------------------------------------------------------------------
// Input = rich-text runs + style + font metrics; output = geometry. Zero DOM, zero Node
// APIs, so it runs and snapshots on Node/CLI/CI (the "MeasurePort defaults to a
// deterministic pure function" invariant).
//
//   measureTextRuns(runs, style, maxWidth, fonts) → { lines, height }
//   measureCell(cell, colWidth, fonts)           → number (cell content height in px)
//   measureTable(table, opts?)                   → { columnWidths, rowHeights, totalHeight }
//     opts = { theme, fonts } (a bare metrics table is still accepted for compatibility)
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
import { cellTextStyle, resolveTableStyle } from "../model/theme.js";
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
  // Optional tracking (px per character): table cells pass it through measureCell; text
  // measurement is unchanged when the field is absent.
  const letterSpacing = numOr(style.letterSpacing, 0);
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
        let n = 0;
        while (str[i] === " ") { w += charWidth(" ", fs, m); i++; n++; }
        atoms.push({ kind: "space", w: w + letterSpacing * n, fs });
        continue;
      }
      if (isWide(ch)) {
        atoms.push({ kind: "ch", w: charWidth(ch, fs, m) + letterSpacing, fs });
        i++;
        continue;
      }
      let w = 0;
      let n = 0;
      while (i < str.length && str[i] !== " " && str[i] !== "\n" && !isWide(str[i])) {
        w += charWidth(str[i], fs, m);
        i++;
        n++;
      }
      atoms.push({ kind: "word", w: w + letterSpacing * n, fs });
    }
  };
  for (const run of runs || []) {
    if (!run) continue;
    if (run.formula) {
      const fs = numOr(run.style?.fontSize, baseSize);
      maxFontSize = Math.max(maxFontSize, fs);
      atoms.push({ kind: "formula", w: formulaWidth(run.latex, fs) + letterSpacing, fs });
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
 * @param {{text?: string, fontSize?, lineHeight?, lineHeightPx?, fontFamily?, letterSpacing?}} cell
 * @param {number} colWidth px
 * @param {object} [fonts]
 */
export function measureCell(cell, colWidth, fonts = defaultMetricsTable) {
  const style = {
    fontSize: numOr(cell?.fontSize, TABLE_FONT_SIZE),
    lineHeight: cell?.lineHeight,
    lineHeightPx: cell?.lineHeightPx,
    fontFamily: cell?.fontFamily,
    letterSpacing: cell?.letterSpacing,
  };
  const runs = runsFromRichText(cell?.text);
  const inner = Math.max(1, numOr(colWidth, 1) - 2 * TABLE_CELL_PAD_X);
  const { height } = measureTextRuns(runs, style, inner, fonts);
  return Math.ceil(height + 2 * TABLE_CELL_PAD);
}

/**
 * Table layout: column widths (ratios) + exact row heights + total height (the deterministic value).
 *
 * Style awareness: each cell's text style is resolved through the official inheritance chain
 * (cell inline > Cell.textStyle > position class > bodyStyles > cellStyle > default) with
 * `resolveTableStyle` + `cellTextStyle`, then handed to measureCell. Without a theme the
 * result is identical to the previous cell-inline-only measurement (the single-cell API and
 * its direct callers are unchanged).
 *
 * Row heights:
 *   1. seed = estimateTableLayout (rowHeights ratio × bounds height, never below the floor),
 *      rounded up once so every subsequent deficit is an integer;
 *   2. non-spanning cells raise their own row to max(seed, content height);
 *   3. each rowSpan>1 cell computes required = content height (padding counted once) and
 *      available = current sum over its span; a positive deficit is split as
 *      q = floor(deficit / span) with the first `rem` rows taking one extra pixel, so the
 *      span total is >= required with exactly one rounding step (D7).
 *
 * @param {object} table table element (rows/columnWidths/rowHeights/bounds/fill/style)
 * @param {{theme?: object, fonts?: object}|object} [opts] { theme, fonts } or a bare metrics table (compatibility)
 * @returns {{ columnWidths: number[], columnWidthsPx: number[], rowHeights: number[], totalHeight: number }}
 */
export function measureTable(table, opts = undefined) {
  // Compatibility: measureTable(table, fonts) — a metrics table exposes metricsFor().
  const options = opts && typeof opts.metricsFor === "function" ? { fonts: opts } : opts || {};
  const fonts = options.fonts || defaultMetricsTable;
  const theme = options.theme || EMPTY_THEME;
  const el = table || {};
  const rows = Array.isArray(el.rows) ? el.rows : [];
  const boundsW = Array.isArray(el.bounds) ? numOr(el.bounds[2], 0) : 0;
  const base = estimateTableLayout(el); // { rowHeights(min), columnWidths(ratios) }
  const colRatios = base.columnWidths;
  const cols = colRatios.length;
  const colPx = colRatios.map((r) => r * boundsW);
  const { grid } = tableGrid(rows, cols);
  const rowCount = rows.length;
  // Resolve the table style once; per-cell inheritance is the model's single source.
  const ts = resolveTableStyle(theme, el.style);

  /** Content height of one grid cell, style-resolved, padding counted once (+ marginTop). */
  const contentHeight = (g, r, c) => {
    const span = Math.max(1, g.cell.colSpan || 1);
    let w = 0;
    for (let k = 0; k < span && c + k < cols; k++) w += colPx[c + k];
    const st = cellTextStyle(theme, ts, r, c, rowCount, cols, g.cell);
    const styled = {
      ...g.cell,
      fontSize: st.fontSize,
      fontFamily: st.fontFamily,
      lineHeight: st.lineHeight,
      lineHeightPx: st.lineHeightPx,
      letterSpacing: st.letterSpacing,
    };
    const marginTop = numOr(st.marginTop, 0);
    return Math.ceil(measureCell(styled, w, fonts) + marginTop);
  };

  // One rounding of the ratio seed; all later arithmetic stays integer.
  const rowHeights = base.rowHeights.map((h) => Math.ceil(numOr(h, 0)));

  // Pass 1: non-spanning cells set their row's content requirement.
  for (let r = 0; r < grid.length; r++) {
    for (const g of grid[r]) {
      if (g.covered || !g.cell) continue;
      if (Math.max(1, g.cell.rowSpan || 1) > 1) continue;
      rowHeights[r] = Math.max(rowHeights[r] ?? 0, contentHeight(g, r, g.c));
    }
  }

  // Pass 2: rowSpan cells top up the deficit over their span (average split, first rows take the remainder).
  for (let r = 0; r < grid.length; r++) {
    for (const g of grid[r]) {
      if (g.covered || !g.cell) continue;
      const rowSpan = Math.max(1, g.cell.rowSpan || 1);
      if (rowSpan <= 1) continue;
      const span = Math.min(rowSpan, rowCount - r);
      if (span <= 1) {
        rowHeights[r] = Math.max(rowHeights[r] ?? 0, contentHeight(g, r, g.c));
        continue;
      }
      const required = contentHeight(g, r, g.c);
      let available = 0;
      for (let k = 0; k < span; k++) available += rowHeights[r + k] ?? 0;
      const deficit = required - available;
      if (deficit <= 0) continue;
      const q = Math.floor(deficit / span);
      const rem = deficit - q * span;
      for (let k = 0; k < span; k++) rowHeights[r + k] = (rowHeights[r + k] ?? 0) + q + (k < rem ? 1 : 0);
    }
  }
  const totalHeight = rowHeights.reduce((a, b) => a + b, 0);
  return { columnWidths: colRatios, columnWidthsPx: colPx, rowHeights, totalHeight };
}

/** Empty theme for themeless direct calls (styles fall back to cell inline fields / official defaults). */
const EMPTY_THEME = { colors: {}, textStyles: {}, tableStyles: {} };

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
