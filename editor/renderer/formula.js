// ============================================================================
// renderer/formula.js — 公式元素 → DOM（浏览器原生 MathML 渲染）
// ----------------------------------------------------------------------------
// 链路：LaTeX → vendored KaTeX（MathML）→ 塞 DOM。
// 现代浏览器（Edge/Chrome 109+）原生渲染 MathML，零依赖。
// 公式解析失败时回退显示 LaTeX 源码（带浅色底纹提示）。
// ============================================================================

import { latexToMathml } from "../core/latex.js";

export function renderFormula(theme, el) {
  const [x, y, w, h] = el.bounds;
  const box = document.createElement("div");
  box.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;overflow:hidden;`;
  box.dataset.elementId = el.elementId;
  box.dataset.elementType = "formula";
  if (el.rotation) box.style.transform = `rotate(${el.rotation}deg)`;
  if (el.opacity != null) box.style.opacity = el.opacity;

  const inner = document.createElement("div");
  inner.style.cssText =
    "width:100%;height:100%;display:flex;align-items:center;" +
    (el.align === "center" ? "justify-content:center;" : el.align === "right" ? "justify-content:flex-end;" : "justify-content:flex-start;");
  const fontSize = Number(el.fontSize) > 0 ? Number(el.fontSize) : 16;
  inner.style.fontSize = `${fontSize}px`;

  const mml = latexToMathml(el.latex);
  if (mml) {
    // KaTeX 输出 <span class="katex"><math>…</math></span>，直接插入由浏览器原生渲染
    inner.innerHTML = mml;
    const math = inner.querySelector("math");
    if (math) {
      if (el.color) math.style.color = el.color;
      // MathML 原生渲染的数学字体偏好（缺省浏览器数学字体）
      math.style.fontFamily = "'Cambria Math','STIX Two Math','Latin Modern Math',math";
    }
  } else {
    inner.textContent = el.latex || "（空公式）";
    inner.style.background = "#FFF3E0";
    inner.style.color = "#E65100";
    inner.style.fontSize = "12px";
    inner.style.padding = "2px 6px";
    inner.style.borderRadius = "3px";
  }
  box.appendChild(inner);
  return box;
}
