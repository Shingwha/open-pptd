// ============================================================================
// app/keyboard.js — global shortcuts (Ctrl+Z / Ctrl+Y / Ctrl+S / Ctrl+A / F5)
// ----------------------------------------------------------------------------
// Element-level keys (Delete/Backspace, arrows, Esc layering) are handled in
// interaction/canvas.js; this module only owns the app-level shortcuts that must
// work regardless of the focused widget:
//   Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y  undo / redo
//   Ctrl+S                          save
//   Ctrl+A                          select all on the current page
//   F5                              present
// The old editing shortcuts (Ctrl+C/V/D/G, ] [) went away with the minimal
// editor (editor-ux §7): no clipboard, duplicate, grouping or layer ordering.
// ============================================================================

export function bindKeyboard({ state, api, io, present, ui }) {
  const ac = new AbortController();
  document.addEventListener("keydown", (e) => {
    // Two instances on one page: only the one the user last interacted with acts on shortcuts
    if (ui && !ui.isActive()) return;
    // While presenting, the present layer owns all keys (page/blackout/exit); editor shortcuts stay quiet
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
    } else if (mod && key === "a") {
      // Select all on the current page
      e.preventDefault();
      api.selectAll();
    } else if (e.key === "F5") {
      // Present: start a fullscreen show from the current page
      e.preventDefault();
      present?.start();
    }
  }, { signal: ac.signal });
  return { destroy: () => ac.abort() };
}
