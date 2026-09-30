// ============================================================================
// interaction/contextmenu.js — stage context menu (three states)
// ----------------------------------------------------------------------------
// Highest-leverage simplification: align / layer / group / flip / duplicate /
// delete move out of persistent UI and into the context menu, so the canvas has
// no permanent overlay. Three states:
//   single  duplicate/delete · bring to front / forward / backward / send to back ·
//           flip H/V · "align to selection" (locked) / "group" (locked)
//   multi   align to selection ▸ (six-way) / distribute H / distribute V ·
//           group / ungroup · duplicate (N) / delete (N)
//   blank   select all / paste / new page / page background… / fit to canvas
// The menu itself reuses components/menu.js (.menu/.mi/.msep/.submenu) and the
// arrangement algorithms in interaction/arrange.js (the same copy the property
// panel uses).
// ============================================================================

import { menuItem, menuSeparator, openMenuAt, closePopupMenu } from "../components/menu.js";
import { ALIGN_MODES, alignSelection, distribute } from "./arrange.js";
import { openPageBackgroundDialog } from "./dialogs/page-background.js";

/**
 * Bind the canvas context menu.
 *
 * The listener lives on the canvas element itself, not the stage: anything outside
 * the canvas (stage padding, quickbar, FABs, thumbnail bar, topbar…) keeps the
 * browser's native context menu by construction — no per-element exceptions.
 * @param {object} opts
 *  - canvas: canvas element (event source)
 *  - api: editor operations API
 *  - state / page / groupOf: state and hit normalization (clicking a group member selects the group)
 *  - view: view (zoomReset etc.)
 */
