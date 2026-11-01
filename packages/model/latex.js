// packages/model/latex.js — LaTeX -> MathML wrapper (vendored KaTeX, MathML output only).
// PPTD stores latex and converts at runtime: the preview puts MathML into the DOM (native
// rendering); the export goes MathML -> mathml2omml -> OMML. KaTeX MathML mode needs no
// css/font assets and no npm dependencies.

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
