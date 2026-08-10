// ============================================================================
// app/keyboard.js — 全局快捷键（Ctrl+Z / Ctrl+Y / Ctrl+S）
// ----------------------------------------------------------------------------
// 元素级按键（Delete/方向键）在 editor/canvas.js 内处理，两者互补。
// ============================================================================

export function bindKeyboard({ state, api, io }) {
  document.addEventListener("keydown", (e) => {
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
    }
  });
}
