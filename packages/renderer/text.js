// ============================================================================
// renderer/text.js — rich text → DOM (same inheritance chain as writer/text.js)
// ----------------------------------------------------------------------------
// Chain: content base style → container (root) → paragraph (explicit deltas) → run
// (explicit deltas). The base style is written once on the container and inherited;
// span/paragraph inline styles carry only explicit deltas.
//
// Official defaults (TextContent): color #000000 / fontSize 18 / fontFamily Microsoft
// YaHei / lineHeight 1 / align [left, top]. The renderer fills the gaps between
// browser CSS and these PPT defaults. Formulas (\(...\)) inherit only color / font-size
// (official spec) and render natively via KaTeX → MathML.
// ============================================================================

import { parseRichText } from "../model/richtext.js";
import { computeBaseStyle, mergeRunStyle } from "../model/style.js";
import { latexToMathml } from "../model/latex.js";
import { resolveColor, resolveFont } from "../model/theme.js";
import { cssTextAlign, cssTextAlignLast, LIST_INDENT } from "../model/style-spec.js";
import { gradientCss } from "./gradient.js";
import { createElementShell, boxShadowCss } from "./shell.js";

const DEFAULT_FONT_SIZE = 18;
const DEFAULT_LINE_HEIGHT = 1;

/**
 * Run layer: effective style = base + paragraph style + run inline (merged by
 * mergeRunStyle, the same chain as writer buildParagraph→buildRun), writing only the
 * explicit deltas relative to the base. Paragraph-level resets (e.g. bold:false to
 * cancel an element bold) also land on the span to block container inheritance.
 * A formula run → KaTeX MathML.
 */
export function runSpan(theme, run, base, paraStyle) {
  const s = mergeRunStyle(base, paraStyle, run.style);
  if (run.formula) return formulaSpan(theme, run, s);
  const node = run.href ? document.createElement("a") : document.createElement("span");
  if (run.href) node.href = run.href;
  node.textContent = run.text;
  const css = [];
  if (s.bold === true) css.push("font-weight:bold");
  else if (s.bold === false && base.bold) css.push("font-weight:normal");
  if (s.italic === true) css.push("font-style:italic");
  else if (s.italic === false && base.italic) css.push("font-style:normal");
  const deco = [];
  if (s.underline === true) deco.push("underline");
  else if (s.underline === false && base.underline) deco.push("none");
  if (s.strike === true) deco.push("line-through");
  if (deco.length) css.push(`text-decoration:${deco.join(" ")}`);
  if (s.fontSize) css.push(`font-size:${s.fontSize}px`);
  const color = s.color ? resolveColor(theme, s.color) : null;
  if (color) css.push(`color:${color}`);
  const font = s.fontFamily ? resolveFont(theme, s.fontFamily) : null;
  if (font) css.push(`font-family:"${font.latin}","${font.ea}",sans-serif`);
  if (s.backgroundColor) {
    const bg = resolveColor(theme, s.backgroundColor);
    if (bg) css.push(`background:${bg}`);
  }
  if (s.letterSpacing != null) css.push(`letter-spacing:${s.letterSpacing}px`);
  if (s.verticalAlign === "superscript") css.push("vertical-align:super;font-size:0.7em");
  if (s.verticalAlign === "subscript") css.push("vertical-align:sub;font-size:0.7em");
  node.style.cssText = css.join(";");
  return node;
}

/**
 * Formula run → inline span (KaTeX MathML, rendered natively by the browser).
 * Official spec: formulas inherit only color and font-size (already extracted as
 * context values into run.style by the parser). On parse failure, fall back to
 * showing the LaTeX source with a light background.
 */
function formulaSpan(theme, run, base) {
  const node = document.createElement("span");
  node.className = "pptd-formula";
  node.dataset.formula = "1";
  const css = [];
  const fontSize = run.style?.fontSize || base.fontSize || DEFAULT_FONT_SIZE;
  css.push(`font-size:${fontSize}px`);
  const color = (run.style?.color || base.color) && !base.gradient ? resolveColor(theme, run.style?.color || base.color) : null;
  if (color) css.push(`color:${color}`);
  node.style.cssText = css.join(";");
  const mml = latexToMathml(run.latex);
  if (mml) {
    node.innerHTML = mml;
    const math = node.querySelector("math");
    if (math) {
      math.style.fontFamily = "'Cambria Math','STIX Two Math','Latin Modern Math',math";
    }
  } else {
    node.textContent = `\\(${run.latex}\\)`;
    node.style.background = "#FFF3E0";
    node.style.color = "#E65100";
  }
  return node;
}

/** Horizontal align → CSS value: distributed has no native CSS equivalent, mapped to justify + last-line stretch. */
function textAlignCss(v) {
  const align = cssTextAlign(v);
  if (!align) return v; // pass unknown values through unchanged
  const last = cssTextAlignLast(v);
  return last ? `${align};text-align-last:${last}` : align;
}

/** Paragraph layer: writes only paragraph-box layout styles (text-align / line-height /
 * margin…, the writer's a:pPr domain); text properties always land per run via runSpan. */
