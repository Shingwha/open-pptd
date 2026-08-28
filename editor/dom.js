// ============================================================================
// dom.js — 编辑器骨架元素引用（editor/index.html 静态 id 的单一入口）
// ----------------------------------------------------------------------------
// 各模块不再各自 document.getElementById("...")，统一经 dom.xxx 取
// （懒查询 + 缓存：骨架元素创建后不会被替换，缓存安全）。
// id 契约见 editor/index.html；新增静态骨架元素时在此登记。
// ============================================================================

const cache = new Map();

/** 按 id 取元素（首次查询后缓存）。 */
function byId(id) {
  if (!cache.has(id)) cache.set(id, document.getElementById(id));
  return cache.get(id);
}

/** 属性名 → index.html 元素 id。 */
const IDS = {
  stage: "stage",
  canvas: "canvas",
  canvasWrap: "canvas-wrap",
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

export const dom = Object.defineProperties(
  {},
  Object.fromEntries(
    Object.entries(IDS).map(([name, id]) => [name, { get: () => byId(id), enumerable: true }])
  )
);
