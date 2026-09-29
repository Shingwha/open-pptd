// ============================================================================
// editor/index.js — editor package barrel (contract 4 entry `open-pptd/editor`)
// ----------------------------------------------------------------------------
// Pure re-exports, zero logic: downstream mounts/controls the editor through this
// entry and is unaware of the internal file layout. The full createEditor
// signature is in docs/embedding.md (contracts 1/2/3).
// Red line: this file is browser-only (depends on DOM); Node consumers must not
// import this entry.
// ============================================================================

// ---- mountable editor (contract 1) ----
export { createEditor } from "./editor.js";

// ---- theme injection (contract 3) ----
// Includes the tri-state theme mode (light / dark / follow system, B3): the host
// may manage it via bindThemeMode, or keep injecting a mode override through
// applyThemeTokens (injection wins over the built-in palette).
export {
  TOKENS,
  defaultTokens,
  applyThemeTokens,
  getThemeMode,
  setThemeMode,
  bindThemeMode,
  systemTheme,
  THEME_MODES,
  THEME_MODE_KEY,
} from "./theme.js";

// ---- transport seam (contract 2: three ProjectSource impls + in-memory facade) ----
export {
  httpSource,
  directoryHandleSource,
  memorySource,
  delegatingSource,
} from "./app/project/source.js";