export function applyParaStyle(el, para) {
  const s = para.style || {};
  const css = [];
  if (s.textAlign) css.push(`text-align:${textAlignCss(s.textAlign)}`);
  if (s.lineHeightPx) css.push(`line-height:${s.lineHeightPx}px`);
  else if (s.lineHeight) css.push(`line-height:${s.lineHeight}`);
  if (s.marginTop) css.push(`margin-top:${s.marginTop}px`);
  if (s.marginLeft) css.push(`margin-left:${s.marginLeft}px`);
  if (s.marginRight) css.push(`margin-right:${s.marginRight}px`);
  if (s.letterSpacing != null) css.push(`letter-spacing:${s.letterSpacing}px`);
  el.style.cssText = css.join(";");
}

/**
 * Render rich-text element content → container DOM (100% width/height).
 * Base style (size/color/bold/font/line-height…) is written on this container and
 * inherited by paragraphs/runs.
 * @param {object} theme normalized theme
 * @param {object} content text element content
 * @returns {HTMLElement}
 */
function renderTextContent(theme, content) {
  const tree = parseRichText(content?.text || "");
  const base = computeBaseStyle(theme, content);

  const root = document.createElement("div");
  // overflow:visible — text is never clipped (PowerPoint "do not autofit", see renderText)
  const css = ["width:100%;height:100%;box-sizing:border-box;overflow:visible;white-space:pre-line"];
  // -- content base style → container layer (once, inherited); fill official defaults when unset --
  css.push(`font-size:${base.fontSize || DEFAULT_FONT_SIZE}px`);
  const color = resolveColor(theme, base.color);
  if (color) css.push(`color:${color}`);
  if (base.bold) css.push("font-weight:bold");
  if (base.italic) css.push("font-style:italic");
  if (base.lineHeightPx) css.push(`line-height:${base.lineHeightPx}px`);
  else css.push(`line-height:${base.lineHeight || DEFAULT_LINE_HEIGHT}`);
  if (base.letterSpacing != null) css.push(`letter-spacing:${base.letterSpacing}px`);
  const font = resolveFont(theme, base.fontFamily);
  css.push(`font-family:"${font.latin}","${font.ea}",sans-serif`);
  if (base.backgroundColor) {
    const bg = resolveColor(theme, base.backgroundColor);
    if (bg) css.push(`background:${bg}`);
  }
  if (base.textAlign) css.push(`text-align:${textAlignCss(base.textAlign)}`);
  // Text gradient: applied to the glyphs themselves (background-clip:text); mutually exclusive with color
  const grad = gradientCss(theme, base.gradient);
  if (grad) {
    css.push(`background:${grad}`);
    css.push("-webkit-background-clip:text;background-clip:text;color:transparent");
  }
  // Text shadow (boxShadowCss single source: shares offset/blur/color with box-shadow)
  const shadow = boxShadowCss(theme, base.shadow);
  if (shadow) css.push(`text-shadow:${shadow}`);
  // Vertical text / no wrap (official textDirection / wrap)
  if (content?.textDirection === "vertical") css.push("writing-mode:vertical-rl;text-orientation:upright");
  if (content?.wrap === false) css.push("white-space:pre;overflow:visible");
  // Vertical align (official default top; middle/bottom use flex)
  const vAlign = Array.isArray(content?.align) ? content.align[1] : "top";
  if (vAlign === "middle" || vAlign === "bottom") {
    css.push("display:flex;flex-direction:column;justify-content:" + (vAlign === "middle" ? "center" : "flex-end"));
  }
  root.style.cssText = css.join(";");

  let listBuffer = null;
  for (const para of tree.paragraphs) {
    if (para.listType) {
      if (!listBuffer || listBuffer.dataset.list !== para.listType) {
        listBuffer = document.createElement(para.listType === "ol" ? "ol" : "ul");
        listBuffer.dataset.list = para.listType;
        listBuffer.style.cssText = `margin:0;padding-left:${LIST_INDENT}px;`;
        root.appendChild(listBuffer);
      }
      const li = document.createElement("li");
      applyParaStyle(li, para);
      for (const run of para.runs) li.appendChild(runSpan(theme, run, base, para.style));
      listBuffer.appendChild(li);
    } else {
      listBuffer = null;
      const p = document.createElement("div");
      applyParaStyle(p, para);
      for (const run of para.runs) p.appendChild(runSpan(theme, run, base, para.style));
      root.appendChild(p);
    }
  }
  return root;
}

/** Text element → positioned DOM (positioning / transforms / markers all go through renderer/shell.js).
 * PowerPoint "do not autofit" semantics: box height is the author's declaration and content
 * overflow stays VISIBLE (both shell and content root use overflow:visible) — never clipped,
 * never repositioned. */
export function renderText(theme, el) {
  const box = createElementShell(el);
  box.style.overflow = "visible"; // override shell's default overflow:hidden so overflow text stays visible
  box.appendChild(renderTextContent(theme, el.content));
  return box;
}
