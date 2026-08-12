// ============================================================================
// app/api.js — 编辑器操作 API（模型操作 + 渲染组合的统一入口）
// ----------------------------------------------------------------------------
// 画布控制器 / 属性面板 / 快速条 / 工具栏共用同一 API：
//   - 纯模型操作来自 ops（app/state.js）
//   - 渲染编排来自 view（app/view.js）
// controller / view 经 bind() 延迟注入：创建顺序为 api → controller → view
// （controller/view 需要 api，而 api 的方法只在调用时访问它们），
// 避免模块间循环依赖；main.js 只负责按顺序装配。
// ============================================================================

import { openChartEditor } from "../interaction/dialogs/chart-editor.js";
import { openTableEditor } from "../interaction/dialogs/table-editor.js";
import { openIconPicker } from "../interaction/dialogs/icon-editor.js";

export function createEditorApi({ state, page, selected, ops }) {
  let controller = null; // 画布交互控制器（interaction/canvas.js）
  let view = null; // 渲染编排（app/view.js）

  return {
    state,
    page,
    getPage: page,
    getSelected: () => state.selectedId,
    getSelectedElement: selected,
    select(id) {
      // 轻量选中：不重建画布 DOM（避免打断双击/拖动）
      state.selectedId = id;
      controller.refreshSelection();
      view.renderProps();
      view.renderQuickbar();
      view.updateButtons();
    },
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
    moveLayer: (dir) => {
      ops.moveLayer(dir);
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
          current: el.icon,
          onPick: (key) => {
            el.icon = key;
            view.render();
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
