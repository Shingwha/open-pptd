// ============================================================================
// text.js — rich-text tree → OOXML a:p serialization (shared by text, table cells, chart text)
// ----------------------------------------------------------------------------
// Inheritance chain (PPTD spec): inline run style > paragraph style > content field > $style > default.
// Fonts are uniformly resolved by resolveFont to {latin, ea}; color tokens → schemeClr (theme-swappable).
// ============================================================================

import { esc, escAttr, el } from "./xml.js";
import { parseRichText } from "../model/richtext.js";
import { resolveFont, resolveColor } from "../model/theme.js";
import { latexToMathml } from "../model/latex.js";
import { mathmlToOmml } from "../model/mathml2omml.js";
import { computeBaseStyle, mergeRunStyle } from "../model/style.js";
import { lineHeightMultiplierFor } from "../measure/index.js";
import { colorElement, solidFillElement, buildXfrm, buildFill, shadowElement } from "./drawing.js";
import { ooxmlTextAlign, ooxmlAnchor, LIST_INDENT } from "../model/style-spec.js";

const M_NS = "http://schemas.openxmlformats.org/officeDocument/2006/math";
const A14_NS = "http://schemas.microsoft.com/office/drawing/2010/main";
const MC_NS = "http://schemas.openxmlformats.org/markup-compatibility/2006";

// Math-region fonts (PowerPoint native formula storage: every m:r's a:rPr declares Cambria
// Math explicitly — without it PowerPoint falls back to the paragraph/cell font, which is why
// table formula subscripts turned Microsoft YaHei. Only typeface is declared (rendering depends
// only on typeface; panose and other font metadata are PowerPoint's own bookkeeping))
const MATH_FONT = '<a:latin typeface="Cambria Math"/><a:ea typeface="Cambria Math"/>';

// -- Line-spacing compensation: font single-line-height factor (the base of PowerPoint's
// spcPct, see paragraphProps) --
// Single source: the factor is always derived from the measure metrics table
// (lineHeightMultiplierFor, same table and same ladder as layout/preview: registered-font
// measurement → system-font constant → 1.2 fallback), with no separate table for export.

/** Paragraph font → single-line-height factor (derived from the same measure metrics table). */
function lineFactorOf(theme, fontFamily) {
  const font = resolveFont(theme, fontFamily) || {};
  // ea first, then fall through measure's fallback ladder
  return lineHeightMultiplierFor([font.ea, font.latin].filter(Boolean));
}

function runAttrs(s) {
  const attrs = { lang: "zh-CN" };
  if (s.bold) attrs.b = "1";
  if (s.italic) attrs.i = "1";
  if (s.underline) attrs.u = "sng";
  if (s.strike) attrs.strike = "sngStrike"; // valid ST_TextStrikeType value ("sng" is invalid → PowerPoint repair)
  if (s.fontSize) attrs.sz = Math.round(s.fontSize * 100);
  if (s.letterSpacing) attrs.spc = Math.round(s.letterSpacing * 100);
  if (s.verticalAlign === "superscript") attrs.baseline = "30000";
  else if (s.verticalAlign === "subscript") attrs.baseline = "-25000";
  return attrs;
}

function runXml(theme, s, hrefId) {
  const attrs = runAttrs(s);
  const kids = [];
  // OOXML CT_TextCharacterProperties child order (strict schema; out-of-order triggers repair):
  //   fill group (solidFill/gradFill) → effectLst → highlight → latin/ea/cs → hlinkClick
  // Text gradient takes precedence over solid (official TextContent.gradient applies to the glyphs)
  const fill =
    s.gradient && s.gradient.type === "gradient" && Array.isArray(s.gradient.stops)
      ? buildFill(theme, s.gradient)
      : solidFillElement(theme, s.color, s.opacity);
  if (fill) kids.push(fill);
  // Text shadow (official TextContent.shadow)
  const shdw = shadowElement(theme, s.shadow);
  if (shdw) kids.push(shdw);
  if (s.backgroundColor) {
    // CT_Highlight = CT_Color: srgbClr/schemeClr must be direct children (wrapping in solidFill triggers repair)
    kids.push(el("a:highlight", {}, colorElement(theme, s.backgroundColor)));
  }
  const font = resolveFont(theme, s.fontFamily);
  kids.push(
    `<a:latin typeface="${escAttr(font.latin)}"/><a:ea typeface="${escAttr(font.ea)}"/><a:cs typeface="${escAttr(font.ea)}"/>`
  );
  if (hrefId) {
    kids.push(el("a:hlinkClick", { "r:id": hrefId, "xmlns:r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships" }));
  }
  return el("a:rPr", attrs, kids.join(""));
}

