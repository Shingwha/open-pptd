// ============================================================================
// dom.js — skeleton element registry, scoped to one instance mount point
// ----------------------------------------------------------------------------
// Editor modules never call document.getElementById/querySelector for skeleton
// elements; they read dom.<name> (or dom.query(selector) for regions without an
// id) from the instance context created by createPreview/createEditor.
//
// Scope: createDom(rootEl) resolves every lookup inside rootEl ONLY. There is no
// document fallback and no module-level singleton (3.0 componentisation,
// decisions.md D1): two instances mounted side by side each get their own
// registry, and a missing element is a genuine null rather than a silent reach
// into another instance's skeleton.
// Lookups are lazy (first access) and cached: the skeleton is authored once per
// instance (editor/skeleton.js) and never replaced while the instance lives.
// ============================================================================

/** Property name → skeleton element id (the id contract; mirrors editor/skeleton.js). */
const IDS = {
  stage: "stage",
  canvas: "canvas",
  canvasWrap: "canvas-wrap",
  canvasLoading: "canvas-loading",
  pageThumbs: "page-thumbs",
  pageCount: "page-count",
  addList: "add-list",
  selActions: "sel-actions",
  zoomCtl: "zoom-ctl",
  zoomLabel: "zoom-label",
  brandFile: "brand-file",
  tbStatus: "tb-status",
  statusHint: "status-hint",
  statusDirty: "status-dirty",
  statusSaved: "status-saved",
  btnReload: "btn-reload",
  btnAdd: "btn-add",
  btnFile: "btn-file",
  btnAddPage: "btn-add-page",
  btnPageMenu: "btn-page-menu",
  btnUndo: "btn-undo",
  btnRedo: "btn-redo",
  btnDesign: "btn-design",
  btnPresent: "btn-present",
  btnZoomOut: "btn-zoom-out",
  btnZoomIn: "btn-zoom-in",
  btnZoomReset: "btn-zoom-reset",
};

/** document.getElementById when the scope is a document, a scoped query for an element. */
function findById(scope, id) {
  return typeof scope.getElementById === "function" ? scope.getElementById(id) : scope.querySelector(`#${CSS.escape(id)}`);
}

/**
 * Build a dom ref factory scoped to rootEl.
 * @param {HTMLElement|Document} rootEl instance mount point (required)
 * @returns {object} lazy element getters + query/clear
 */
export function createDom(rootEl) {
  if (!rootEl || typeof rootEl.querySelector !== "function") {
    throw new Error("createDom: 需要实例挂载点（HTMLElement）");
  }
  const scope = rootEl;
  const cache = new Map();

  /** Cached lookup inside the instance scope (null when the skeleton has no such element). */
  function resolve(key, find) {
    if (cache.has(key)) return cache.get(key);
    let el = null;
    try {
      el = find(scope);
    } catch {
      el = null;
    }
    cache.set(key, el);
    return el;
  }

  /** Resolve a skeleton element by id. */
  const byId = (id) => resolve(`id:${id}`, (r) => findById(r, id));
  /** Resolve a skeleton region by CSS selector. */
  const query = (selector) => resolve(`sel:${selector}`, (r) => r.querySelector(selector));

  const dom = Object.defineProperties(
    {},
    Object.fromEntries(Object.entries(IDS).map(([name, id]) => [name, { get: () => byId(id), enumerable: true }]))
  );
  dom.query = query;
  /** Clear the cache (instance destroy; the skeleton is about to be dropped). */
  dom.clear = () => cache.clear();
  return dom;
}
