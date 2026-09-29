// ============================================================================
// app/api.js — editor operation API (single entry for model ops + render orchestration)
// ----------------------------------------------------------------------------
// The canvas controller, property panel, quickbar and toolbar all share this API:
//   - pure model operations come from ops (app/state.js)
//   - render orchestration comes from view (app/view/view.js)
// controller / view are injected late via bind(): creation order is
// api → controller → view (they need api, while api only touches them when a
// method is called), which avoids circular module deps; main.js just assembles
// them in order.
//
// Selection model (U1): writes go through the ops here (select/selectMany/
// selectAll/clearSelection); reads go through getSelected / getSelectedElement /
// getSelection / getSelectedElements / isSelected. This is the ONE read surface:
// editor modules must not touch state.selection directly (state.js keeps the
// single derivation, primarySelectedId).
// ============================================================================

import { openChartEditor } from "../interaction/dialogs/chart-editor.js";
import { openTableEditor } from "../interaction/dialogs/table-editor.js";
import { openIconPicker } from "../interaction/dialogs/icon-editor.js";
import { ensureIcon } from "./project/icons.js";

export function createEditorApi({ state, page, selected, primarySelectedId, selectedElements, ops }) {
  let controller = null; // canvas interaction controller (interaction/canvas.js)
  let view = null; // render orchestration (app/view/view.js)

  /** Lightweight selection: no canvas DOM rebuild (avoids breaking dblclick/drag). */
  const lightSelect = () => {
    controller.refreshSelection();
    view.renderProps();
    view.renderQuickbar();
    view.updateButtons();
  };

  return {
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
    /** Called when the controller handles Ctrl+A / Esc itself (no panel rebuild). */
    beginChange: ops.beginChange,
    endChange: () => view.render(),
    /** Light preview refresh: rebuilds only the canvas (instant feedback on panel commit, panel kept so focus survives). */
    refreshPreview: () => view.renderCanvas(),
    updateSelected: ops.updateSelected,
    deleteSelected: () => {
      ops.beginChange();
      ops.deleteSelected();
      view.render();
    },
    duplicateSelected: () => {
      ops.beginChange();
      ops.duplicateSelected();
      view.render();
    },
    /** Duplicate selection in place (for Ctrl/Alt drag-copy; snapshot/render are the canvas controller's job). */
    duplicateInPlace: () => ops.duplicateInPlace(),
    moveLayer: (dir) => {
      ops.moveLayer(dir);
      view.render();
    },
    /** Bring to front / send to back (edge: "front"|"back"; used by the context menu). */
    moveLayerEdge: (edge) => {
      ops.beginChange();
      ops.moveLayerEdge(edge);
      view.render();
    },
    /** Copy selection to clipboard / paste (context menu + Ctrl+C/V). */
    copySelected: () => ops.copySelected(),
    pasteClipboard: () => {
      if (!Array.isArray(state.clipboard) || state.clipboard.length === 0) return [];
      ops.beginChange();
      const ids = ops.pasteClipboard();
      view.render();
      return ids;
    },
    /** Add and switch to a new page (statusbar + / page-level context menu). */
    addPage: () => {
      ops.beginChange();
      ops.addPage();
      view.render();
    },
    /** Duplicate pages (thumbnail-bar context menu / batch); returns the new page indexes. */
    duplicatePages: (indexes) => {
      ops.beginChange();
      const out = ops.duplicatePages(indexes);
      view.render();
      return out;
    },
    /** Delete pages (thumbnail-bar context menu / batch; keeps at least 1 page). */
    deletePages: (indexes) => {
      ops.beginChange();
      const ok = ops.deletePages(indexes);
      view.render();
      return ok;
    },
    /** Reorder a page (thumbnail drag-sort, undoable). */
    movePage: (from, to) => {
      ops.beginChange();
      const ok = ops.movePage(from, to);
      view.render();
      return ok;
    },
    /** Group / ungroup (Ctrl+G / Ctrl+Shift+G). */
    group: () => {
      ops.beginChange();
      const id = ops.groupSelected();
      view.render();
      return id;
    },
    ungroup: () => {
      ops.beginChange();
      ops.ungroupSelected();
      view.render();
    },
    /** Open the element's data editor (chart/table/icon; the caller owns the snapshot). */
    openEditor(el) {
      if (el.elementType === "chart") {
        openChartEditor(el, { theme: state.theme, onChange: () => view.render() });
      } else if (el.elementType === "table") {
        openTableEditor(el, { onChange: () => view.render() });
      } else if (el.elementType === "icon") {
        openIconPicker({
          current: el.iconName,
          onPick: (raw) => {
            el.iconName = raw;
            ensureIcon(raw).then(() => view.render()); // re-render after the icon def is preloaded
          },
        });
      }
    },
    /** Inject interaction deps (controller / view) once assembly is done; the API is only safe to call after this. */
    bind(deps) {
      controller = deps.controller;
      view = deps.view;
    },
  };
}