/** Build a single run (with style). hrefId is registered externally and passed in. */
export function buildRun(theme, run, baseStyle, registerLink) {
  // Effective style = base (with paragraph merged in) + run inline, the same mergeRunStyle chain as the renderer's runSpan
  const style = mergeRunStyle(baseStyle, null, run.style);
  let hrefId = null;
  if (run.href && registerLink) {
    hrefId = registerLink(run.href);
  }
  const rPr = runXml(theme, style, hrefId);
  const parts = String(run.text).split("\n");
  const chunks = [];
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) chunks.push(el("a:br"));
    const t = parts[i];
    const preserve = t !== t.trim() || t === "" ? ' xml:space="preserve"' : "";
    chunks.push(`<a:r>${rPr}<a:t${preserve}>${esc(t)}</a:t></a:r>`);
  }
  return chunks.join("");
}

/** Paragraph-level style → a:pPr. base is the style the paragraph inherits; factor is the paragraph font's single-line-height factor. */
function paragraphProps(style, factor) {
  const attrs = {};
  const algn = ooxmlTextAlign(style.textAlign);
  if (algn) attrs.algn = algn;
  if (style.marginLeft) attrs.marL = Math.round(style.marginLeft * 12700);
  if (style.marginRight) attrs.marR = Math.round(style.marginRight * 12700);
  const kids = [];
  // Line spacing maps PPTD field semantics to native PowerPoint spacing types: lineHeightPx
  // (fixed px) → a:spcPts ("Exactly"), lineHeight (multiple) → a:spcPct ("Multiple").
  // The two "multiple" bases differ: PPTD/CSS uses font size (renderer line-height:N = size × N)
  // while spcPct uses the font's natural single-line height (OS/2 metrics: YaHei 1.32, SimSun
  // 1.00, Calibri 1.22). Exporting N×100% directly makes PowerPoint 20~30% looser than the
  // preview, so the multiple is divided by the font factor as compensation (source: lineFactorOf).
  // Spacing is written even without an explicit value (default 1 = official default lineHeight 1).
  if (style.lineHeightPx) {
    kids.push(el("a:lnSpc", {}, el("a:spcPts", { val: Math.round(style.lineHeightPx * 100) })));
  } else {
    const lh = typeof style.lineHeight === "number" && style.lineHeight > 0 ? style.lineHeight : 1;
    kids.push(el("a:lnSpc", {}, el("a:spcPct", { val: Math.round((lh / factor) * 100000) })));
  }
  if (style.marginTop) {
    kids.push(el("a:spcBef", {}, el("a:spcPts", { val: Math.round(style.marginTop * 100) })));
  }
  if (style.listType === "ul") {
    kids.push(el("a:buFont", { typeface: "Arial" }));
    kids.push(el("a:buChar", { char: "•" }));
    if (!attrs.marL) attrs.marL = LIST_INDENT * 12700;
    attrs.indent = -LIST_INDENT * 12700;
  } else if (style.listType === "ol") {
    kids.push(el("a:buFont", { typeface: "Arial" }));
    kids.push(el("a:buAutoNum", { type: "arabicPeriod" }));
    if (!attrs.marL) attrs.marL = LIST_INDENT * 12700;
    attrs.indent = -LIST_INDENT * 12700;
  }
  if (!attrs.algn) attrs.algn = "l";
  return el("a:pPr", attrs, kids.join(""));
}

