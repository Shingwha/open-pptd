// ============================================================================
// model/escape.js — sole XML escaping / entity decoding (environment-free, browser + Node)
// ----------------------------------------------------------------------------
// All XML string handling in the repo funnels through here (v3 #1: no third
// escaping implementation):
//   - inside model: icon-svg.js / xml-parser.js / mathml2omml.js / richtext.js
//   - writer/xml.js re-exports esc/escAttr from here (writer -> model direction)
// The three escape variants differ on purpose; check the call sites before merging:
//   escText  for text nodes: & < >
//   esc      for text nodes (with quotes): & < > "
//   escAttr  for attribute values: & < " (> left alone, matching PowerPoint output)
// ============================================================================

/** XML text escape (& < >). */
export function escText(value) {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** XML text escape (& < >, plus double quote). */
export function esc(value) {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Attribute value escape (only & < "). */
export function escAttr(value) {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

/**
 * HTML/XML entity decoding (whitelist of known entities + numeric entities;
 * unknown named entities are kept verbatim, so non-entity forms such as the "&"
 * column separator in formula cases are unaffected). &amp; is decoded last to
 * avoid double decoding (&amp;lt; -> &lt; rather than <).
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
