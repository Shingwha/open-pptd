// ============================================================================
// app/keyboard.js — 全局快捷键（Ctrl+Z / Ctrl+Y / Ctrl+S）
// ----------------------------------------------------------------------------
// 元素级按键（Delete/方向键）在 editor/canvas.js 内处理，两者互补。
// ============================================================================

export function bindKeyboard({ state, api, io, present }) {
  document.addEventListener("keydown", (e) => {
    // 放映中：按键全部由放映层接管（翻页/黑屏/退出），编辑器快捷键不响应
    if (present?.isActive()) return;
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;
    const key = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && key === "z" && !e.shiftKey) {
      e.preventDefault();
      io.applyHistory(state.history.undo(state.deck));
    } else if ((e.ctrlKey || e.metaKey) && (key === "y" || (key === "z" && e.shiftKey))) {
      e.preventDefault();
      io.applyHistory(state.history.redo());
    } else if ((e.ctrlKey || e.metaKey) && key === "s") {
      e.preventDefault();
      io.saveProject();
    } else if ((e.ctrlKey || e.metaKey) && key === "d") {
      // 复制选中元素（需有选中元素；api 内部处理）
      e.preventDefault();
      if (state.selectedId) api.duplicateSelected();
    } else if (e.key === "F5") {
      // 放映：从当前页开始全屏演示（PowerPoint 习惯键）
      e.preventDefault();
      present?.start();
    }
  });
}