export function bindContextMenu({ canvas, api, state, page, groupOf, view }) {
  const ac = new AbortController();
  if (!canvas) return { destroy() {} };

  const close = () => closePopupMenu();

  /** Menu entry: close the menu first, then run the action (a click dismisses). */
  const item = (label, opts = {}) =>
    menuItem(label, {
      ...opts,
      onClick: opts.disabled || !opts.onClick ? undefined : () => { close(); opts.onClick(); },
    });
  const sep = () => menuSeparator();

  const list = () => page().elements || [];

  /** Open the menu at the pointer (shared shell: components/menu.js openMenuAt). */
  function openAt(x, y, nodes) {
    close();
    openMenuAt(x, y, nodes, { className: "ctx-menu" });
  }

  // --------------------------------------------------------------------------
  // Actions (same source as the property panel: the api carries its own snapshots)
  // --------------------------------------------------------------------------
  const act = {
    deleteSel: () => api.deleteSelected(),
    duplicate: () => api.duplicateSelected(),
    group: () => api.group(),
    ungroup: () => api.ungroup(),
    selectAll: () => api.selectAll(),
    paste: () => api.pasteClipboard(),
    addPage: () => api.addPage(),
    fit: () => view.zoomReset(),
    layerStep: (dir) => {
      api.beginChange();
      api.moveLayer(dir);
      api.endChange();
    },
    layerEdge: (edge) => api.moveLayerEdge(edge),
    align: (els, mode) => {
      api.beginChange();
      alignSelection(els, mode, list());
      api.endChange();
    },
    distribute: (els, axis) => {
      api.beginChange();
      distribute(els, axis, list());
      api.endChange();
    },
    flip: (els, axis) => {
      api.beginChange();
      for (const el of els) {
        const f = Array.isArray(el.flip) ? el.flip : [false, false];
        el.flip = axis === "h" ? [!f[0], !!f[1]] : [!!f[0], !f[1]];
      }
      api.endChange();
    },
    pageBackground: () =>
      openPageBackgroundDialog({
        pg: page(),
        theme: state.theme,
        beginChange: api.beginChange,
        endChange: api.endChange,
        refreshPreview: api.refreshPreview,
      }),
  };

  const FLIP_OFF = new Set(["table", "chart", "group"]); // same as the property panel: no whole-element flip

  // --------------------------------------------------------------------------
  // Three-state menu construction
  // --------------------------------------------------------------------------
  function singleMenu(els) {
    const el = els[0];
    const noFlip = FLIP_OFF.has(el.elementType);
    const isGroup = el.elementType === "group";
    return [
      item("复制", { hint: "Ctrl+D", onClick: act.duplicate }),
      item("删除", { hint: "Del", danger: true, onClick: act.deleteSel }),
      sep(),
      item("置于顶层", { hint: "]", onClick: () => act.layerEdge("front") }),
      item("上移一层", { onClick: () => act.layerStep(1) }),
      item("下移一层", { onClick: () => act.layerStep(-1) }),
      item("置于底层", { hint: "[", onClick: () => act.layerEdge("back") }),
      sep(),
      item("水平翻转", { disabled: noFlip, onClick: () => act.flip(els, "h") }),
      item("垂直翻转", { disabled: noFlip, onClick: () => act.flip(els, "v") }),
      sep(),
      item("对齐到选区", { disabled: true, hint: "多选" }),
      // For a single group, offer "ungroup" (same capability as the property panel)
      isGroup
        ? item("取消组合", { hint: "Ctrl+⇧+G", onClick: act.ungroup })
        : item("组合", { disabled: true, hint: "Ctrl+G" }),
    ];
  }

  function multiMenu(els) {
    const n = els.length;
    const hasGroup = els.some((e) => e.elementType === "group");
    const alignSub = ALIGN_MODES.map(([mode, , title]) =>
      item(title, { onClick: () => act.align(els, mode) })
    );
    return [
      item("对齐到选区", { submenuItems: alignSub }),
      item("水平分布", { disabled: n < 3, onClick: () => act.distribute(els, "h") }),
      item("垂直分布", { disabled: n < 3, onClick: () => act.distribute(els, "v") }),
      sep(),
      item("组合", { hint: "Ctrl+G", onClick: act.group }),
      item("取消组合", { hint: "Ctrl+⇧+G", disabled: !hasGroup, onClick: act.ungroup }),
      sep(),
      item(`复制（${n} 个）`, { hint: "Ctrl+D", onClick: act.duplicate }),
      item(`删除（${n} 个）`, { hint: "Del", danger: true, onClick: act.deleteSel }),
    ];
  }

  function pageMenu() {
    const hasClip = Array.isArray(state.clipboard) && state.clipboard.length > 0;
    return [
      item("全选", { hint: "Ctrl+A", onClick: act.selectAll }),
      sep(),
      item("粘贴", { hint: "Ctrl+V", disabled: !hasClip, onClick: act.paste }),
      item("新建页面", { onClick: act.addPage }),
      item("页面背景…", { onClick: act.pageBackground }),
      sep(),
      item("适配画布", { hint: "Ctrl+0", onClick: act.fit }),
    ];
  }

  // --------------------------------------------------------------------------
  // Events
  // --------------------------------------------------------------------------
  canvas.addEventListener(
    "contextmenu",
    (e) => {
      e.preventDefault();
      const node = e.target.closest?.("[data-element-id]");
      const selected = api.getSelectedElements();
      if (!node) {
        openAt(e.clientX, e.clientY, pageMenu());
        return;
      }
      const id = node.dataset.elementId;
      const groupId = groupOf?.(id)?.elementId || id;
      const inSelection = selected.some((el) => el.elementId === groupId);
      if (!inSelection) api.select(groupId, "replace");
      const els = api.getSelectedElements();
      if (els.length === 0) {
        openAt(e.clientX, e.clientY, pageMenu()); // edge case: the element was removed
        return;
      }
      openAt(e.clientX, e.clientY, els.length > 1 ? multiMenu(els) : singleMenu(els));
    },
    { signal: ac.signal }
  );

  return {
    close,
    destroy() {
      ac.abort();
      close();
    },
  };
}
