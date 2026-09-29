// ============================================================================
// writer/index.js — packages/writer 包级 barrel（契约 4 入口 open-pptd/writer）
// ----------------------------------------------------------------------------
// 纯再导出，零逻辑。双端包（浏览器下载 / Node 命令行导出），不得出现 node:* / fs。
// 注：pptx.js 内的 document. 用法已由 dep-graph ALLOWLIST 登记（仅浏览器下载助手）。
// ============================================================================

// ---- PPTX 装配与下载（pptx.js）----
export { buildPptx, downloadPptx, downloadBlob, magicMatches } from "./pptx.js";

// ---- ZIP 写入器（zip.js）----
export { ZipWriter } from "./zip.js";

// ---- 通用工具（util.js：dataUrl/图片尺寸/文件名）----
export { imageSize, decodeDataUrl, extToMime, dataUrlOf, safeFileName } from "./util.js";

// ---- 命名空间：OOXML 片段工具 ----
export * as xml from "./xml.js"; // esc/escAttr/xmlHeader/el/hexToRgbVal/angleToOOXML
export * as parts from "./parts.js"; // 部件装配（presentation/theme/rels/content-types…）
export * as text from "./text.js"; // 文本体构建（buildRun/buildParagraph/buildTextBody…）
