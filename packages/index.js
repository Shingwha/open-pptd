// packages/index.js — open-pptd package root entry (Contract 3.0 entry open-pptd)
// Exports the dual-end core only (model / renderer / writer / runtime / export / paths /
// config / measure / layout); Node-only faces live in the `open-pptd/server` and
// `open-pptd/cli` sub-entries. contract.json is the machine-checked surface.
// Must not import editor/ (dependency direction is editor → packages). Browser hosts
// import the sub-entries, since the root also pulls node:-backed paths/config.

/** Package-level contract version (currently 3). Downstream fails fast on it. */
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
