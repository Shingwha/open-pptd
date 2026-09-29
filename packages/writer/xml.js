// ============================================================================
// xml.js — XML generation helpers
// ----------------------------------------------------------------------------
// esc/escAttr escaping has a single repository-wide implementation (packages/model/escape.js;
// a third copy is forbidden), so this re-export keeps writer-side import paths stable.
// ============================================================================

import { esc, escAttr } from "../model/escape.js";

export { esc, escAttr };

/** Build the XML declaration header. */
export function xmlHeader(standalone = true) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="${standalone ? "yes" : "no"}"?>`;
}

/**
 * Convenience element builder: el("a:solidFill", {}, [el("a:srgbClr", {val:"2563EB"})]).
 * attrs is an object; children is a string array or a string.
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

/** Color #RRGGBB → srgbClr val (uppercase, without #). */
export function hexToRgbVal(hex) {
  if (!hex) return "000000";
  let h = String(hex).replace("#", "");
  if (h.length === 8) h = h.slice(0, 6); // drop alpha (OOXML srgbClr has none)
  return h.toUpperCase();
}

/** Angle (degrees) → OOXML 60000-unit value. */
export function angleToOOXML(deg) {
  return Math.round(deg * 60000);
}
