// ============================================================================
// writer/chart/ser.js — per-type c:ser series construction
// ----------------------------------------------------------------------------

import { el, esc } from "../xml.js";
import { hexA, colLetter, CHART_DEFAULTS } from "../../model/chart.js";
import { buildFill } from "../drawing.js";
import { fillXml, lnXml, dLblsXml, markerXml } from "./style.js";

/** Series/cell outline → a:ln (width defaults to 1pt; color falls back to border.color). */
function borderLnXml(theme, border, color = border?.color) {
  return el("a:ln", { w: Math.round((border?.width ?? 1) * 12700), cap: "flat", cmpd: "sng", algn: "ctr" }, fillXml(theme, color));
}

export function strRefXml(sheetRef, values) {
  return el("c:strRef", {}, [
    el("c:f", {}, sheetRef),
    el("c:strCache", {}, [
      el("c:ptCount", { val: values.length }),
      values.map((v, i) => el("c:pt", { idx: i }, el("c:v", {}, esc(String(v ?? ""))))).join(""),
    ].join("")),
  ].join(""));
}

export function numRefXml(sheetRef, values, format = "General") {
  return el("c:numRef", {}, [
    el("c:f", {}, sheetRef),
    el("c:numCache", {}, [
      el("c:formatCode", {}, format),
      el("c:ptCount", { val: values.length }),
      values.map((v, i) => el("c:pt", { idx: i }, el("c:v", {}, v == null ? "" : String(v)))).join(""),
    ].join("")),
  ].join(""));
}

export function seriesNameXml(name, colIdx) {
  const ref = `Sheet1!$${colLetter(colIdx)}$1`;
  return el("c:tx", {}, el("c:strRef", {}, [
    el("c:f", {}, ref),
    el("c:strCache", {}, [
      el("c:ptCount", { val: 1 }),
      el("c:pt", { idx: 0 }, el("c:v", {}, esc(name))),
    ].join("")),
  ].join("")));
}

export function catRefXml(ch, sheetRange) {
  return el("c:cat", {}, strRefXml(sheetRange(ch.col), ch.vals));
}

export function valRefXml(ch, sheetRange) {
  return el("c:val", {}, numRefXml(sheetRange(ch.col), ch.vals));
}

/** Shared c:ser prelude: idx/order + series-name tx (strRef), extracted from the 9 constructors.
 * Note: bar passes s._index (the horizontal-bar order fix), others pass the emission index. */
function serPreludeXml(name, idxVal, nameColIdx) {
  return [el("c:idx", { val: idxVal }), el("c:order", { val: idxVal }), seriesNameXml(name, nameColIdx)];
}

export function barSerXml(theme, s, sheetRange, idx, labels, chs) {
  const kids = serPreludeXml(s.name, s._index, sheetRange.nameCol(s));
  // s.color = fill || theme color-cycle default (model-resolved); fillXml unifies string colors + gradients
  if (s.color) {
    const spPr = [fillXml(theme, s.color)];
    if (s.border && s.border.color) {
      spPr.push(borderLnXml(theme, s.border));
    }
    if (spPr.length) kids.push(el("c:spPr", {}, spPr.join("")));
  }
  if (labels) kids.push(dLblsXml(theme, labels));
  kids.push(catRefXml(chs.cat, sheetRange), valRefXml(chs.val, sheetRange));
  return el("c:ser", {}, kids.join(""));
}

export function lineSerXml(theme, s, sheetRange, idx, labels, chs, opts = null) {
  const kids = serPreludeXml(s.name, idx, sheetRange.nameCol(s));
  const spPr = [];
  if (s.lineColor) spPr.push(lnXml(theme, s.lineColor, s.width ?? 2, s.lineStyle));
  if (spPr.length) kids.push(el("c:spPr", {}, spPr.join("")));
  const marker = markerXml(theme, s.marker, s.color);
  if (marker) kids.push(marker);
  // suppressMarker: a candlestick overlay line without a marker explicitly writes none — omitting the
  // element lets PowerPoint fall to its default ✕ marker (mismatching the preview's no marker)
  else if (opts?.suppressMarker) kids.push(el("c:marker", {}, el("c:symbol", { val: "none" })));
  if (labels) kids.push(dLblsXml(theme, labels));
  kids.push(catRefXml(chs.cat, sheetRange), valRefXml(chs.val, sheetRange));
  // Explicit per-series smooth 0/1 (a non-smoothed series without the element would inherit group smooth=1 and be smoothed too)
  kids.push(el("c:smooth", { val: s.smooth ? "1" : "0" }));
  return el("c:ser", {}, kids.join(""));
}

