// ============================================================================
// runtime/index.js — packages/runtime public entry (contract 3.0: open-pptd/runtime)
// ----------------------------------------------------------------------------
// ProjectRuntime: load/parse/resolve/serialize/check + ProjectSource /
// ResourceProvider contracts + unified error types. Pure logic only: no node:,
// no DOM, no sibling package imports except model/measure/layout (dep-graph).
//
// Node adapters (disk source, fs/registry provider) live in
// packages/server/runtime-node.js so this package stays browser-safe.
// ============================================================================

// ---- ProjectSource / ProjectFiles and the pure memory source ----
export {
  loadProject,
  memorySource,
  normalizeProjectFiles,
  normalizeSourceFile,
  isProjectSource,
} from "./source.js";

// ---- ResourceProvider + image format helpers + memory provider ----
export {
  IMAGE_EXTS,
  assertImageFormat,
  canonicalImageExt,
  decodeImageDataUrl,
  imageExtOf,
  imageFormatOfBytes,
  memoryProvider,
} from "./provider.js";

// ---- Parse / project assembly ----
export { parseProject, createProject } from "./parse.js";

// ---- Resolve environment-dependent resources ----
export { resolveProject } from "./resolve.js";

// ---- Serialize (snapshot | raw) ----
export { serializeProject } from "./serialize.js";

// ---- Pure validation ----
export { checkProject } from "./check.js";

// ---- Unified errors + guards ----
export {
  RevisionConflictError,
  ResourceMissingError,
  UnsupportedFormatError,
  assertRevision,
  requireResource,
} from "./errors.js";
