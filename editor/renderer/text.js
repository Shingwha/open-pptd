// ============================================================================
// renderer/text.js — 富文本 → DOM（与 writer/text.js 同一继承链）
// ----------------------------------------------------------------------------
// 继承链：content 基础样式 → 容器层（root）→ 段落（显式差异）→ run（显式差异）
// 关键：基础样式只写一次（容器层继承），span/段落内联样式只保留"显式差异"，
//       避免双击编辑时 domToRichText 把烘焙样式反解析回模型。
// ============================================================================

import { parseRichText } from "../core/richtext.js";
import { computeBaseStyle } from "../core/style.js";
import { resolveColor, resolveFont } from "../core/theme.js";

/** run 层：只写 run 显式设置的样式（相对 base 的差异）。 */
function runSpan(theme, run, base) {
  const s = run.style || {};
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

/** 段落层：只写段落显式样式（text-align / line-height / margin…）。 */
function applyParaStyle(el, para) {
  const s = para.style || {};
  const css = [];
  if (s.textAlign) css.push(`text-align:${s.textAlign}`);
  if (s.lineHeightPx) css.push(`line-height:${s.lineHeightPx}px`);
  else if (s.lineHeight) css.push(`line-height:${s.lineHeight}`);
  if (s.marginTop) css.push(`margin-top:${s.marginTop}px`);
  if (s.marginLeft) css.push(`margin-left:${s.marginLeft}px`);
  if (s.marginRight) css.push(`margin-right:${s.marginRight}px`);
  if (s.letterSpacing != null) css.push(`letter-spacing:${s.letterSpacing}px`);
  el.style.cssText = css.join(";");
}

/**
 * 渲染富文本元素内容 → 容器 DOM（宽高 100%）。
 * 基础样式（字号/颜色/加粗/字族/行高等）写在本容器上，由段落/run 继承。
 * @param {object} theme 规范化主题
 * @param {object} content 文本元素 content
 * @returns {HTMLElement}
 */
export function renderTextContent(theme, content) {
  const tree = parseRichText(content?.text || "");
  const base = computeBaseStyle(theme, content);

  const root = document.createElement("div");
  const css = ["width:100%;height:100%;box-sizing:border-box;overflow:hidden;white-space:pre-line"];
  // —— content 基础样式 → 容器层（一次，继承）——
  if (base.fontSize) css.push(`font-size:${base.fontSize}px`);
  const color = resolveColor(theme, base.color);
  if (color) css.push(`color:${color}`);
  if (base.bold) css.push("font-weight:bold");
  if (base.italic) css.push("font-style:italic");
  const deco = [];
  if (base.underline) deco.push("underline");
  if (deco.length) css.push(`text-decoration:${deco.join(" ")}`);
  if (base.lineHeightPx) css.push(`line-height:${base.lineHeightPx}px`);
  else if (base.lineHeight) css.push(`line-height:${base.lineHeight}`);
  if (base.letterSpacing != null) css.push(`letter-spacing:${base.letterSpacing}px`);
  const font = resolveFont(theme, base.fontFamily);
  css.push(`font-family:"${font.latin}","${font.ea}",sans-serif`);
  if (base.backgroundColor) {
    const bg = resolveColor(theme, base.backgroundColor);
    if (bg) css.push(`background:${bg}`);
  }
  if (base.textAlign) css.push(`text-align:${base.textAlign}`);
  const vAlign = Array.isArray(content?.align) ? content.align[1] : "middle";
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
        listBuffer.style.cssText = "margin:0;padding-left:22px;";
        root.appendChild(listBuffer);
      }
      const li = document.createElement("li");
      applyParaStyle(li, para);
      for (const run of para.runs) li.appendChild(runSpan(theme, run, base));
      listBuffer.appendChild(li);
    } else {
      listBuffer = null;
      const p = document.createElement("div");
      applyParaStyle(p, para);
      for (const run of para.runs) p.appendChild(runSpan(theme, run, base));
      root.appendChild(p);
    }
  }
  return root;
}

/** 文本元素 → 定位 DOM（含 bounds）。 */
export function renderText(theme, el) {
  const [x, y, w, h] = el.bounds;
  const box = document.createElement("div");
  box.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;overflow:hidden;`;
  box.dataset.elementId = el.elementId;
  box.dataset.elementType = "text";
  if (el.rotation) box.style.transform = `rotate(${el.rotation}deg)`;
  if (el.opacity != null) box.style.opacity = el.opacity;
  box.appendChild(renderTextContent(theme, el.content));
  return box;
}
