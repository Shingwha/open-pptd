// ============================================================================
// text.js — 富文本树 → OOXML a:p 序列化（文字、表格单元格、图表文字共用）
// ----------------------------------------------------------------------------
// 继承链（PPTD 规范）：inline run 样式 > 段落样式 > content 字段 > $style > 默认。
// 字体统一 resolveFont 到 {latin, ea}；颜色 token → schemeClr（可换主题）。
// ============================================================================

import { esc, escAttr, el } from "./xml.js";
import { parseRichText } from "../core/richtext.js";
import { resolveFont } from "../core/theme.js";
import { computeBaseStyle, pickDefined } from "../core/style.js";
import { colorElement, solidFillElement, buildXfrm } from "./drawing.js";

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
  // OOXML rPr 子元素顺序：fill 组 → highlight → latin/ea/cs → hlinkClick
  const fill = solidFillElement(theme, s.color);
  if (fill) kids.push(fill);
  if (s.backgroundColor) {
    kids.push(el("a:highlight", {}, el("a:solidFill", {}, colorElement(theme, s.backgroundColor))));
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
 * @param {object} para 富文本段落 { style, listType, runs }
 * @param {object} base 基线样式
 * @param {function} registerLink (url) => rId
 */
export function buildParagraph(theme, para, base, registerLink) {
  const style = { ...base, ...pickDefined(para.style) };
  if (para.listType) style.listType = para.listType; // 列表信息传给段落属性（buChar/缩进）
  const runs = para.runs
    .map((run) => buildRun(theme, run, style, registerLink))
    .join("");
  if (!runs) return `<a:p>${paragraphProps(style)}</a:p>`;
  return `<a:p>${paragraphProps(style)}${runs}</a:p>`;
}

/** 文本元素 → p:sp XML（txBox + txBody）。
 * spPr 与 PowerPoint 原生文本框一致：xfrm + prstGeom rect + noFill
 * （CT_ShapeProperties 要求必须含几何；缺几何在部分 Office 实现中会
 *  被套上默认填充/边框，导致导出文本框出现莫名色块）。
 */
export function textXml(theme, element, ctx) {
  const b = element.bounds;
  const spPr =
    buildXfrm(b, element.rotation) +
    el("a:prstGeom", { prst: "rect" }, el("a:avLst")) +
    el("a:noFill");
  const body = buildTextBody(theme, element.content, ctx.registerLink);
  return (
    el("p:sp", {}, [
      el("p:nvSpPr", {}, [
        el("p:cNvPr", { id: ctx.nextId(), name: escAttr(element.elementId) }),
        el("p:cNvSpPr", { txBox: "1" }),
        el("p:nvPr"),
      ]),
      el("p:spPr", {}, spPr),
      el("p:txBody", {}, body),
    ].join(""))
  );
}

/**
 * 构建完整 txBody。
 * @param {object} content 文本元素 content（text/style/color/fontSize/...）
 * @param {function} registerLink (url) => rId
 */
export function buildTextBody(theme, content, registerLink) {
  const tree = parseRichText(content?.text || "");
  const base = computeBaseStyle(theme, content);
  const bodyAttrs = { lIns: 0, tIns: 0, rIns: 0, bIns: 0, wrap: "square" };
  if (content?.wrap === false) bodyAttrs.wrap = "none";
  if (content?.textDirection === "vertical") bodyAttrs.vert = "eaVert";
  // 垂直对齐：与预览一致（缺省 middle，避免导出文字顶对齐“偏上”）
  const vAlignMap = { top: "t", middle: "ctr", bottom: "b" };
  const v = Array.isArray(content?.align) ? content.align[1] : "middle";
  bodyAttrs.anchor = vAlignMap[v] || "ctr";
  // 自动调整：用 normAutofit（溢出时缩字），不用 spAutoFit。
  // spAutoFit = “调整形状大小以容纳文字”：在 PowerPoint 中一旦点进文本框
  // 编辑，形状会以锚点为中心向两侧暴涨（实测 H 100→1036pt、Top 32→-436pt），
  // 布局被彻底破坏；normAutofit 保持设计框体不变，仅在溢出时等比缩小文字。
  const paras = tree.paragraphs
    .map((p) => buildParagraph(theme, p, base, registerLink))
    .join("");
  return el("a:bodyPr", bodyAttrs, el("a:normAutofit")) + el("a:lstStyle") + paras;
}
