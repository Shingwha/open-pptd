// editor/app/api.js — editor operation API (single entry for model ops + render orchestration)
// The canvas controller, thumbnail bar, toolbar and content editors share this API:
// pure model operations from ops (app/state.js), render orchestration from view
// (app/view/view.js), and save/export/navigation delegated to io / present (bound
// late via bind()). Selection writes go through ops; reads go through getSelected /
// getSelection / getSelectedElements; modules never touch state.selection directly.

import { CONTENT_TYPE_IDS, createElement } from "../types/index.js";

/** Content-editor types (single-element editing only). */
const CONTENT_TYPES = new Set(CONTENT_TYPE_IDS);

export function createEditorApi({ state, page, selected, primarySelectedId, selectedElements, ops, ui }) {
  let controller = null; // canvas interaction controller (interaction/canvas.js)
  let view = null; // render orchestration (app/view/view.js)
  let io = null; // project IO facade (app/project/io.js)
  let presenter = null; // present mode (app/present.js)

  /** Selection highlight only: no canvas DOM rebuild (avoids breaking dblclick/drag). */
  const lightSelect = () => controller?.refreshSelection();
  // Render granularity (see view.render options): "all" rebuilds every thumbnail,
  // "current" repaints only the current card, "none" just moves the active card.
  // Content edits / undo / paste / element delete → current; page ops / theme / load
  // → all; page switch → none.
  const render = (opts) => view?.render(opts);
  const renderCurrent = () => view?.render({ thumbs: "current" });
  const repaint = () => view?.renderCanvas();

  /**
   * Open the content editor for one element. Multi-select normalizes to the
   * element first (interfaces §10.2). Modules are imported on demand so the
   * headless/shot assembly never loads any editor UI.
   */
  async function openContentEditor(el) {
    if (!el || !CONTENT_TYPES.has(el.elementType)) return false;
    if (!ops.isSelected(el.elementId) || state.selection.size !== 1) ops.select(el.elementId, "replace");
    lightSelect();
    let tx = false;
    // One undo step per dialog session: the snapshot is taken before the first
    // mutation; a dialog closed without edits enters no history entry.
    const beginChangeTx = () => {
      if (tx) return;
      tx = true;
      ops.beginChange();
    };
    const onChange = () => repaint();
    const onDone = () => {
      if (!tx) {
        repaint();
        return;
      }
      tx = false;
      renderCurrent(); // content edit: only the current page changed
    };
    const common = {
      theme: () => state.theme,
      fontOptions: () => api.fontOptions?.() || [["", "默认"]],
      beginChange: beginChangeTx,
      onChange,
      onDone,
      dialogs: ui.dialogs, // instance dialog service (editor/dialogs.js)
    };
    try {
      if (el.elementType === "text") {
        const mod = await import("../interaction/text-editor.js");
        mod.openTextEditor(el, common);
      } else if (el.elementType === "table") {
        const mod = await import("../interaction/dialogs/table-editor.js");
        mod.openTableEditor(el, common);
      } else {
        const mod = await import("../interaction/dialogs/chart-editor.js");
        mod.openChartEditor(el, common);
      }
      return true;
    } catch (err) {
      tx = false;
      ui.toast.show(`打开编辑器失败: ${err.message}`, "danger");
      return false;
    }
  }

  /**
   * Add one element of any add-menu type. One undo step; the new element is selected
   * and rendered. Content types keep their editor behavior (table/chart open the
   * content editor); shape/line/image stay transform-only. Images rebuild the
   * preview map so the inline dataURL is immediately addressable.
   */
  function addElementOfType(type, variant) {
    const el = createElement(type, variant);
    if (!el) return null;
    ops.beginChange();
    ops.addElement(el);
    ops.select(el.elementId, "replace");
    if (type === "image") io?.rebuildImageMap();
    renderCurrent(); // the element lands on the current page: one card to repaint
    if (CONTENT_TYPES.has(type) && type !== "text") openContentEditor(el);
    return el.elementId;
  }

  const api = {
    state,
    page,
    getPage: page,

    // selection (reads only; writes go through ops below)
    getSelected: primarySelectedId,
    getSelectedElement: selected,
    getSelection: () => [...state.selection],
    getSelectedElements: selectedElements,
    isSelected: (id) => state.selection.has(id),
    select(id, mode = "replace") {
      ops.select(id, mode);
      if (controller) lightSelect();
    },
    selectMany(ids, mode = "replace") {
      ops.selectMany(ids, mode);
      if (controller) lightSelect();
    },
    selectAll() {
      ops.selectAll();
      if (controller) lightSelect();
    },
    clearSelection() {
      ops.clearSelection();
      if (controller) lightSelect();
    },

    // transactions / transform
    beginChange: ops.beginChange,
    /** End a transaction: content edits repaint the current card unless the caller asks for a full rebuild (theme). */
    endChange: (opts = { thumbs: "current" }) => render(opts),
    refreshPreview: () => repaint(),
    moveSelected(dx, dy) {
      for (const el of selectedElements()) {
        el.bounds[0] += Number(dx) || 0;
        el.bounds[1] += Number(dy) || 0;
      }
      repaint();
    },
    resizeSelected(patch = {}) {
      for (const el of selectedElements()) {
        if (Number.isFinite(patch.x)) el.bounds[0] = patch.x;
        if (Number.isFinite(patch.y)) el.bounds[1] = patch.y;
        if (Number.isFinite(patch.w)) el.bounds[2] = Math.max(4, patch.w);
        if (Number.isFinite(patch.h)) el.bounds[3] = Math.max(4, patch.h);
      }
      repaint();
    },
    rotateSelected(angle) {
      const deg = Number(angle) || 0;
      for (const el of selectedElements()) {
        if (el.elementType === "table" || el.elementType === "chart" || el.elementType === "group") continue;
        el.rotation = deg;
      }
      repaint();
    },
    updateSelected(patch) {
      ops.updateSelected(patch);
      repaint();
    },
    deleteSelected() {
      ops.beginChange();
      ops.deleteSelected();
      renderCurrent(); // element removed from the current page only
    },

    // clipboard (instance-local; deep copies, no system clipboard)
    /** Copy the selection; returns the copied count (no deck change, no undo step). */
    copySelected: () => ops.copySelected(),
    /** Copy + delete as one undo step; returns the cut count. */
    cutSelected() {
      const count = ops.cutSelected();
      if (count > 0) renderCurrent();
      return count;
    },
    /** Paste into the current page as one undo step; returns the new element ids. */
    pasteClipboard(opts) {
      const ids = ops.pasteClipboard(opts);
      if (ids.length > 0) renderCurrent();
      return ids;
    },
    /** Duplicate the selection (+16px) without touching the user clipboard. */
    duplicateSelected() {
      const ids = ops.duplicateSelected();
      if (ids.length > 0) renderCurrent();
      return ids;
    },
    hasClipboard: () => ops.hasClipboard(),
    getClipboardCount: () => ops.getClipboardCount(),
    undo() {
      io?.applyHistory(state.history.undo(state.deck));
    },
    redo() {
      io?.applyHistory(state.history.redo());
    },

    // content editing
    openEditor: openContentEditor,
    openTextEditor: (el) => openContentEditor(el || selectedElements()[0] || null),
    openTableEditor: (el) => openContentEditor(el || selectedElements().find((e) => e.elementType === "table") || null),
    openChartEditor: (el) => openContentEditor(el || selectedElements().find((e) => e.elementType === "chart") || null),

    // add + page operations
    addElementOfType,
    addText: () => addElementOfType("text"),
    addTable: () => addElementOfType("table"),
    addChart: () => addElementOfType("chart"),
    addShape: (name) => addElementOfType("shape", name),
    addLine: (variant) => addElementOfType("line", variant),
    addImage: (dataUrl) => addElementOfType("image", dataUrl),
    insertPage(at) {
      ops.beginChange();
      const index = ops.insertPage(at);
      render();
      return index;
    },
    deletePage(index = state.currentPage) {
      if (state.deck.pages.length <= 1) return false;
      ops.beginChange();
      const ok = ops.deletePage(index);
      render();
      return ok;
    },
    movePage(from, to) {
      const list = state.deck.pages;
      const target = Math.max(0, Math.min(list.length - 1, Number(to)));
      if (!Number.isInteger(from) || from < 0 || from >= list.length || target === from) return false;
      ops.beginChange();
      const ok = ops.movePage(from, target);
      render();
      return ok;
    },

    // save / export
    save: () => io?.saveProject(),
    exportPptx: () => io?.exportPptx(),
    exportPng: () => io?.exportImages(),
    exportBundle: () => io?.exportProjectZip(),

    // navigation / view
    goToPage(index) {
      if (!state.deck?.pages?.length) return;
      const i = Math.max(0, Math.min(state.deck.pages.length - 1, Number(index)));
      state.currentPage = i;
      ops.clearSelection();
      render({ thumbs: "none" }); // page switch: active card moves, no thumbnail rebuild
    },
    nextPage() {
      api.goToPage(state.currentPage + 1);
    },
    prevPage() {
      api.goToPage(state.currentPage - 1);
    },
    zoomIn: () => view?.zoomIn(),
    zoomOut: () => view?.zoomOut(),
    zoomReset: () => view?.zoomReset(),
    present: () => presenter?.start(),
    reload: () => io?.manualReload(),

    /** Inject interaction deps once assembly is done; late calls merge (io/present are created after the view). */
    bind(deps = {}) {
      controller = deps.controller ?? controller;
      view = deps.view ?? view;
      io = deps.io ?? io;
      presenter = deps.present ?? presenter;
    },
  };

  return api;
}