/**
 * Build paragraph XML (the caller registers hyperlinks).
 * Formula runs (\(...\)) → a14:m-wrapped m:oMath (PowerPoint native inline formula structure):
 *   - inline (mixed with other runs): <a14:m><m:oMath>…</m:oMath></a14:m>
 *   - standalone paragraph: <a14:m><m:oMathPara><m:oMathParaPr><m:jc/>…<m:oMath>…</m:oMath></m:oMathPara></a14:m>
 * @param {object} para rich-text paragraph { style, listType, runs }
 * @param {object} base base style
 * @param {function} registerLink (url) => rId
 * @param {object} [options] { formulaFallback } downgrade formulas to plain text (legacy Office Fallback copy)
 */
export function buildParagraph(theme, para, base, registerLink, options = {}) {
  // Paragraph style merged into the run base (mergeRunStyle single source, same chain as the renderer's runSpan)
  const style = mergeRunStyle(base, para.style);
  if (para.listType) style.listType = para.listType; // list info passed to paragraph props (buChar/indent)
  const factor = lineFactorOf(theme, style.fontFamily);
  const onlyFormulas = para.runs.length > 0 && para.runs.every((r) => r.formula);
  const runs = para.runs
    .map((run) =>
      run.formula
        ? buildFormulaRun(theme, run, style, { paraAlone: onlyFormulas, textAlign: style.textAlign, fallback: options.formulaFallback })
        : buildRun(theme, run, style, registerLink)
    )
    .join("");
  if (!runs) return `<a:p>${paragraphProps(style, factor)}</a:p>`;
  return `<a:p>${paragraphProps(style, factor)}${runs}</a:p>`;
}

/** Inject style into every m:r of the OMML (a:rPr > solidFill / sz / Cambria Math, PowerPoint's
 * native run-property style). Supports theme tokens ($primary etc.) and hex, wired to theme swaps.
 * Formulas inherit only color/font-size; opacity (0~1, optional) = text transparency, with
 * a:alpha inside the color element (official structure).
 * Also completes PowerPoint's native formula storage:
 *   - every m:r declares Cambria Math explicitly (otherwise PowerPoint falls back to the
 *     paragraph/cell font, turning table formula subscripts into Microsoft YaHei)
 *   - m:nor (\text{} plain-text runs) get an explicit non-italic i="0"
 *   - structural elements (sub/sup/limit/nary/delimiter…) get m:ctrlPr (control properties that
 *     PowerPoint always fills in on re-save)
 *   - m:grow "1/0" → "on/off" (PowerPoint's stored values; mathml2omml matches the official XSLT bytes, emitting 1/0) */
