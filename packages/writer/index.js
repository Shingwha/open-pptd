// ============================================================================
// writer/index.js — packages/writer package barrel (contract-4 entry open-pptd/writer)
// ----------------------------------------------------------------------------
// Re-exports only, zero logic. Dual-end package (browser download / Node CLI export), so
// node:* / fs must never appear. Note: the document. usage in pptx.js is registered in the
// dep-graph ALLOWLIST (browser download helper only).
// ============================================================================

// ---- PPTX assembly and download (pptx.js) ----
export { buildPptx, downloadPptx, downloadBlob, magicMatches } from "./pptx.js";

// ---- ZIP writer (zip.js) ----
export { ZipWriter } from "./zip.js";

// ---- Shared helpers (util.js: dataUrl / image size / filename) ----
export { imageSize, decodeDataUrl, extToMime, dataUrlOf, safeFileName } from "./util.js";

// ---- Namespaces: OOXML fragment helpers ----
export * as xml from "./xml.js"; // esc/escAttr/xmlHeader/el/hexToRgbVal/angleToOOXML
export * as parts from "./parts.js"; // part assembly (presentation/theme/rels/content-types…)
export * as text from "./text.js"; // text-body construction (buildRun/buildParagraph/buildTextBody…)
