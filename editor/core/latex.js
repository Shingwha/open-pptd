// ============================================================================
// latex.js — LaTeX → MathML 封装（vendored KaTeX，仅 MathML 输出模式）
// ----------------------------------------------------------------------------
// 公式组件的单一事实来源：PPTD 里写 latex，运行时刻转换：
//   - 预览（浏览器）：MathML 塞 DOM，浏览器原生渲染（Edge/Chrome 109+）
//   - 导出（Node）：MathML → mathml2omml → OMML 注入 PPTX
// KaTeX 的 MathML 输出模式不需要 css/字体文件（270KB 单文件，无 npm 依赖）。
// ============================================================================

import katex from "../vendor/katex.mjs";

const KATEX_OPTIONS = {
  output: "mathml",
  throwOnError: false, // 公式写错不抛异常：预览回退显示源码，导出回退纯文本
  strict: false,
};

/** LaTeX → MathML 字符串（含 <span class="katex"> 包装）。失败返回 null。 */
export function latexToMathml(latex) {
  if (typeof latex !== "string" || !latex.trim()) return null;
  try {
    return katex.renderToString(latex, KATEX_OPTIONS);
  } catch {
    return null;
  }
}
