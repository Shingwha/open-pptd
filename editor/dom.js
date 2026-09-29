// ============================================================================
// dom.js — 编辑器骨架元素引用（editor/index.html 静态 id 的单一入口）
// ----------------------------------------------------------------------------
// 各模块不再各自 document.getElementById("...")，统一经 dom.xxx 取
// （懒查询 + 缓存：骨架元素创建后不会被替换，缓存安全）。
// id 契约见 editor/index.html；新增静态骨架元素时在此登记。
//
// createDom(rootEl) 工厂：查询优先落在 rootEl 子树内，未命中回退 document
// （过渡期设计——静态骨架仍在文档里，嵌入式挂载点 rootEl 可为空容器）。
// 默认实例 `dom` 仍是模块级单例（现名导出不变），未迁移调用点继续工作；
// createEditor 经 dom.rebind(rootEl) 把默认实例挂到自己的挂载点，
// destroy 时 dom.rebind(document) 还原。
// ============================================================================

/** 属性名 → index.html 元素 id。 */
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
 * 按 rootEl 建一个 dom 引用工厂。
 * @param {HTMLElement|Document} [rootEl] 作用域（默认 document）
 */
export function createDom(rootEl) {
  const cache = new Map();
  let scope = rootEl || document;

  /** 按 id 取元素（rootEl 子树优先，回退 document；首次查询后缓存）。 */
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
  /** 切换作用域并清缓存（createEditor 挂载 / destroy 还原）。 */
  dom.rebind = (next) => {
    cache.clear();
    scope = next || document;
  };
  /** 清空缓存（destroy 用）。 */
  dom.clear = () => cache.clear();
  return dom;
}

/** 默认实例（模块级单例，未迁移调用点继续工作）。 */
export const dom = createDom(typeof document !== "undefined" ? document : null);
