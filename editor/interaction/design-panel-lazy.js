// ============================================================================
// interaction/design-panel-lazy.js — lazy entry for the Design panel
// ----------------------------------------------------------------------------
// The Design panel (theme library / font library / appearance) is a large,
// browser-only module. It is imported on first use so the editor boot, the
// headless/shot assembly and the e2e paint path never load it (W7 gate).
// This tiny module is the only static reference: it keeps the dynamic import and
// one close handle for createEditor's destroy.
// ============================================================================

let closeFn = null;

/**
 * Open the Design panel (loads design-panel.js on first call).
 * @param {object} opts { state, api, io, themeMode, tab? }
 */
export async function openDesignPanel(opts) {
  const mod = await import("./design-panel.js");
  closeFn = mod.closeDesignPanel;
  return mod.openDesignPanel(opts);
}

/** Close/destroy the panel when it has been loaded (no-op before first open). */
export function destroyDesignPanel() {
  try {
    closeFn?.();
  } finally {
    closeFn = null;
  }
}
