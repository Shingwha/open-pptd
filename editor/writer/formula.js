// ============================================================================
// writer/formula.js — 公式元素 → OOXML（PowerPoint 原生可编辑公式）
// ----------------------------------------------------------------------------
// 生成结构与 PowerPoint 手动插入公式完全一致（实测验证）：
//   mc:AlternateContent
//     mc:Choice Requires="a14"
//       p:sp（文本框，txBody 内公式段落：a14:m > m:oMathPara > m:oMath）
//     mc:Fallback
//       p:sp（无公式的文本框副本，老版本 Office 显示）
// 命名空间声明由本块自带（mc/a14/m），slide 根无需改动。
// ============================================================================

import { escAttr } from "./xml.js";
import { latexToMathml } from "../core/latex.js";
import { mathmlToOmml } from "../core/mathml2omml.js";
import { resolveColor } from "../core/theme.js";

const M_NS = "http://schemas.openxmlformats.org/officeDocument/2006/math";
const A14_NS = "http://schemas.microsoft.com/office/drawing/2010/main";
const MC_NS = "http://schemas.openxmlformats.org/markup-compatibility/2006";

/** 半磅字号 → a:defRPr sz（1/100pt）。默认 16pt = 3200。 */
function fontSizeToSz(fontSize) {
  const pt = Number(fontSize) > 0 ? Number(fontSize) : 16;
  return Math.round(pt * 100);
}

/** 给 OMML 每个 m:r 注入颜色（a:rPr > a:solidFill，PPT 官方 run 属性风格）。
 * 支持主题令牌（$primary 等）与 hex，切主题自动联动。 */
function injectColor(omml, color, theme) {
  if (!color) return omml;
  // OOXML 颜色值不允许 # 前缀（#1565C0 → 1565C0）；令牌经 resolveColor 解析
  const resolved = resolveColor(theme, color);
  if (!resolved) return omml;
  const hex = String(resolved).replace(/^#/, "").toUpperCase();
  if (!/^[0-9A-F]{6}$/.test(hex)) return omml; // 非法颜色直接跳过，避免损坏文件
  const fill = `<a:rPr><a:solidFill><a:srgbClr val="${hex}"/></a:solidFill></a:rPr>`;
  // m:r 内：rPr（若有）之后、m:t 之前插入 a:rPr；无 rPr 则插在 <m:r> 后
  return omml.replace(/<m:r>(?:(<m:rPr>[\s\S]*?<\/m:rPr>))?(?=<m:t)/g, (_m, rpr) => {
    return rpr ? `<m:r>${rpr}${fill}` : `<m:r>${fill}`;
  });
}

/** 公式段落：<a:p><a:pPr defRPr/><a14:m><m:oMathPara jc><m:oMath/></m:oMathPara></a14:m></a:p> */
function formulaParagraph(omml, fontSize, align) {
  const sz = fontSizeToSz(fontSize);
  const jc = align === "center" ? "center" : align === "right" ? "right" : "left";
  return (
    `<a:p><a:pPr><a:defRPr sz="${sz}"/></a:pPr>` +
    `<a14:m><m:oMathPara xmlns:m="${M_NS}">` +
    `<m:oMathParaPr><m:jc m:val="${jc}"/></m:oMathParaPr>` +
    `${omml}` +
    `</m:oMathPara></a14:m></a:p>`
  );
}

/** 构造一个 p:sp 文本框（formula 用）；inner = txBody 段落内容。
 * spPr 与普通文本框一致：xfrm + prstGeom rect + noFill；
 * autofit 用 normAutofit（固定框体、溢出缩字），避免 PPT 编辑时 spAutoFit 暴涨。 */
function formulaShape(theme, element, id, inner) {
  const b = element.bounds;
  const x = Math.round(b[0] * 12700);
  const y = Math.round(b[1] * 12700);
  const w = Math.round(b[2] * 12700);
  const h = Math.round(b[3] * 12700);
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${escAttr(element.elementId)}"/>` +
    `<p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>` +
    `<p:txBody><a:bodyPr lIns="0" tIns="0" rIns="0" bIns="0" anchor="ctr"><a:normAutofit/></a:bodyPr>` +
    `<a:lstStyle/>${inner}</p:txBody></p:sp>`
  );
}

/**
 * 公式元素 → <mc:AlternateContent> 块（直接作为 spTree 子元素）。
 * @param {object} element { elementId, bounds, latex, fontSize?, color?, align? }
 */
export function formulaXml(theme, element, ctx) {
  const latex = typeof element.latex === "string" ? element.latex : "";
  // LaTeX → MathML → OMML；任何一步失败则回退：Fallback 显示 LaTeX 源码文本，Choice 不含公式
  let omml = "";
  let fallbackText = "公式渲染失败";
  try {
    const mml = latexToMathml(latex);
    if (mml) {
      omml = mathmlToOmml(mml);
      omml = injectColor(omml, element.color, theme);
      fallbackText = latex;
    } else {
      fallbackText = latex || "公式为空";
    }
  } catch {
    fallbackText = latex || "公式为空";
  }

  const para = omml ? formulaParagraph(omml, element.fontSize, element.align) : "";
  const shapeId = ctx.nextId(); // Choice/Fallback 为同一逻辑 shape，共用 id（与官方一致）
  const choiceShape = formulaShape(theme, element, shapeId, para);
  // Fallback：无公式的文本框（显示 LaTeX 源码，老版本 Office 可读）
  const fallbackInner = `<a:p><a:r><a:t>${escAttr(fallbackText)}</a:t></a:r></a:p>`;
  const fallbackShape = formulaShape(theme, element, shapeId, fallbackInner);

  return (
    `<mc:AlternateContent xmlns:mc="${MC_NS}" xmlns:a14="${A14_NS}" xmlns:m="${M_NS}">` +
    `<mc:Choice Requires="a14">${choiceShape}</mc:Choice>` +
    `<mc:Fallback>${fallbackShape}</mc:Fallback>` +
    `</mc:AlternateContent>`
  );
}
