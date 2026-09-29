// ============================================================================
// layout/index.js — layout stage
// ----------------------------------------------------------------------------
// layout(deck, measure?) → LayoutTree
//
// LayoutTree is "the final geometry fact of every element" — a pure data tree parallel to Deck:
//   { pageSize: {w,h}, pages: [ { index, elements: [LayoutElement] } ] }
//   LayoutElement = {
//     elementId, elementType,
//     declared: {x,y,w,h},          // author declaration (el.bounds; the model is never written back)
//     frame:    {x,y,w,h},          // layout fact (h = the actual grown value)
//     grown: boolean,               // frame.h > declared.h
//     text?:  { lines, contentHeight },
//     table?: { columnWidths, rowHeights, totalHeight },
//     overflow: { x, y, page, overlaps: [{elementId, rect}] },
//   }
//
// Invariants: no measurement after layout (paint only reads this tree); the model is never
// written back (el.bounds is read-only); MeasurePort defaults to a deterministic pure function.
// Group shells are skipped and each member laid out individually (members already live in
// page.elements; renderer renderPage returns null for shells with the same semantics).
// Chart size passes through (single-sourced in model/chart/layout.js).
// Dual-end pure functions: this file forbids node:/fs/window./document. (enforced by dep-graph).
// ============================================================================

import { deckSize } from "../model/model.js";
import { normalizeTheme, resolveFont } from "../model/theme.js";
import { computeBaseStyle } from "../model/style.js";
import { fontMetricsMeasure, runsFromRichText, familiesOf } from "../measure/index.js";

const EPS = 0.5; // growth tolerance (sub-pixel jitter does not count as growth)

/** Theme: return as-is when already normalized (has colors), otherwise normalizeTheme. */
function themeOf(deck) {
  const t = deck?.theme;
  if (t && typeof t === "object" && t.colors) return t;
  return normalizeTheme(t);
}

/** Declared element geometry [x,y,w,h] → {x,y,w,h} (invalid values fall back to zero size). */
function declaredOf(el) {
  const b = Array.isArray(el?.bounds) ? el.bounds : [0, 0, 0, 0];
  return { x: num(b[0]), y: num(b[1]), w: Math.max(0, num(b[2])), h: Math.max(0, num(b[3])) };
}
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Text element → { frame, text }. */
function layoutText(theme, el, measure) {
  const d = declaredOf(el);
  const content = el.content || {};
  const base = computeBaseStyle(theme, content);
  const font = resolveFont(theme, base.fontFamily) || {};
  const runs = runsFromRichText(content.text);
  const res = measure.measureTextRuns(
    runs,
    { fontSize: base.fontSize, lineHeight: base.lineHeight, lineHeightPx: base.lineHeightPx, fontFamily: familiesOf(font).length ? familiesOf(font) : base.fontFamily },
    d.w
  );
  const h = Math.max(d.h, res.height);
  return {
    frame: { x: d.x, y: d.y, w: d.w, h },
    grown: h > d.h + EPS,
    text: { lines: res.lines, contentHeight: res.height },
  };
}

/** Table element → { frame, table }. */
function layoutTable(el, measure) {
  const d = declaredOf(el);
  const t = measure.measureTable(el);
  const h = Math.max(d.h, t.totalHeight);
  return {
    frame: { x: d.x, y: d.y, w: d.w, h },
    grown: h > d.h + EPS,
    table: { columnWidths: t.columnWidths, rowHeights: t.rowHeights, totalHeight: t.totalHeight },
  };
}

/** Intersection of two rectangles (null when disjoint). */
function intersection(a, b) {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const r = Math.min(a.x + a.w, b.x + b.w);
  const btm = Math.min(a.y + a.h, b.y + b.h);
  if (r - x <= 0 || btm - y <= 0) return null;
  return { x, y, w: r - x, h: btm - y };
}

/**
 * Lay out the whole deck.
 * @param {object} deck parsed (or already resolved) deck; theme is normalized internally if needed
 * @param {typeof fontMetricsMeasure} [measure] MeasurePort (defaults to the deterministic pure-function implementation)
 * @returns {object} LayoutTree
 */
export function layout(deck, measure = fontMetricsMeasure) {
  const theme = themeOf(deck);
  const [W, H] = deckSize(deck);
  const pages = [];
  (deck?.pages || []).forEach((page, pi) => {
    const elements = [];
    for (const el of page?.elements || []) {
      if (!el) continue;
      if (el.elementType === "group") continue; // skip the shell, lay out its members (they are in this array)
      const d = declaredOf(el);
      let part;
      if (el.elementType === "text") part = layoutText(theme, el, measure);
      else if (el.elementType === "table") part = layoutTable(el, measure);
      else part = { frame: { ...d }, grown: false }; // shape/line/image/icon/chart: size passes through
      elements.push({
        elementId: el.elementId,
        elementType: el.elementType,
        declared: d,
        frame: part.frame,
        grown: part.grown,
        ...(part.text ? { text: part.text } : {}),
        ...(part.table ? { table: part.table } : {}),
        overflow: { x: false, y: false, page: false, overlaps: [] },
      });
    }
    // Out-of-canvas facts + grown-content overlap detection with elements below
    for (const le of elements) {
      const f = le.frame;
      le.overflow.x = f.x < 0 || f.x + f.w > W;
      le.overflow.y = f.y < 0 || f.y + f.h > H;
      le.overflow.page = f.x + f.w <= 0 || f.y + f.h <= 0 || f.x >= W || f.y >= H;
      if (!le.grown) continue;
      // Growth region = the strip between the declared bottom and the actual bottom (the free
      // by-product that catches a tall table pushing the element below it)
      const strip = { x: f.x, y: le.declared.y + le.declared.h, w: f.w, h: f.h - le.declared.h };
      for (const other of elements) {
        if (other === le) continue;
        const hit = intersection(strip, other.frame);
        if (hit) le.overflow.overlaps.push({ elementId: other.elementId, rect: hit });
      }
    }
    pages.push({ index: pi, elements });
  });
  return { pageSize: { w: W, h: H }, pages };
}

export default layout;
