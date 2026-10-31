// ============================================================================
// packages/index.js — open-pptd package root entry (contract entry open-pptd)
// ----------------------------------------------------------------------------
// Contract 3.0: the root entry exports **dual-end core** only
// (model / renderer / writer / runtime / export / paths / config / measure / layout).
// Node-only faces moved to sub-entries: `open-pptd/server` and `open-pptd/cli`
// (contract.json + tests/contract/public-api.mjs are the machine-checked source
// of truth for the export surface).
//
// Red line: this file must not import editor/ (dependency direction is editor → packages only, see dep-graph).
// Browser hosts must import `open-pptd/model` / `open-pptd/renderer` / `open-pptd/writer` /
// `open-pptd/runtime` / `open-pptd/export` (the root also pulls node:-backed paths/config).
// ============================================================================

/** Package-level contract version (contract 3.0). Downstream fails fast on it. */
export const CONTRACT_VERSION = 3;

export * from "./model/index.js";
export * from "./renderer/index.js";
export * from "./writer/index.js";
export * from "./runtime/index.js";
export * from "./export/index.js";
export * from "./paths.js";
export * from "./config.js";

// measure goes through a namespace and layout exports the function directly
// (both barrels also carry a `default` export, so `export *` would collide).
export * as measure from "./measure/index.js";
export { default as layout } from "./layout/index.js";