function injectRunStyle(omml, { color, fontSize, opacity } = {}, theme) {
  let fill = "";
  if (color) {
    // OOXML color values must not carry a # prefix (#1565C0 → 1565C0); tokens are resolved by resolveColor
    const resolved = resolveColor(theme, color);
    const hex = resolved ? String(resolved).replace(/^#/, "").toUpperCase() : "";
    if (/^[0-9A-F]{6}$/.test(hex)) {
      const alpha =
        opacity != null && opacity < 1 ? `<a:alpha val="${Math.round(opacity * 100000)}"/>` : "";
      fill = `<a:solidFill><a:srgbClr val="${hex}">${alpha}</a:srgbClr></a:solidFill>`;
    }
  }
  const szAttr = Number(fontSize) > 0 ? ` sz="${Math.round(Number(fontSize) * 100)}"` : "";
  // No explicit color but opacity needed → default text slot tx1 + a:alpha (official structure)
  if (!fill && opacity != null && opacity < 1) {
    fill = `<a:solidFill><a:schemeClr val="tx1"><a:alpha val="${Math.round(opacity * 100000)}"/></a:schemeClr></a:solidFill>`;
  }
  // Inside m:r, insert a:rPr after the rPr (if any) and before m:t; with no rPr, right after <m:r>.
  // Note: do not return early when there is no fill/sz — the Cambria Math declaration must always
  // be injected, or a formula run lacking a typeface falls back to the paragraph font (YaHei)
  let out = omml.replace(/<m:r>(?:(<m:rPr>[\s\S]*?<\/m:rPr>))?(?=<m:t>([^<]*)<\/m:t>)/g, (_m, rpr, text) => {
    // Explicit italic/upright declaration (PowerPoint's native storage; always written on re-save/edit):
    //   - no m:rPr and pure letters (math variables like P/a/x) → i="1"
    //   - m:nor (\text{} plain text) → i="0"
    //   - everything else (mixed number/operator runs, \mathrm style runs) → no i, letting
    //     PowerPoint's math engine decide per character (matching re-save and avoiding merged
    //     runs like Q= / i=1 being italicized wholesale)
    const italic = !rpr
      ? /^[A-Za-z]+$/.test(text)
        ? ' i="1"'
        : ""
      : rpr.includes("<m:nor/>")
        ? ' i="0"'
        : "";
    const rPr = `<a:rPr${szAttr}${italic}>${fill}${MATH_FONT}</a:rPr>`;
    return rpr ? `<m:r>${rpr}${rPr}` : `<m:r>${rPr}`;
  });
  // Structural ctrlPr (PowerPoint native formula storage: m:sSubPr/m:naryPr/... contain m:ctrlPr):
  // an existing Pr (naryPr/radPr/accPr/dPr/...) gets it appended inside; otherwise (sSub/sSup/limLow/...)
  // it is created
  const ctrlPr = `<m:ctrlPr><a:rPr${szAttr}>${fill}${MATH_FONT}</a:rPr></m:ctrlPr>`;
  const ctrlStructs = [
    ["m:sSub", "m:sSubPr"],
    ["m:sSup", "m:sSupPr"],
    ["m:sSubSup", "m:sSubSupPr"],
    ["m:limLow", "m:limLowPr"],
    ["m:limUpp", "m:limUppPr"],
    ["m:nary", "m:naryPr"],
    ["m:d", "m:dPr"],
    ["m:rad", "m:radPr"],
    ["m:bar", "m:barPr"],
    ["m:acc", "m:accPr"],
    ["m:groupChr", "m:groupChrPr"],
    ["m:borderBox", "m:borderBoxPr"],
    ["m:eqArr", "m:eqArrPr"],
    ["m:m", "m:mPr"],
  ];
  for (const [tag, prTag] of ctrlStructs) {
    const prClose = `</${prTag}>`;
    if (out.includes(prClose)) {
      out = out.replace(new RegExp(prClose, "g"), `${ctrlPr}${prClose}`);
    } else {
      // The lookahead asserts without consuming, so the replacement must not end with ">", or it would combine with the remaining ">" into ">>"
      out = out.replace(new RegExp(`<${tag}(?=[\\s>])`, "g"), `<${tag}><${prTag}>${ctrlPr}</${prTag}`);
    }
  }
  // m:grow value normalization (mathml2omml emits 1/0 to match the official XSLT bytes; PowerPoint stores on/off)
  out = out
    .replace(/<m:grow m:val="1"\/>/g, '<m:grow m:val="on"/>')
    .replace(/<m:grow m:val="0"\/>/g, '<m:grow m:val="off"/>');
  return out;
}

/**
 * Inline formula run → a14:m wrapper (PowerPoint native inline formula storage).
 * Official spec: formulas inherit only color and font-size; on parse failure/fallback they degrade
 * to the LaTeX source text.
 */
function buildFormulaRun(theme, run, baseStyle, { paraAlone = false, textAlign = null, fallback = false } = {}) {
  const color = run.style?.color || baseStyle.color;
  const fontSize = run.style?.fontSize || baseStyle.fontSize;
  const opacity = baseStyle.opacity; // element-level transparency (official: a:alpha inside the color element)
  const mml = latexToMathml(run.latex);
  if (!mml || fallback) {
    const rPr = runXml(theme, mergeRunStyle(baseStyle, null, run.style), null);
    return `<a:r>${rPr}<a:t>${esc(run.latex)}</a:t></a:r>`;
  }
  // mathmlToOmml output already has the <m:oMath> root (matching the official XSLT bytes); the namespace is declared on the root
  const omml = mathmlToOmml(mml).replace(/^<m:oMath>/, `<m:oMath xmlns:m="${M_NS}">`);
  const styled = injectRunStyle(omml, { color, fontSize, opacity }, theme);
  if (paraAlone) {
    const jc =
      textAlign === "center" || textAlign === "right"
        ? `<m:oMathParaPr><m:jc m:val="${textAlign}"/></m:oMathParaPr>`
        : "";
    // A standalone formula paragraph gets a trailing endParaRPr (Cambria Math, PowerPoint re-save
    // structure) to set the paragraph's default run properties and avoid re-normalization on edit
    return `<a14:m xmlns:a14="${A14_NS}"><m:oMathPara xmlns:m="${M_NS}">${jc}${styled}</m:oMathPara></a14:m><a:endParaRPr dirty="0">${MATH_FONT}</a:endParaRPr>`;
  }
  return `<a14:m xmlns:a14="${A14_NS}">${styled}</a14:m>`;
}

/** Text box → p:sp XML; when formulas are present, wrap in mc:AlternateContent per PowerPoint's
 * native structure (Choice = formula version, Fallback = a legacy Office-compatible version with
 * formulas degraded to LaTeX source text).
 * spPr matches a native PowerPoint text box: xfrm + prstGeom rect + noFill (CT_ShapeProperties
 * requires geometry; without it some Office implementations apply default fill/border, producing
 * unexplained color blocks on exported text boxes).
 */
export function textXml(theme, element, ctx) {
  const b = element.bounds;
  const spPr =
    buildXfrm(b, element.rotation, element.flip) +
    el("a:prstGeom", { prst: "rect" }, el("a:avLst")) +
    el("a:noFill");
  const buildSp = (inner) =>
    el("p:sp", {}, [
      el("p:nvSpPr", {}, [
        el("p:cNvPr", { id: ctx.nextId(), name: escAttr(element.elementId) }),
        el("p:cNvSpPr", { txBox: "1" }),
        el("p:nvPr"),
      ]),
      el("p:spPr", {}, spPr),
      el("p:txBody", {}, inner),
    ].join(""));
  // Element-level transparency (official Text.opacity) → run-level fill a:alpha (PowerPoint storage)
  const body = buildTextBody(theme, element.content, ctx.registerLink, { opacity: element.opacity });
  if (body.includes("<a14:m")) {
    const fallbackBody = buildTextBody(theme, element.content, ctx.registerLink, { formulaFallback: true, opacity: element.opacity });
    const choice = el("mc:Choice", { "xmlns:a14": A14_NS, Requires: "a14" }, buildSp(body));
    const fallback = el("mc:Fallback", {}, buildSp(fallbackBody));
    return el("mc:AlternateContent", { "xmlns:mc": MC_NS }, choice + fallback);
  }
  return buildSp(body);
}

/**
 * Build the full txBody.
 * @param {object} content text element content (text/style/color/fontSize/...)
 * @param {function} registerLink (url) => rId
 * @param {object} [options] { formulaFallback } downgrade formulas to plain text (for the Fallback copy)
 */
export function buildTextBody(theme, content, registerLink, options = {}) {
  const tree = parseRichText(content?.text || "");
  const base = computeBaseStyle(theme, content);
  // Element-level transparency (official Text.opacity) → a:alpha inside every run's fill color
  if (options.opacity != null) base.opacity = options.opacity;
  const bodyAttrs = { lIns: 0, tIns: 0, rIns: 0, bIns: 0, wrap: "square" };
  if (content?.wrap === false) bodyAttrs.wrap = "none";
  if (content?.textDirection === "vertical") bodyAttrs.vert = "eaVert";
  // Vertical align (official default [left, top] → anchor "t")
  const v = Array.isArray(content?.align) ? content.align[1] : "top";
  bodyAttrs.anchor = ooxmlAnchor(v) || "t";
  // Autofit: spAutoFit (PowerPoint's native text-box default, matching the editor's "box grows
  // with content"). The editor syncs the bounds height to the content height after rendering, so
  // the exported box height = content height: opening the PPT neither shrinks nor clips text, and
  // PowerPoint re-adapts on edit.
  const paras = tree.paragraphs
    .map((p) => buildParagraph(theme, p, base, registerLink, options))
    .join("");
  return el("a:bodyPr", bodyAttrs, el("a:spAutoFit")) + el("a:lstStyle") + paras;
}
