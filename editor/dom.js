// ============================================================================
// dom.js — static skeleton element registry (the single entry for editor/index.html)
// ----------------------------------------------------------------------------
// Editor modules never call document.getElementById/querySelector for
// editor/index.html skeleton elements; they read dom.<name> (or, for regions that
// carry no id of their own, dom.query(selector)).
// Lookups are lazy (first access) and cached: the skeleton is authored once by
// editor/index.html and never replaced, so caching is safe. The authoritative id
// contract is editor/index.html; register new skeleton elements here.
//
// Scope and the one fallback: createEditor mounts on #pptd-root, which in
// editor/index.html is an empty container while the skeleton is a sibling in
// <body>. Every lookup therefore resolves "mount subtree first, document
// fallback", and that fallback policy lives ONLY here (byId / query) — no module
// carries its own equivalent.
//
// The skeleton deliberately stays a <body>-level sibling of #pptd-root: nesting
// it inside the mount point would change three observable things at once — the
// .icon-slot[data-icon] set that injectIcons() replaces within createEditor's
// scope, the contract-3 theme injection host chosen by createEditor, and the
// element destroy() clears.
//
// createDom(rootEl) factory: an embedded host that owns its skeleton inside its
// container gets its own instance; the default `dom` singleton is rebound by
// createEditor to its mount point and restored to document on destroy.
// ============================================================================

/** Property name → editor/index.html element id (the id contract). */
const IDS = {
  pptdRoot: "pptd-root",
  editorApp: "editor-app",
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

/** document.getElementById when available (document), a scoped query otherwise (element). */
function findById(scope, id) {
  return typeof scope.getElementById === "function" ? scope.getElementById(id) : scope.querySelector(`#${CSS.escape(id)}`);
}

/**
 * Build a dom ref factory scoped to rootEl.
 * @param {HTMLElement|Document} [rootEl] scope (document by default)
 */
export function createDom(rootEl) {
  const cache = new Map();
  let scope = rootEl || document;

  /** Cached scope-first lookup with the document fallback (the single copy of that policy). */
  function resolve(key, find) {
    if (cache.has(key)) return cache.get(key);
    let el = null;
    if (scope && typeof scope.querySelector === "function") {
      try {
        el = find(scope);
      } catch {
        el = null;
      }
    }
    if (!el && typeof document !== "undefined") el = find(document);
    cache.set(key, el);
    return el;
  }

  /** Resolve a skeleton element by id (mount subtree first, then document). */
  const byId = (id) => resolve(`id:${id}`, (r) => findById(r, id));
  /** Resolve a skeleton region by CSS selector (mount subtree first, then document). */
  const query = (selector) => resolve(`sel:${selector}`, (r) => r.querySelector(selector));

  const dom = Object.defineProperties(
    {},
    Object.fromEntries(Object.entries(IDS).map(([name, id]) => [name, { get: () => byId(id), enumerable: true }]))
  );
  dom.query = query;
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
