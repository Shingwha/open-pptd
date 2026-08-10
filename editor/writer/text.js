// ============================================================================
// text.js — 富文本树 → OOXML a:p 序列化（文字、表格单元格、图表文字共用）
// ----------------------------------------------------------------------------
// 继承链（PPTD 规范）：inline run 样式 > 段落样式 > content 字段 > $style > 默认。
// 字体统一 resolveFont 到 {latin, ea}；颜色 token → schemeClr（可换主题）。
// ============================================================================

import { esc, escAttr, el } from "./xml.js";
import { parseRichText } from "../core/richtext.js";
import { resolveFont } from "../core/theme.js";
import { latexToMathml } from "../core/latex.js";
import { mathmlToOmml } from "../core/mathml2omml.js";
import { injectRunStyle } from "./formula.js";
import { computeBaseStyle, pickDefined } from "../core/style.js";
import { colorElement, solidFillElement, buildXfrm, buildFill, shadowElement } from "./drawing.js";

const M_NS = "http://schemas.openxmlformats.org/officeDocument/2006/math";
const A14_NS = "http://schemas.microsoft.com/office/drawing/2010/main";
const MC_NS = "http://schemas.openxmlformats.org/markup-compatibility/2006";

const H_ALIGN = { left: "l", center: "ctr", right: "r", justify: "just", distributed: "dist" };

function runAttrs(s) {
  const attrs = { lang: "zh-CN" };
  if (s.bold) attrs.b = "1";
  if (s.italic) attrs.i = "1";
  if (s.underline) attrs.u = "sng";
  if (s.strike) attrs.strike = "sng";
  if (s.fontSize) attrs.sz = Math.round(s.fontSize * 100);
  if (s.letterSpacing) attrs.spc = Math.round(s.letterSpacing * 100);
  if (s.verticalAlign === "superscript") attrs.baseline = "30000";
  else if (s.verticalAlign === "subscript") attrs.baseline = "-25000";
  return attrs;
}

function runXml(theme, s, hrefId) {
  const attrs = runAttrs(s);
  const kids = [];
  // OOXML CT_TextCharacterProperties 子元素顺序（schema 严格，乱序会被 PowerPoint 判损修复）：
  //   fill 组（solidFill/gradFill）→ effectLst → highlight → latin/ea/cs → hlinkClick
  // 文字渐变优先于单色（官方 TextContent.gradient 作用于文字本身）
  const fill =
    s.gradient && s.gradient.type === "gradient" && Array.isArray(s.gradient.stops)
      ? buildFill(theme, s.gradient)
      : solidFillElement(theme, s.color, s.opacity);
  if (fill) kids.push(fill);
  // 文字阴影（官方 TextContent.shadow）
  const shdw = shadowElement(theme, s.shadow);
  if (shdw) kids.push(shdw);
  if (s.backgroundColor) {
    // CT_Highlight = CT_Color：srgbClr/schemeClr 必须是直接子元素（包 solidFill 会被判损修复）
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

/** run 文本按 \n 拆分为 a:t + a:br。 */
function runTextXml(theme, text, hrefId) {
  const parts = String(text).split("\n");
  const rPr = runXml(theme, {}, hrefId);
  const chunks = [];
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) chunks.push(el("a:br"));
    const t = parts[i];
    const preserve = t !== t.trim() || t === "" ? ' xml:space="preserve"' : "";
    chunks.push(`<a:r>${rPr}<a:t${preserve}>${esc(t)}</a:t></a:r>`);
  }
  return chunks.join("");
}

