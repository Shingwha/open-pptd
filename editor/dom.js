// ============================================================================
// dom.js — editor skeleton element refs (the single entry for editor/index.html static ids)
// ----------------------------------------------------------------------------
// Modules no longer each call document.getElementById("..."); they go through
// dom.xxx (lazy lookup + cache: skeleton elements are never replaced after
// creation, so caching is safe). The id contract is in editor/index.html; register
// new static skeleton elements here.
//
// createDom(rootEl) factory: lookups prefer the rootEl subtree and fall back to
// document (a transition design — the static skeleton is still in the document,
// while an embedded mount point may be an empty container). The default instance
// `dom` is still a module-level singleton (same named export), so unmigrated call
// sites keep working; createEditor binds the default instance to its own mount
// point via dom.rebind(rootEl), and restores it with dom.rebind(document) on destroy.
// ============================================================================

/** Property name → index.html element id. */
const IDS = {
  stage: "stage",
  canvas: "canvas",
  canvasWrap: "canvas-wrap",
  canvasLoading: "canvas-loading",
  quickbar: "quickbar",
  props: "props",
  inspectorBadge: "inspector-badge",
  inspectorTitle: "inspector-title",
  inspectorMask: "inspector-mask",
  pageThumbs: "page-thumbs",
  pageCount: "page-count",
  addMenu: "add-menu",
  zoomCtl: "zoom-ctl",
  zoomLabel: "zoom-label",
  brandFile: "brand-file",
  tbStatus: "tb-status",
  statusHint: "status-hint",
  statusDirty: "status-dirty",
  btnReload: "btn-reload",
  btnAdd: "btn-add",
  btnFile: "btn-file",
  btnAddPage: "btn-add-page",
  btnUndo: "btn-undo",
  btnRedo: "btn-redo",
  btnFonts: "btn-fonts",
  btnTheme: "btn-theme",
  btnPresent: "btn-present",
  btnInspectorToggle: "btn-inspector-toggle",
  btnInspectorOpen: "btn-inspector-open",
  btnZoomOut: "btn-zoom-out",
  btnZoomIn: "btn-zoom-in",
  btnZoomReset: "btn-zoom-reset",
};

/**
 * Build a dom ref factory scoped to rootEl.
 * @param {HTMLElement|Document} [rootEl] scope (document by default)
 */
export function createDom(rootEl) {
  const cache = new Map();
  let scope = rootEl || document;

  /** Look up an element by id (rootEl subtree first, then document; cached after the first lookup). */
  function byId(id) {
    if (cache.has(id)) return cache.get(id);
    let el = null;
    if (scope && typeof scope.querySelector === "function") {
      try {
        el = scope.querySelector(`#${CSS.escape(id)}`);
      } catch {
        el = null;
      }
    }
    if (!el && typeof document !== "undefined") el = document.getElementById(id);
    cache.set(id, el);
    return el;
  }

  const dom = Object.defineProperties(
    {},
    Object.fromEntries(Object.entries(IDS).map(([name, id]) => [name, { get: () => byId(id), enumerable: true }]))
  );
  /** Switch scope and clear the cache (createEditor mount / destroy restore). */
  dom.rebind = (next) => {
    cache.clear();
    scope = next || document;
  };
  /** Clear the cache (used by destroy). */
  dom.clear = () => cache.clear();
  return dom;
}

/** Default instance (module-level singleton; unmigrated call sites keep working). */
export const dom = createDom(typeof document !== "undefined" ? document : null);
