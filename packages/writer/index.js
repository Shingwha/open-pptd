// writer/index.js — packages/writer package barrel (Contract 3.0 entry open-pptd/writer)
// Re-exports only, zero logic. Dual-end package (browser download / Node CLI export), so
// node:* / fs must never appear; pptx.js's document. usage is registered in the dep-graph
// allowlist (browser download helper only).

export { buildPptx, downloadPptx, downloadBlob, magicMatches } from "./pptx.js";
export { ZipWriter } from "./zip.js";
export { imageSize, decodeDataUrl, extToMime, dataUrlOf, safeFileName } from "./util.js";

export * as xml from "./xml.js"; // esc/escAttr/xmlHeader/el/hexToRgbVal/angleToOOXML
export * as parts from "./parts.js"; // part assembly (presentation/theme/rels/content-types…)
export * as text from "./text.js"; // text-body construction (buildRun/buildParagraph/buildTextBody…)
