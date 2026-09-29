// ============================================================================
// packages/index.js — open-pptd 包根入口（契约 4 入口 open-pptd）
// ----------------------------------------------------------------------------
// 再导出五个子入口的全部公开名（契约 4）+ 契约版本号。
//
// 红线：本文件不得 import editor/（依赖方向只允许 editor → packages，见 dep-graph）。
// 注意：因再导出 server/cli（Node 专用，依赖 node:http/node:fs），**本根入口不可在
// 浏览器中 import**；浏览器侧请用 open-pptd/model、open-pptd/renderer、open-pptd/writer。
// ============================================================================

/** 包级契约版本（契约 4）。下游据此 fail-fast，见 docs/embedding.md。 */
export const CONTRACT_VERSION = 2;

export * from "./model/index.js";
export * from "./renderer/index.js";
export * from "./writer/index.js";
export * from "./server/index.js";
export * from "./cli/index.js";
export * from "./paths.js";
export * from "./config.js";
