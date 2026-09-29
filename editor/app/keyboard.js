// ============================================================================
// app/keyboard.js — 全局快捷键（Ctrl+Z/Y/S/D/A/G/C/V）
// ----------------------------------------------------------------------------
// 元素级按键（Delete/方向键/Esc 分层/] [ 层序）在 interaction/canvas.js 内处理，两者互补。
//   Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y  撤销 / 重做
//   Ctrl+S                          保存
//   Ctrl+D                          复制选中（偏移副本）
//   Ctrl+C / Ctrl+V                 复制 / 粘贴（编辑器内部剪贴板；B6）
//   Ctrl+A                          全选当前页（U1）
//   Ctrl+G / Ctrl+Shift+G           组合 / 取消组合（U1）
// ============================================================================

export function bindKeyboard({ state, api, io, present }) {
  const ac = new AbortController();
  document.addEventListener("keydown", (e) => {
    // 放映中：按键全部由放映层接管（翻页/黑屏/退出），编辑器快捷键不响应
    if (present?.isActive()) return;
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;
    const key = e.key.toLowerCase();
    const mod = e.ctrlKey || e.metaKey;
    if (mod && key === "z" && !e.shiftKey) {
      e.preventDefault();
      io.applyHistory(state.history.undo(state.deck));
    } else if (mod && (key === "y" || (key === "z" && e.shiftKey))) {
      e.preventDefault();
      io.applyHistory(state.history.redo());
    } else if (mod && key === "s") {
      e.preventDefault();
      io.saveProject();
    } else if (mod && key === "d") {
      // 复制选中元素（需有选中元素；api 内部处理）
      e.preventDefault();
      if (state.selection.size) api.duplicateSelected();
    } else if (mod && key === "c") {
      // 复制到编辑器内部剪贴板（右键菜单「粘贴」与 Ctrl+V 用，B6）
      e.preventDefault();
      api.copySelected();
    } else if (mod && key === "v") {
      e.preventDefault();
      api.pasteClipboard();
    } else if (mod && key === "a") {
      // 全选当前页（U1）
      e.preventDefault();
      api.selectAll();
    } else if (mod && key === "g") {
      // 组合 / 取消组合（U1）
      e.preventDefault();
      if (e.shiftKey) api.ungroup();
      else api.group();
    } else if (e.key === "F5") {
      // 放映：从当前页开始全屏演示（PowerPoint 习惯键）
      e.preventDefault();
      present?.start();
    }
  }, { signal: ac.signal });
  return { destroy: () => ac.abort() };
}
