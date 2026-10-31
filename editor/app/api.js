// ============================================================================
// app/api.js — editor operation API (single entry for model ops + render orchestration)
// ----------------------------------------------------------------------------
// The canvas controller, thumbnail bar, toolbar and content editors all share
// this API:
//   - pure model operations come from ops (app/state.js)
//   - render orchestration comes from view (app/view/view.js)
//   - save/export/navigation are delegated to io / present, bound late via bind()
//
// Surface (interfaces.md §10.2):
//   selection/transform select / selectMany / selectAll / clearSelection /
//     getSelected / getSelection / getSelectedElements / isSelected /
//     beginChange / endChange / refreshPreview / moveSelected / resizeSelected /
//     rotateSelected / deleteSelected / undo / redo
//   content            openTextEditor / openTableEditor / openChartEditor /
//                      updateSelected / openEditor (canvas double-click alias)
//   page ops           addText / addTable / addChart / insertPage / deletePage /
//                      movePage
//   save/export        save / exportPptx / exportPng / exportBundle
//   navigation/view    goToPage / nextPage / prevPage / zoomIn / zoomOut /
//                      zoomReset / present / reload
// Removed capabilities (no compat layer): group/ungroup, align/distribute,
// moveLayer/edge, clipboard, duplicate, page duplicate/batch.
//
// Selection model: writes go through the ops here; reads go through
// getSelected / getSelection / getSelectedElements / isSelected. Editor modules
// must not touch state.selection directly.
// ============================================================================

import { createElement } from "../types/index.js";

/** Content-editor types (single-element editing only). */
const CONTENT_TYPES = new Set(["text", "table", "chart"]);

export function createEditorApi({ state, page, selected, primarySelectedId, selectedElements, ops, ui }) {
  let controller = null; // canvas interaction controller (interaction/canvas.js)
  let view = null; // render orchestration (app/view/view.js)
  let io = null; // project IO facade (app/project/io.js)
  let presenter = null; // present mode (app/present.js)

  /** Selection highlight only: no canvas DOM rebuild (avoids breaking dblclick/drag). */
  const lightSelect = () => controller?.refreshSelection();
  const render = () => view?.render();
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
      render();
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

  /** Add one of the three content elements; table/chart open their editor right away. */
  function addContent(type) {
    const el = createElement(type);
    if (!el) return null;
    ops.beginChange();
    ops.addElement(el);
    ops.select(el.elementId, "replace");
    render();
    if (type !== "text") openContentEditor(el);
    return el.elementId;
  }

  const api = {
    state,
    page,
    getPage: page,

    // ---- selection (primary + multi-select); reads only, writes go through ops below ----
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

    // ---- transactions / transform ----
    beginChange: ops.beginChange,
    endChange: () => render(),
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
      render();
    },
    undo() {
      io?.applyHistory(state.history.undo(state.deck));
    },
    redo() {
      io?.applyHistory(state.history.redo());
    },

    // ---- content editing ----
    openEditor: openContentEditor,
    openTextEditor: (el) => openContentEditor(el || selectedElements()[0] || null),
    openTableEditor: (el) => openContentEditor(el || selectedElements().find((e) => e.elementType === "table") || null),
    openChartEditor: (el) => openContentEditor(el || selectedElements().find((e) => e.elementType === "chart") || null),

    // ---- add + page operations (single page; editor-ux §2) ----
    addText: () => addContent("text"),
    addTable: () => addContent("table"),
    addChart: () => addContent("chart"),
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

    // ---- save / export ----
    save: () => io?.saveProject(),
    exportPptx: () => io?.exportPptx(),
    exportPng: () => io?.exportImages(),
    exportBundle: () => io?.exportProjectZip(),

    // ---- navigation / view ----
    goToPage(index) {
      if (!state.deck?.pages?.length) return;
      const i = Math.max(0, Math.min(state.deck.pages.length - 1, Number(index)));
      state.currentPage = i;
      ops.clearSelection();
      render();
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
