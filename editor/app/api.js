// ============================================================================
// app/api.js — 编辑器操作 API（模型操作 + 渲染组合的统一入口）
// ----------------------------------------------------------------------------
// 画布控制器 / 属性面板 / 快速条 / 工具栏共用同一 API：
//   - 纯模型操作来自 ops（app/state.js）
//   - 渲染编排来自 view（app/view/view.js）
// controller / view 经 bind() 延迟注入：创建顺序为 api → controller → view
// （controller/view 需要 api，而 api 的方法只在调用时访问它们），
// 避免模块间循环依赖；main.js 只负责按顺序装配。
//
// 选择模型（U1）：getSelected/getSelectedElement 保留单值兼容语义（主选中），
// 新增 getSelection/getSelectedElements/select(id, mode)/selectAll/isSelected。
// ============================================================================

import { openChartEditor } from "../interaction/dialogs/chart-editor.js";
import { openTableEditor } from "../interaction/dialogs/table-editor.js";
import { openIconPicker } from "../interaction/dialogs/icon-editor.js";
import { ensureIcon } from "./project/icons.js";

export function createEditorApi({ state, page, selected, selectedElements, ops }) {
  let controller = null; // 画布交互控制器（interaction/canvas.js）
  let view = null; // 渲染编排（app/view/view.js）

  /** 轻量选中：不重建画布 DOM（避免打断双击/拖动）。 */
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
    // ---- 选中（单值兼容 + 多选）----
    getSelected: () => state.selectedId,
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
    /** Ctrl+A / Esc 等由控制器兜底时调用（不重建面板）。 */
    beginChange: ops.beginChange,
    endChange: () => view.render(),
    /** 轻量预览刷新：只重建画布（属性面板控件提交后即时反馈，不重建面板保焦点）。 */
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
    /** 复制选中到原位（供 Ctrl/Alt 拖动复制使用；快照/渲染由画布控制器负责）。 */
    duplicateInPlace: () => ops.duplicateInPlace(),
    moveLayer: (dir) => {
      ops.moveLayer(dir);
      view.render();
    },
    /** 组合 / 取消组合（Ctrl+G / Ctrl+Shift+G）。 */
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
    /** 打开元素的数据编辑器（图表/表格/图标；快照由调用方负责）。 */
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
            ensureIcon(raw).then(() => view.render()); // 选中图标预读后重渲染
          },
        });
      }
    },
    /** 装配完成注入交互依赖（controller / view），之后 API 才可安全调用。 */
    bind(deps) {
      controller = deps.controller;
      view = deps.view;
    },
  };
}
