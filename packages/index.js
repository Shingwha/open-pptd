// ============================================================================
// packages/index.js — open-pptd package root entry (contract entry open-pptd)
// ----------------------------------------------------------------------------
// Re-exports every public name of the five sub-entries (contract 4) plus the contract version.
//
// Red line: this file must not import editor/ (dependency direction is editor → packages only, see dep-graph).
// Note: because it re-exports server/cli (Node-only, depending on node:http/node:fs), **this root
// entry cannot be imported in a browser**; use open-pptd/model, open-pptd/renderer, open-pptd/writer
// on the browser side.
// ============================================================================

/** Package-level contract version (contract 4). Downstream fails fast on it, see docs/embedding.md. */
export const CONTRACT_VERSION = 2;

export * from "./model/index.js";
export * from "./renderer/index.js";
export * from "./writer/index.js";
export * from "./server/index.js";
export * from "./cli/index.js";
export * from "./paths.js";
export * from "./config.js";

// ---- New three-stage render-pipeline entries (spec 09 T5; purely additive exports, contract stays 2) ----
// measure goes through a namespace (to avoid a potential clash with existing flat export names); layout directly exports the function.
export * as measure from "./measure/index.js";
export { default as layout } from "./layout/index.js";
