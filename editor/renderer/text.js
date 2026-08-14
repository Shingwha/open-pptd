// ============================================================================
// renderer/text.js — 富文本 → DOM（与 writer/text.js 同一继承链）
// ----------------------------------------------------------------------------
// 继承链：content 基础样式 → 容器层（root）→ 段落（显式差异）→ run（显式差异）
// 关键：基础样式只写一次（容器层继承），span/段落内联样式只保留"显式差异"。
//
// 官方默认值（TextContent）：color #000000 / fontSize 18 / fontFamily Microsoft YaHei /
// lineHeight 1 / align [left, top]。渲染端补齐浏览器 CSS 与 PPT 默认的差异。
// 公式（\(...\)）：只继承 color / font-size（官方规范），KaTeX → MathML 原生渲染。
// ============================================================================

import { parseRichText } from "../core/richtext.js";
import { computeBaseStyle } from "../core/style.js";
import { latexToMathml } from "../core/latex.js";
import { resolveColor, resolveFont } from "../core/theme.js";
import { createElementShell } from "./shell.js";

const DEFAULT_FONT_SIZE = 18;
const DEFAULT_LINE_HEIGHT = 1;

/** 文字渐变 → CSS linear-gradient 声明（官方 GradientFill：angle 0°=左→右，顺时针）。 */
function gradientCss(theme, gradient) {
  if (!gradient || gradient.gradientType === "radial" || !Array.isArray(gradient.stops) || gradient.stops.length < 2) return null;
  const angle = Number(gradient.angle) || 0;
  const stops = gradient.stops
    .map((s) => `${resolveColor(theme, s.color) || s.color} ${Math.round((s.position ?? 0) * 100)}%`)
    .join(", ");
  return `linear-gradient(${angle}deg, ${stops})`;
}

/** 文字阴影 → CSS text-shadow（offset [x,y] 向下为正，与 OOXML dist/dir 同向）。 */
function shadowCss(theme, shadow) {
  if (!shadow) return null;
  const [dx = 0, dy = 0] = shadow.offset || [];
  const color = resolveColor(theme, shadow.color) || shadow.color;
  return `${dx}px ${dy}px ${shadow.blur || 0}px ${color}`;
}

/** run 层：只写 run 显式设置的样式（相对 base 的差异）。公式 run → KaTeX MathML。 */
export function runSpan(theme, run, base) {
  if (run.formula) return formulaSpan(theme, run, base);
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

/**
 * 公式 run → 内联 span（KaTeX MathML，浏览器原生渲染）。
 * 官方规范：公式只继承 color 和 font-size（run.style 中已由解析器提取上下文值）。
 * 解析失败回退显示 LaTeX 源码（浅色底纹提示）。
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

/** 水平对齐 → CSS 值：distributed 无原生 CSS 等价，映射为 justify + 末行拉伸。 */
function textAlignCss(v) {
  if (v === "distributed") return "justify;text-align-last:justify";
  return v; // left / center / right / justify
}

/** 段落层：只写段落显式样式（text-align / line-height / margin…）。 */
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
  // —— content 基础样式 → 容器层（一次，继承）；未设置时补齐官方默认值 ——
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
  // 文字渐变：作用于文字本身（background-clip: text），与 color 互斥
  const grad = gradientCss(theme, base.gradient);
  if (grad) {
    css.push(`background:${grad}`);
    css.push("-webkit-background-clip:text;background-clip:text;color:transparent");
  }
  // 文字阴影
  const shadow = shadowCss(theme, base.shadow);
  if (shadow) css.push(`text-shadow:${shadow}`);
  // 垂直文字 / 不换行（官方 textDirection / wrap）
  if (content?.textDirection === "vertical") css.push("writing-mode:vertical-rl;text-orientation:upright");
  if (content?.wrap === false) css.push("white-space:pre;overflow:visible");
  // 垂直对齐（官方缺省 top；middle/bottom 用 flex 撑开）
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

/** 文本元素 → 定位 DOM（定位 / 变换 / 标记统一走 renderer/shell.js）。 */
export function renderText(theme, el) {
  const box = createElementShell(el);
  box.appendChild(renderTextContent(theme, el.content));
  return box;
}
