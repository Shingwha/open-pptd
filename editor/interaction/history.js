// ============================================================================
// interaction/history.js — 撤销/重做（undo 链 + redo 链）
// ----------------------------------------------------------------------------
// 语义：
//   - snapshot 在「变更前」调用，变更前状态压入 undo 链（可撤销点）；
//   - undo(current) 把当前态压入 redo 链，再回到最近的可撤销点；
//   - redo() 从 redo 链弹出恢复；新操作（snapshot）清空 redo 链。
// 这样首次变更即可撤销，undo/redo 严格成对往返，无跳步。
// ============================================================================

export function createHistory(cap = 60) {
  let undoStack = [];
  let redoStack = [];
  let index = -1; // 指向 undo 链中当前基线位置

  return {
    /** 变更前调用：保存当前 deck 快照（并清空 redo 链）。 */
    snapshot(deck) {
      undoStack = undoStack.slice(0, index + 1); // 截断失效分支
      undoStack.push(structuredClone(deck));
      if (undoStack.length > cap) undoStack.shift();
      index = undoStack.length - 1;
      redoStack = [];
    },
    /** 撤销：返回上一个可撤销点；当前态进入 redo 链。 */
    undo(current) {
      if (index < 0) return null;
      if (current != null) redoStack.push(structuredClone(current));
      index -= 1;
      return structuredClone(undoStack[index + 1]);
    },
    /** 重做：恢复最近一次撤销的当前态。 */
    redo() {
      if (redoStack.length === 0) return null;
      const s = redoStack.pop();
      index += 1;
      return s;
    },
    canUndo: () => index >= 0,
    canRedo: () => redoStack.length > 0,
  };
}
