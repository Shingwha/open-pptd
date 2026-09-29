// ============================================================================
// app/view/dom-measure.js — browser offscreen batch-measure adapter (RP-C / M6 wiring)
// ----------------------------------------------------------------------------
// packages/measure/adapters/dom.js was left as a stub in the RP-A/RP-B waves; this
// wave (RP-C) provides the implementation on the **editor side** and wires it into
// canvas layout (packages/measure belongs to RP-A and is off-limits here, so the
// implementation lives in the editor layer; the interface matches MeasurePort).
//
// Purpose: measure text runs once with offscreen DOM to refine the pure-function
// residual of fontMetricsMeasure.
//   · Results only feed layout (frame/overflow), **never the model** (the third of
//     the three iron rules: "the model is never written back").
//   · Conservative composition: take max(pure-function estimate, DOM measurement) —
//     the pure function carries a safety margin (better too tall than too short) and
//     DOM only makes up for its underestimate; never let a DOM measurement shrink an
//     already-decided height (which would give the editor and headless
//     thumbnails/golden baselines two different geometries).
//   · Runs containing formulas use the pure function directly (formula layout needs
//     KaTeX, which offscreen DOM cannot reproduce equivalently).
//   · When fonts are not ready (document.fonts still loading), fall back to the pure
//     function to avoid measuring with fallback fonts.
//   · Tables still go through the pure function: measureTable is implemented there
//     (exact table row heights were single-sourced in RP-B), and this adapter does
//     not copy packages/model/table.js internals.
// ============================================================================

import { fontMetricsMeasure, familiesOf } from "../../../packages/measure/index.js";

let host = null;

// Offscreen host base style: invisible but laid out (pre-wrap makes \n a line break; the caller sets the width).
const HOST_CSS =
  "position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none;" +
  "margin:0;padding:0;border:0;box-sizing:content-box;white-space:pre-wrap;overflow-wrap:break-word;word-break:normal;";

/** Offscreen measurement host (singleton; display-invisible but laid out). */
function ensureHost() {
  if (host && host.isConnected) return host;
  host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = HOST_CSS;
  document.body.appendChild(host);
  return host;
}

function fontCss(style) {
  const families = familiesOf(style?.fontFamily);
  const css = [];
  if (style?.fontSize != null) css.push(`font-size:${Number(style.fontSize)}px`);
  if (style?.lineHeightPx != null) css.push(`line-height:${Number(style.lineHeightPx)}px`);
  else if (style?.lineHeight != null) css.push(`line-height:${Number(style.lineHeight)}`);
  if (families.length) css.push(`font-family:${families.map((f) => `"${String(f).replace(/"/g, '\\"')}"`).join(",")}`);
  return css.join(";");
}

/** Rich-text runs → host innerHTML (pre-wrap makes \n a line break; plain-text runs only, formulas already excluded). */
function runsToHtml(runs, baseSize) {
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  let html = "";
  for (const run of runs || []) {
    if (!run) continue;
    const text = esc(run.text ?? "");
    const st = run.style || {};
    const css = [];
    if (st.fontSize != null && st.fontSize !== baseSize) css.push(`font-size:${Number(st.fontSize)}px`);
    if (st.bold) css.push("font-weight:700");
    if (st.italic) css.push("font-style:italic");
    html += css.length ? `<span style="${css.join(";")}">${text}</span>` : text;
  }
  return html;
}

/** Measured DOM text height (px); null when not measurable. */
function domTextHeight(runs, style, maxWidth) {
  if (typeof document === "undefined" || !document.body) return null;
  // Fonts not ready: measuring with fallback fonts would be off, hand it to the pure function
  if (document.fonts && document.fonts.status && document.fonts.status !== "loaded") return null;
  const el = ensureHost();
  el.style.cssText =
    HOST_CSS +
    (Number.isFinite(maxWidth) ? `width:${Math.max(1, maxWidth)}px;` : "width:auto;") +
    fontCss(style);
  el.innerHTML = runsToHtml(runs, style?.fontSize) || "";
  const h = el.getBoundingClientRect().height;
  el.innerHTML = "";
  return Number.isFinite(h) && h > 0 ? h : null;
}

/**
 * DOM-refined measureTextRuns: max(pure function, DOM measurement).
 * @param {Array} runs
 * @param {object} style
 * @param {number} maxWidth
 * @param {object} [fonts] metrics table (passed through to the pure function)
 */
export function measureTextRunsDom(runs, style = {}, maxWidth = Infinity, fonts) {
  const base = fontMetricsMeasure.measureTextRuns(runs, style, maxWidth, fonts);
  if ((runs || []).some((r) => r && r.formula)) return base; // formula: pure function
  const dom = domTextHeight(runs, style, maxWidth);
  if (dom == null) return base;
  const height = Math.max(base.height, Math.round(dom * 100) / 100);
  return { ...base, height };
}

/** MeasurePort: text runs get the DOM refinement, everything else (cells/tables/line-height factors) uses the pure function. */
export function createDomMeasure() {
  return {
    ...fontMetricsMeasure,
    measureTextRuns: measureTextRunsDom,
    /** Called when the editor rebuilds layout (drops the host's cached height after a project/font change). */
    reset() {
      if (host) {
        host.innerHTML = "";
      }
    },
  };
}

/** Adapter availability: true in a browser (outside Node the caller falls back to fontMetricsMeasure). */
export function isDomMeasureAvailable() {
  return typeof document !== "undefined" && !!document.body;
}
