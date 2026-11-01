// editor/interaction/design-panel-lazy.js — lazy Design panel entry, one per instance
// design-panel.js is large and browser-only, so it is imported on first use: editor
// boot, headless paint and e2e render never load it. This is the only static
// reference; the per-instance service keeps two editors from sharing a drawer.

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