/** 构建单个 run（含样式）。hrefId 由外部注册后传入。 */
export function buildRun(theme, run, baseStyle, registerLink) {
  const style = { ...baseStyle, ...pickDefined(run.style) };
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

/** 段落级样式 → a:pPr。base 为段落继承到的样式。 */
function paragraphProps(style) {
  const attrs = {};
  if (style.textAlign && H_ALIGN[style.textAlign]) attrs.algn = H_ALIGN[style.textAlign];
  if (style.marginLeft) attrs.marL = Math.round(style.marginLeft * 12700);
  if (style.marginRight) attrs.marR = Math.round(style.marginRight * 12700);
  const kids = [];
  if (style.lineHeightPx) {
    kids.push(el("a:lnSpc", {}, el("a:spcPts", { val: Math.round(style.lineHeightPx * 100) })));
  } else if (style.lineHeight) {
    kids.push(el("a:lnSpc", {}, el("a:spcPct", { val: Math.round(style.lineHeight * 100000) })));
  }
  if (style.marginTop) {
    kids.push(el("a:spcBef", {}, el("a:spcPts", { val: Math.round(style.marginTop * 100) })));
  }
  if (style.listType === "ul") {
    kids.push(el("a:buFont", { typeface: "Arial" }));
    kids.push(el("a:buChar", { char: "•" }));
    if (!attrs.marL) attrs.marL = Math.round(18 * 12700);
    attrs.indent = Math.round(-18 * 12700);
  } else if (style.listType === "ol") {
    kids.push(el("a:buFont", { typeface: "Arial" }));
    kids.push(el("a:buAutoNum", { type: "arabicPeriod" }));
    if (!attrs.marL) attrs.marL = Math.round(18 * 12700);
    attrs.indent = Math.round(-18 * 12700);
  }
  if (!attrs.algn) attrs.algn = "l";
  return el("a:pPr", attrs, kids.join(""));
}

/**
 * 构建段落 XML（调用方负责注册超链接）。
 * 公式 run（\(...\)）→ a14:m 包装的 m:oMath（PowerPoint 原生行内公式结构）：
 *   - 行内（与其他 run 混排）：<a14:m><m:oMath>…</m:oMath></a14:m>
 *   - 独占段落：<a14:m><m:oMathPara><m:oMathParaPr><m:jc/>…<m:oMath>…</m:oMath></m:oMathPara></a14:m>
 * @param {object} para 富文本段落 { style, listType, runs }
 * @param {object} base 基线样式
 * @param {function} registerLink (url) => rId
 * @param {object} [options] { formulaFallback } 公式降级为纯文本（老 Office Fallback 副本）
 */
export function buildParagraph(theme, para, base, registerLink, options = {}) {
  const style = { ...base, ...pickDefined(para.style) };
  if (para.listType) style.listType = para.listType; // 列表信息传给段落属性（buChar/缩进）
  const onlyFormulas = para.runs.length > 0 && para.runs.every((r) => r.formula);
  const runs = para.runs
    .map((run) =>
      run.formula
        ? buildFormulaRun(theme, run, style, { paraAlone: onlyFormulas, textAlign: style.textAlign, fallback: options.formulaFallback })
        : buildRun(theme, run, style, registerLink)
    )
    .join("");
  if (!runs) return `<a:p>${paragraphProps(style)}</a:p>`;
  return `<a:p>${paragraphProps(style)}${runs}</a:p>`;
}

/**
 * 行内公式 run → a14:m 包装（PowerPoint 原生行内公式存储结构）。
 * 官方规范：公式只继承 color 和 font-size；解析失败/fallback 时降级为 LaTeX 源码文本。
 */
function buildFormulaRun(theme, run, baseStyle, { paraAlone = false, textAlign = null, fallback = false } = {}) {
  const color = run.style?.color || baseStyle.color;
  const fontSize = run.style?.fontSize || baseStyle.fontSize;
  const opacity = baseStyle.opacity; // 元素级透明度（官方：颜色元素内 a:alpha）
  const mml = latexToMathml(run.latex);
  if (!mml || fallback) {
    const rPr = runXml(theme, { ...baseStyle, ...pickDefined(run.style) }, null);
    return `<a:r>${rPr}<a:t>${esc(run.latex)}</a:t></a:r>`;
  }
  // mathmlToOmml 输出已含 <m:oMath> 根（与官方 XSLT 字节一致），命名空间声明在根上
  const omml = mathmlToOmml(mml).replace(/^<m:oMath>/, `<m:oMath xmlns:m="${M_NS}">`);
  const styled = injectRunStyle(omml, { color, fontSize, opacity }, theme);
  if (paraAlone) {
    const jc =
      textAlign === "center" || textAlign === "right"
        ? `<m:oMathParaPr><m:jc m:val="${textAlign}"/></m:oMathParaPr>`
        : "";
    return `<a14:m xmlns:a14="${A14_NS}"><m:oMathPara xmlns:m="${M_NS}">${jc}${styled}</m:oMathPara></a14:m>`;
  }
  return `<a14:m xmlns:a14="${A14_NS}">${styled}</a14:m>`;
}

/** 文本元素 → p:sp XML（txBox + txBody）。
 * spPr 与 PowerPoint 原生文本框一致：xfrm + prstGeom rect + noFill
 * （CT_ShapeProperties 要求必须含几何；缺几何在部分 Office 实现中会
 *  被套上默认填充/边框，导致导出文本框出现莫名色块）。
 */
/** 文本框 → p:sp XML；含公式时按 PowerPoint 原生结构包 mc:AlternateContent
 * （Choice = 公式版，Fallback = 公式降级为 LaTeX 源码文本的老 Office 兼容版）。
 * spPr 与 PowerPoint 原生文本框一致：xfrm + prstGeom rect + noFill
 * （CT_ShapeProperties 要求必须含几何；缺几何在部分 Office 实现中会
 *  被套上默认填充/边框，导致导出文本框出现莫名色块）。
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
  // 元素级透明度（官方 Text.opacity）→ run 级填充 a:alpha（PowerPoint 存储结构）
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
 * 构建完整 txBody。
 * @param {object} content 文本元素 content（text/style/color/fontSize/...）
 * @param {function} registerLink (url) => rId
 * @param {object} [options] { formulaFallback } 公式降级为纯文本（Fallback 副本用）
 */
export function buildTextBody(theme, content, registerLink, options = {}) {
  const tree = parseRichText(content?.text || "");
  const base = computeBaseStyle(theme, content);
  // 元素级透明度（官方 Text.opacity）→ 所有 run 的填充颜色内 a:alpha
  if (options.opacity != null) base.opacity = options.opacity;
  const bodyAttrs = { lIns: 0, tIns: 0, rIns: 0, bIns: 0, wrap: "square" };
  if (content?.wrap === false) bodyAttrs.wrap = "none";
  if (content?.textDirection === "vertical") bodyAttrs.vert = "eaVert";
  // 垂直对齐（官方缺省 [left, top] → anchor "t"）
  const vAlignMap = { top: "t", middle: "ctr", bottom: "b" };
  const v = Array.isArray(content?.align) ? content.align[1] : "top";
  bodyAttrs.anchor = vAlignMap[v] || "t";
  // 自动调整：用 normAutofit（溢出时缩字），不用 spAutoFit。
  // spAutoFit = “调整形状大小以容纳文字”：在 PowerPoint 中一旦点进文本框
  // 编辑，形状会以锚点为中心向两侧暴涨（实测 H 100→1036pt、Top 32→-436pt），
  // 布局被彻底破坏；normAutofit 保持设计框体不变，仅在溢出时等比缩小文字。
  const paras = tree.paragraphs
    .map((p) => buildParagraph(theme, p, base, registerLink, options))
    .join("");
  return el("a:bodyPr", bodyAttrs, el("a:normAutofit")) + el("a:lstStyle") + paras;
}
