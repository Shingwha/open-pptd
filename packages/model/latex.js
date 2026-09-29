// ============================================================================
// latex.js — LaTeX -> MathML wrapper (vendored KaTeX, MathML output mode only)
// ----------------------------------------------------------------------------
// Single source of truth for the formula component: PPTD stores latex and it is
// converted at runtime:
//   - preview (browser): MathML is put into the DOM and rendered natively
//     (Edge / Chrome 109+)
//   - export (Node): MathML -> mathml2omml -> OMML injected into the PPTX
// KaTeX's MathML output mode needs no css/font files (270KB single file, no npm deps).
// ============================================================================

import katex from "./vendor/katex.mjs";

const KATEX_OPTIONS = {
  output: "mathml",
  throwOnError: false, // bad formula does not throw: preview falls back to source, export to plain text
  strict: false,
};

/** LaTeX -> MathML string (wrapped in <span class="katex">). Returns null on failure. */
export function latexToMathml(latex) {
  if (typeof latex !== "string" || !latex.trim()) return null;
  try {
    return katex.renderToString(latex, KATEX_OPTIONS);
  } catch {
    return null;
  }
}