export function areaSerXml(theme, s, sheetRange, idx, labels, chs) {
  const kids = serPreludeXml(s.name, idx, sheetRange.nameCol(s));
  const spPr = [];
  const fill = s.areaColor || hexA(s.color, 0.22);
  if (s.areaColor && typeof s.areaColor === "object") spPr.push(buildFill(theme, s.areaColor));
  else spPr.push(fillXml(theme, fill));
  if (s.lineColor || s.color) spPr.push(lnXml(theme, s.lineColor || s.color, s.width ?? 2, s.lineStyle));
  if (spPr.length) kids.push(el("c:spPr", {}, spPr.join("")));
  if (labels) kids.push(dLblsXml(theme, labels));
  kids.push(catRefXml(chs.cat, sheetRange), valRefXml(chs.val, sheetRange));
  // Area series smooth like lines: written explicitly (otherwise a smoothed area export would silently drop it)
  kids.push(el("c:smooth", { val: s.smooth ? "1" : "0" }));
  return el("c:ser", {}, kids.join(""));
}

export function scatterSerXml(theme, s, sheetRange, idx, labels, chs) {
  const kids = serPreludeXml(s.name, idx, sheetRange.nameCol(s));
  // s.color = fill || theme color-cycle default (model-resolved) — write spPr even without a fill, or
  // PowerPoint will not auto-differentiate series colors for bubbleChart etc. (yielding a single bubble color).
  // Scatter semantics = markers only, no connecting lines: even though scatterStyle is lineMarker (OOXML
  // has no pure-scatter value), the native "scatter with markers only" suppresses lines via a ser-level
  // ln noFill; otherwise lines appear.
  // CT_ScatterSer allows only one spPr (fill + ln in the same element; two triggers PowerPoint repair).
  const spPrKids = [];
  if (s.color) spPrKids.push(fillXml(theme, s.color));
  spPrKids.push(el("a:ln", {}, el("a:noFill")));
  kids.push(el("c:spPr", {}, spPrKids.join("")));
  const marker = markerXml(theme, s.marker, s.color);
  if (marker) kids.push(marker);
  if (labels) kids.push(dLblsXml(theme, labels));
  kids.push(
    el("c:xVal", {}, numRefXml(sheetRange(s._cols.x), s._values.x)),
    el("c:yVal", {}, numRefXml(sheetRange(s._cols.y), s._values.y))
  );
  return el("c:ser", {}, kids.join(""));
}

export function bubbleSerXml(theme, s, sheetRange, idx, labels, sizeVals = null) {
  const kids = serPreludeXml(s.name, idx, sheetRange.nameCol(s));
  // s.color = fill || theme color-cycle default (same as scatter)
  if (s.color) kids.push(el("c:spPr", {}, fillXml(theme, s.color)));
  if (labels) kids.push(dLblsXml(theme, labels));
  kids.push(
    el("c:xVal", {}, numRefXml(sheetRange(s._cols.x), s._values.x)),
    el("c:yVal", {}, numRefXml(sheetRange(s._cols.y), s._values.y)),
    // Normalized write values (spec.bubble.writes: 100×(d/dmax)²), passed in as sizeVals
    el("c:bubbleSize", {}, numRefXml(sheetRange(s._cols.size), sizeVals || s._values.size)),
    el("c:bubble3D", { val: "0" })
  );
  return el("c:ser", {}, kids.join(""));
}

/**
 * Candlestick series (1 candlestick series expands into 3/4 c:ser — one per column for HLC
 * (no open) or OHLC, sharing cat):
 *   ser: idx/order + tx(column header) + spPr(ln noFill) + marker(symbol none) + cat + val + smooth 0
 * colHeaders: legend names use each channel's column header (open/high/low/close); using the series
 * name would pollute the legend with K-line×N (native stock charts display by column header).
 */
