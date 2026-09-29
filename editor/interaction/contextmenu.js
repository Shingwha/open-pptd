// ============================================================================
// interaction/contextmenu.js — 右键上下文菜单（三态，对齐设计稿 §03）
// ----------------------------------------------------------------------------
// 简化的最大杠杆：对齐 / 层级 / 组合 / 翻转 / 复制 / 删除从常驻 UI 移到右键，
// 画布因此零常驻浮层（U2/T1）。三态：
//   单选  复制/删除 · 置于顶层/上移一层/下移一层/置于底层 · 水平翻转/垂直翻转 ·
//         对齐到选区(多选解锁) / 组合(多选解锁)
//   多选  对齐到选区 ▸（六向）/ 水平分布 / 垂直分布 · 组合 / 取消组合 ·
//         复制（N 个）/ 删除（N 个）
//   空白  全选 / 粘贴 / 新建页面 / 页面背景… / 适配画布
// 菜单本体复用 components/menu.js（.menu/.mi/.msep/.submenu）与 interaction/arrange.js
// 的排列算法（与属性面板同一份）。
// ============================================================================

import { menuItem, menuSeparator, openMenuAt, closePopupMenu } from "../components/menu.js";
import { ALIGN_MODES, alignSelection, distribute } from "./arrange.js";
import { openPageBackgroundDialog } from "./dialogs/page-background.js";

/**
 * 绑定舞台右键菜单。
 * @param {object} opts
 *  - stage: 舞台元素（事件源）
 *  - api: 编辑器操作 API
 *  - state / page / groupOf: 状态与命中归一（点组成员 = 选组）
 *  - view: 视图（zoomReset 等）
 */
export function bindContextMenu({ stage, api, state, page, groupOf, view }) {
  const ac = new AbortController();
  if (!stage) return { destroy() {} };

  const close = () => closePopupMenu();

  /** 条目：先关菜单再执行（点击即收）。 */
  const item = (label, opts = {}) =>
    menuItem(label, {
      ...opts,
      onClick: opts.disabled || !opts.onClick ? undefined : () => { close(); opts.onClick(); },
    });
  const sep = () => menuSeparator();

  const list = () => page().elements || [];

  /** 在指针处打开菜单（统一外壳：components/menu.js openMenuAt）。 */
  function openAt(x, y, nodes) {
    close();
    openMenuAt(x, y, nodes, { className: "ctx-menu" });
  }

  // --------------------------------------------------------------------------
  // 动作（与属性面板同源：group/ungroup/delete/duplicate 的 api 自带快照）
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

  const FLIP_OFF = new Set(["table", "chart", "group"]); // 与属性面板一致：不支持整体翻转

  // --------------------------------------------------------------------------
  // 三态菜单构建
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
      // 单选组时给「取消组合」（与属性面板同能力；设计稿单选态只画了禁用「组合」）
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
  // 事件
  // --------------------------------------------------------------------------
  stage.addEventListener(
    "contextmenu",
    (e) => {
      // 快调条内的取色/下拉保留原生菜单（含右键粘贴等浏览器能力）
      if (e.target.closest?.(".quickbar")) return;
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
        openAt(e.clientX, e.clientY, pageMenu()); // 极端情况：元素已被移除
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
