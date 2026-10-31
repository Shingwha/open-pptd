// ============================================================================
// interaction/design-panel-lazy.js — lazy Design panel entry, one per instance
// ----------------------------------------------------------------------------
// The Design panel (theme library / font library / appearance) is a large,
// browser-only module. It is imported on first use so the editor boot, the
// headless paint path and the e2e render path never load it (W7 gate).
// This tiny module is the only static reference: it keeps the dynamic import and
// the per-instance service handle (createDesignPanel lazily builds the closure
// with its own panel DOM/state), so two editors never share one drawer.
// ============================================================================

/**
 * Build the lazy Design panel service of one instance.
 * @param {object} ui instance context (dom / toast / dialogs / isActive)
 * @returns {{ open(opts): Promise<void>, destroy(): void }}
 */
export function createDesignPanelService(ui) {
  let service = null;

  return {
    /** Open the Design panel (loads design-panel.js on first call). */
    async open(opts) {
      if (!service) {
        const mod = await import("./design-panel.js");
        service = mod.createDesignPanel(ui);
      }
      return service.open(opts);
    },

    /** Close/destroy this instance's panel when it has been loaded (no-op before first open). */
    destroy() {
      try {
        service?.close();
      } finally {
        service = null;
      }
    },
  };
}
