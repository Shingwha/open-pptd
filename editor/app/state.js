// ============================================================================
// app/state.js — 编辑器状态 + 纯模型操作（不碰 DOM）
// ----------------------------------------------------------------------------
// 只做两件事：持有全局状态、提供纯模型变更（快照/选中/删除/层序）。
// 需要触发重渲染的组合操作（deleteSelected 等）由 main.js 的 api 层包装。
// ============================================================================

import { createHistory } from "../interaction/history.js";
import { nextElementId } from "../core/model.js";

export function createEditorState() {
  const state = {
    deck: null,
    theme: null,
    currentPage: 0,
    selectedId: null,
    history: createHistory(),
    imageMap: {},
    fontLibrary: {}, // { [family]: { bytes, source: "local"|"url", url, file, subset, embed, size } }
    manifestPath: null, // 当前项目 URL（/project/xxx/deck.pptd；部署模式为远程 URL）
    dirty: false, // 编辑器是否有未保存修改（自动刷新前检查，防丢更新）
  };

  const page = () => state.deck.pages[state.currentPage];
  const selected = () => (page().elements || []).find((el) => el.elementId === state.selectedId) || null;

  /** 纯模型操作（渲染由 api 层组合）。 */
  const ops = {
    beginChange() {
      state.history.snapshot(state.deck);
      state.dirty = true;
    },
    updateSelected(patch) {
      const el = selected();
      if (el) Object.assign(el, patch);
    },
    deleteSelected() {
      const list = page().elements;
      const idx = list.findIndex((e) => e.elementId === state.selectedId);
      if (idx < 0) return;
      list.splice(idx, 1);
      state.selectedId = null;
    },
    duplicateSelected() {
      const list = page().elements;
      const idx = list.findIndex((e) => e.elementId === state.selectedId);
      if (idx < 0) return;
      const src = list[idx];
      const copy = JSON.parse(JSON.stringify(src));
      copy.elementId = nextElementId(src.elementType);
      copy.bounds = [src.bounds[0] + 24, src.bounds[1] + 24, src.bounds[2], src.bounds[3]];
      list.splice(idx + 1, 0, copy);
      state.selectedId = copy.elementId;
    },
    moveLayer(dir) {
      const list = page().elements;
      const idx = list.findIndex((e) => e.elementId === state.selectedId);
      if (idx < 0) return;
      const to = idx + dir;
      if (to < 0 || to >= list.length) return;
      const [el] = list.splice(idx, 1);
      list.splice(to, 0, el);
    },
  };

  return { state, page, selected, ops };
}
