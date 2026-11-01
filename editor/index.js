// editor/index.js — editor package barrel (`open-pptd/editor`)
// Pure re-exports, zero logic: mountable components (createPreview / createEditor),
// theme token injection + tri-state mode, and the ProjectSource transport seam.
// Browser-only (DOM dependency); Node consumers must not import this entry.

// mountable components: read-only viewer and the preview core + editing layer
export { createPreview } from "./preview.js";
export { createEditor } from "./editor.js";

// theme injection (applyThemeTokens / defaultTokens) + tri-state mode binding
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

// transport seam: three ProjectSource implementations + in-memory facade
export {
  httpSource,
  directoryHandleSource,
  memorySource,
  delegatingSource,
} from "./app/project/source.js";