export function candlestickSerXml(theme, s, sheetRange, serIdx, labels, colHeaders = []) {
  const chs = s._cols.open != null ? ["open", "high", "low", "close"] : ["high", "low", "close"];
  return chs.map((ch, i) => {
    const idx = serIdx + i;
    const displayName = colHeaders[s._cols[ch]] || s.name;
    const kids = [
      ...serPreludeXml(displayName, idx, sheetRange.colHeader(s._cols[ch])),
      el("c:spPr", {}, el("a:ln", { w: "38100", cap: "rnd" }, el("a:noFill"), el("a:round"))),
      el("c:marker", {}, el("c:symbol", { val: "none" })),
    ];
    if (labels) kids.push(dLblsXml(theme, labels));
    const chs2 = { cat: { col: s._cols.x, vals: s._cats }, val: { col: s._cols[ch], vals: s._values[ch] } };
    kids.push(
      catRefXml(chs2.cat, sheetRange),
      el("c:val", {}, numRefXml(sheetRange(s._cols[ch]), s._values[ch]))
    );
    kids.push(el("c:smooth", { val: "0" }));
    return el("c:ser", {}, kids.join(""));
  }).join("");
}

/** upBars/downBars (Excel default up = lt1 white with a gray edge / down = dk1 75% black with a gray
 * edge; default colors come from the CHART_DEFAULTS.candlestick single source, shared with the preview). */
export function upDownBarsXml(theme, s) {
  const up = s.upBars || {};
  const down = s.downBars || {};
  const cs = CHART_DEFAULTS.candlestick;
  const upSpPr = [fillXml(theme, up.fill || cs.upFill)];
  const upLn = borderLnXml(theme, up.border, up.border?.color || cs.upBorder);
  upSpPr.push(upLn);
  const downSpPr = [fillXml(theme, down.fill || cs.downFill)];
  const downLn = borderLnXml(theme, down.border, down.border?.color || cs.downBorder);
  downSpPr.push(downLn);
  return el("c:upDownBars", {}, [
    el("c:gapWidth", { val: "150" }),
    el("c:upBars", {}, el("c:spPr", {}, upSpPr.join(""))),
    el("c:downBars", {}, el("c:spPr", {}, downSpPr.join(""))),
  ].join(""));
}

export function pieSerXml(theme, s, sheetRange, idx, labels, palette) {
  const fills = Array.isArray(s.fill) ? s.fill : null;
  // Official fill: an array cycles per point; a single-color string = all points alike; default = color or the theme cycle
  const ptFill = (r) => {
    if (typeof s.fill === "string") return s.fill;
    if (fills) return fills[r % fills.length];
    return s.color || palette[r % palette.length];
  };
  const pts = (s._values.value || []).map((_, r) => {
    const spPrKids = [fillXml(theme, ptFill(r))];
    if (s.border && s.border.color) {
      spPrKids.push(borderLnXml(theme, s.border));
    }
    return el("c:dPt", {}, [
      el("c:idx", { val: r }),
      el("c:bubble3D", { val: "0" }),
      el("c:spPr", {}, spPrKids.join("")),
    ].join(""));
  }).join("");
  const kids = [
    ...serPreludeXml(s.name, idx, sheetRange.nameCol(s)),
    el("c:spPr", {}, fillXml(theme, s.color)),
    pts,
  ];
  // Pie labels outside (matching the preview's outside + leader lines); doughnuts do not support
  // dLblPos (grayed out in PowerPoint's UI; writing it triggers repair), so fall back to the default bestFit
  if (labels) kids.push(dLblsXml(theme, labels, null, (s.innerRadius || 0) > 0 ? null : "outEnd"));
  const chs = { cat: { col: s._cols.category, vals: s._cats }, val: { col: s._cols.value, vals: s._values.value } };
  kids.push(catRefXml(chs.cat, sheetRange), valRefXml(chs.val, sheetRange));
  return el("c:ser", {}, kids.join(""));
}

export function radarSerXml(theme, s, sheetRange, idx, labels, chs) {
  const kids = serPreludeXml(s.name, idx, sheetRange.nameCol(s));
  const spPr = [];
  if (s.areaColor || s.color) {
    if (s.areaColor && typeof s.areaColor === "object") spPr.push(buildFill(theme, s.areaColor));
    else spPr.push(fillXml(theme, s.areaColor || hexA(s.color, 0.22)));
  }
  if (s.lineColor || s.color) spPr.push(lnXml(theme, s.lineColor || s.color, s.width ?? 2, s.lineStyle));
  if (spPr.length) kids.push(el("c:spPr", {}, spPr.join("")));
  const marker = markerXml(theme, s.marker, s.color);
  if (marker) kids.push(marker);
  if (labels) kids.push(dLblsXml(theme, labels));
  kids.push(catRefXml(chs.cat, sheetRange), valRefXml(chs.val, sheetRange));
  kids.push(el("c:smooth", { val: s.smooth ? "1" : "0" }));
  return el("c:ser", {}, kids.join(""));
}
