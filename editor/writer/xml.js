// ============================================================================
// xml.js — XML 生成工具
// ============================================================================

/** XML 文本转义。 */
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

/** 生成 XML 声明头。 */
export function xmlHeader(standalone = true) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="${standalone ? "yes" : "no"}"?>`;
}

/**
 * 便捷元素构造：el("a:solidFill", {}, [el("a:srgbClr", {val:"2563EB"})])
 * attrs 为对象，children 为字符串数组或字符串。
 */
export function el(name, attrs = {}, children = "") {
  const attrStr = Object.entries(attrs)
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => ` ${k}="${escAttr(v)}"`)
    .join("");
  const kids = Array.isArray(children) ? children.join("") : children;
  if (kids == null || kids === "") return `<${name}${attrStr}/>`;
  return `<${name}${attrStr}>${kids}</${name}>`;
}

/** 颜色 #RRGGBB → srgbClr 的 val（大写、去 #）。 */
export function hexToRgbVal(hex) {
  if (!hex) return "000000";
  let h = String(hex).replace("#", "");
  if (h.length === 8) h = h.slice(0, 6); // 丢弃 alpha（OOXML srgbClr 无 alpha）
  return h.toUpperCase();
}

/** 角度（度）→ OOXML 60000 单位。 */
export function angleToOOXML(deg) {
  return Math.round(deg * 60000);
}
