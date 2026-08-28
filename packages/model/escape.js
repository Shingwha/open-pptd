// ============================================================================
// model/escape.js — XML 转义 / 实体解码唯一实现（双端纯净，无任何环境依赖）
// ----------------------------------------------------------------------------
// 全仓 XML 字符串处理统一收口于此（v3 #1：禁止第三份转义实现）：
//   - model 内：icon-svg.js / xml-parser.js / mathml2omml.js / richtext.js
//   - writer/xml.js 的 esc/escAttr 从这里 re-export（writer → model 方向合规）
// 三个转义变体的差异是有意的，合并前先看调用点：
//   escText  文本节点用：& < >
//   esc      文本节点用（含引号）：& < > "
//   escAttr  属性值用：& < "（不转 >，与 PowerPoint 输出习惯一致）
// ============================================================================

/** XML 文本转义（& < >）。 */
export function escText(value) {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** XML 文本转义（& < >，含双引号）。 */
export function esc(value) {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 属性值转义（只转义 & < "）。 */
export function escAttr(value) {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

/**
 * HTML/XML 实体解码（已知实体白名单 + 数字实体；未知名义实体原样保留，
 * 公式里 cases 的 & 列分隔符等非实体形式不受影响）。
 * &amp; 最后解码，避免双重解码（&amp;lt; → &lt; 而不是 <）。
 */
export function decodeEntities(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}
