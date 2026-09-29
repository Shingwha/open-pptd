// ============================================================================
// app/state.js — 编辑器状态 + 纯模型操作（不碰 DOM）
// ----------------------------------------------------------------------------
// 只做两件事：持有全局状态、提供纯模型变更（快照/选中/删除/层序）。
// 需要触发重渲染的组合操作（deleteSelected 等）由 main.js 的 api 层包装。
//
// 选择模型（U1）：
//   - state.selection: Set<string> —— 元素 id 集合（有序，末位即「最后选中」）
//   - state.selectedId —— 兼容访问器：单选返回唯一 id，多选返回最后选中，空选 null；
//     赋值仍然可用（`state.selectedId = null` 清空、`= id` 单选）。旧调用点零改动。
//   - group 元素（elementType:"group"）以 children 引用成员 id；选中/命中自动
//     归一到组（点成员 = 选组）。
// ============================================================================

import { createHistory } from "../interaction/history.js";
import { nextElementId } from "../../packages/model/index.js";

/** 深拷贝元素并重映射 elementId / group.children（克隆用）。 */
function cloneElement(el) {
  const copy = JSON.parse(JSON.stringify(el));
  copy.elementId = nextElementId(el.elementType);
  return copy;
}

export function createEditorState() {
  const state = {
    deck: null,
    theme: null,
    currentPage: 0,
    history: createHistory(),
    selection: new Set(), // 选中元素 id 集合（多选）
    _lastSelected: null,  // 最后加入选中的 id（多选时 selectedId 返回它）
    imageMap: {},
    iconMap: {}, // { [iconName]: {inner,w,h} }（icons.js 预读缓存，渲染/导出共用）
    pagesPending: new Set(), // 渐进加载中未就绪的页（存页对象引用，删除/重排不失效）
    fontLibrary: {}, // { [family]: { bytes, source: "local"|"url", url, file, subset, embed, size } }
    manifestPath: null, // 当前项目 URL（/project/xxx/deck.pptd；部署模式为远程 URL）
    projectHandle: null, // 本地项目 DirectoryHandle（官方文件夹选择器打开；经句柄读写）
    projectName: "", // 本地项目文件夹名（顶栏/状态栏显示）
    dirty: false, // 编辑器是否有未保存修改（自动刷新前检查，防丢更新）
    savedDeck: null, // 最后一次加载/保存时的 deck 基线（撤销/重做回该状态即视为已保存）
  };

  // ---- selectedId 兼容访问器（getter 返回主选中，setter 支持旧的单值赋值）----
  Object.defineProperty(state, "selectedId", {
    enumerable: true,
    configurable: true,
    get() {
      if (state.selection.size === 0) return null;
      if (state.selection.size === 1) return state.selection.values().next().value;
      if (state._lastSelected && state.selection.has(state._lastSelected)) return state._lastSelected;
      let last = null;
      for (const id of state.selection) last = id;
      return last;
    },
    set(v) {
      state.selection.clear();
      if (v == null) {
        state._lastSelected = null;
      } else {
        state.selection.add(v);
        state._lastSelected = v;
      }
    },
  });

  const page = () => state.deck.pages[state.currentPage];
  const elements = () => page().elements || [];
  const selected = () => elements().find((el) => el.elementId === state.selectedId) || null;

  /** 全部选中元素（保持选中顺序；跨页不存在的 id 自动跳过）。 */
  const selectedElements = () => {
    const list = elements();
    const out = [];
    for (const id of state.selection) {
      const el = list.find((e) => e.elementId === id);
      if (el) out.push(el);
    }
    return out;
  };

  /** 命中 id 所属的组元素（成员 → 组；否则 null）。 */
  const groupOf = (id) =>
    elements().find((e) => e.elementType === "group" && Array.isArray(e.children) && e.children.includes(id)) || null;

  /** 选中归一到组：点组成员 = 选整组。 */
  const normalizeId = (id) => (id == null ? null : groupOf(id)?.elementId || id);

  /** 选中集合的包围盒（多选/组共用；无选中返回 null）。 */
  const selectionBounds = () => {
    const els = selectedElements();
    if (els.length === 0) return null;
    let x1 = Infinity;
    let y1 = Infinity;
    let x2 = -Infinity;
    let y2 = -Infinity;
    for (const el of els) {
      const b = el.bounds || [0, 0, 0, 0];
      x1 = Math.min(x1, b[0]);
      y1 = Math.min(y1, b[1]);
      x2 = Math.max(x2, b[0] + b[2]);
      y2 = Math.max(y2, b[1] + b[3]);
    }
    return [x1, y1, x2 - x1, y2 - y1];
  };

  /** 纯模型操作（渲染由 api 层组合）。 */
  const ops = {
    beginChange() {
      state.history.snapshot(state.deck);
      state.dirty = true;
    },
    /** 标记当前 deck 为已落盘基线（加载/保存成功后调用；撤销回它即恢复干净）。 */
    markSaved() {
      state.savedDeck = structuredClone(state.deck);
      state.dirty = false;
    },
    /** 重算 dirty：当前 deck 与保存基线等值比较（渲染钩子里调用）。
     * 无用户编辑时（dirty=false），渲染触发的被动归一化——文本自适应增高、
     * 表格实测高度写回（app/view/measure.js）——直接同化进基线，不视为未保存修改；
     * 有用户编辑时（dirty=true，含撤销/重做先置位），按内容比较精确化：撤销回保存点即恢复干净。 */
    syncDirty() {
      if (!state.savedDeck) return;
      if (!state.dirty) {
        state.savedDeck = structuredClone(state.deck);
        return;
      }
      state.dirty = JSON.stringify(state.deck) !== JSON.stringify(state.savedDeck);
    },

    // ---- 选择 ----
    /** 选中。mode: "replace"（默认）| "add"（Shift 加选）| "toggle"（Ctrl 切换）。 */
    select(id, mode = "replace") {
      const target = normalizeId(id);
      if (target == null) {
        ops.clearSelection();
        return;
      }
      if (mode === "add") {
        state.selection.add(target);
        state._lastSelected = target;
      } else if (mode === "toggle") {
        if (state.selection.has(target)) {
          state.selection.delete(target);
          if (state._lastSelected === target) {
            state._lastSelected = null;
            for (const sid of state.selection) state._lastSelected = sid;
          }
        } else {
          state.selection.add(target);
          state._lastSelected = target;
        }
      } else {
        state.selection = new Set([target]);
        state._lastSelected = target;
      }
    },
    selectMany(ids, mode = "replace") {
      const targets = [...new Set((ids || []).map(normalizeId).filter(Boolean))];
      if (mode === "add") {
        for (const id of targets) state.selection.add(id);
      } else if (mode === "toggle") {
        for (const id of targets) ops.select(id, "toggle");
        return;
      } else {
        state.selection = new Set(targets);
      }
      if (targets.length) state._lastSelected = targets[targets.length - 1];
    },
    clearSelection() {
      state.selection.clear();
      state._lastSelected = null;
    },
    /** 全选当前页（组成员折叠为组，避免重复计入）。 */
    selectAll() {
      const ids = elements()
        .filter((el) => el.elementType === "group" || !groupOf(el.elementId))
        .map((el) => el.elementId);
      state.selection = new Set(ids);
      state._lastSelected = ids.length ? ids[ids.length - 1] : null;
    },
    isSelected(id) {
      return state.selection.has(id);
    },

    // ---- 变更 ----
    updateSelected(patch) {
      for (const el of selectedElements()) Object.assign(el, patch);
    },
    deleteSelected() {
      const ids = new Set(state.selection);
      if (ids.size === 0) return;
      const list = elements();
      const doomed = new Set(ids);
      for (const id of ids) {
        const el = list.find((e) => e.elementId === id);
        if (el && el.elementType === "group" && Array.isArray(el.children)) {
          for (const cid of el.children) doomed.add(cid); // 删组连带删成员
        }
      }
      const kept = list.filter((e) => !doomed.has(e.elementId));
      if (kept.length === list.length) return;
      page().elements = kept;
      ops.clearSelection();
    },
    /** 复制选中（含组成员）；副本置于列表顶层，选中切到副本。返回新 id 数组。 */
    duplicateSelected(offset = 24) {
      const list = elements();
      const picked = selectedElements();
      if (picked.length === 0) return [];
      const added = [];
      const newIds = [];
      for (const src of picked) {
        const copy = cloneElement(src);
        copy.bounds = [src.bounds[0] + offset, src.bounds[1] + offset, src.bounds[2], src.bounds[3]];
        if (src.elementType === "group" && Array.isArray(src.children)) {
          const map = new Map();
          const childCopies = [];
          for (const cid of src.children) {
            const child = list.find((e) => e.elementId === cid);
            if (!child) continue;
            const cc = cloneElement(child);
            cc.bounds = [child.bounds[0] + offset, child.bounds[1] + offset, child.bounds[2], child.bounds[3]];
            childCopies.push(cc);
            map.set(cid, cc.elementId);
          }
          copy.children = src.children.map((cid) => map.get(cid)).filter(Boolean);
          added.push(...childCopies);
        }
        added.push(copy);
        newIds.push(copy.elementId);
      }
      list.push(...added);
      ops.selectMany(newIds);
      return newIds;
    },
    /** 复制选中但不偏移（Ctrl/Alt 拖动复制：副本与原位重合，随后跟着指针走）。 */
    duplicateInPlace() {
      return ops.duplicateSelected(0);
    },
    moveLayer(dir) {
      const list = elements();
      const idxs = selectedElements()
        .map((el) => list.indexOf(el))
        .filter((i) => i >= 0)
        .sort((a, b) => (dir < 0 ? a - b : b - a)); // 上行从低到高，下行从高到低
      for (const idx of idxs) {
        const to = idx + dir;
        if (to < 0 || to >= list.length) continue;
        const [el] = list.splice(idx, 1);
        list.splice(to, 0, el);
      }
    },

    // ---- 组合 ----
    /** 组合当前选中（≥2）为 group 元素；返回新组 id（失败返回 null）。 */
    groupSelected() {
      const list = elements();
      const picked = selectedElements().filter((e) => e.elementType !== "group");
      if (picked.length < 2 && !selectedElements().some((e) => e.elementType === "group")) {
        if (picked.length < 2) return null;
      }
      const members = [];
      for (const el of selectedElements()) {
        if (el.elementType === "group") members.push(...(el.children || []));
        else members.push(el.elementId);
      }
      const memberEls = list.filter((e) => members.includes(e.elementId));
      if (memberEls.length < 2) return null;
      const b = selectionBounds() || [0, 0, 0, 0];
      const group = {
        elementId: nextElementId("group"),
        elementType: "group",
        bounds: [b[0], b[1], b[2], b[3]],
        children: memberEls.map((e) => e.elementId),
      };
      const topIdx = Math.max(...memberEls.map((e) => list.indexOf(e)));
      list.splice(topIdx + 1, 0, group); // 组置成员之上，保持渲染层级
      ops.select(group.elementId);
      return group.elementId;
    },
    /** 取消组合：选中单个组时，解散为成员（成员 bounds 不变，往返幂等）。 */
    ungroupSelected() {
      const list = elements();
      const groups = selectedElements().filter((e) => e.elementType === "group");
      if (groups.length === 0) return false;
      const freed = [];
      for (const g of groups) {
        const i = list.indexOf(g);
        if (i >= 0) list.splice(i, 1);
        freed.push(...(g.children || []));
      }
      ops.selectMany(freed);
      return true;
    },
  };

  return { state, page, elements, selected, selectedElements, groupOf, selectionBounds, ops };
}
