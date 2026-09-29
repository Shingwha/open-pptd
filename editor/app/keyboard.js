// ============================================================================
// app/keyboard.js — global shortcuts (Ctrl+Z/Y/S/D/A/G/C/V)
// ----------------------------------------------------------------------------
// Element-level keys (Delete/arrows/Esc layering/[ ] layer order) are handled in
// interaction/canvas.js; the two are complementary.
//   Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y  undo / redo
//   Ctrl+S                          save
//   Ctrl+D                          duplicate selection (offset copy)
//   Ctrl+C / Ctrl+V                 copy / paste (editor-internal clipboard; B6)
//   Ctrl+A                          select all on the current page (U1)
//   Ctrl+G / Ctrl+Shift+G           group / ungroup (U1)
// ============================================================================

export function bindKeyboard({ state, api, io, present }) {
  const ac = new AbortController();
  document.addEventListener("keydown", (e) => {
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
    } else if (mod && key === "d") {
      // Duplicate the selected element (needs a selection; api handles the rest)
      e.preventDefault();
      if (state.selection.size) api.duplicateSelected();
    } else if (mod && key === "c") {
      // Copy into the editor-internal clipboard (used by the context menu "paste" and Ctrl+V; B6)
      e.preventDefault();
      api.copySelected();
    } else if (mod && key === "v") {
      e.preventDefault();
      api.pasteClipboard();
    } else if (mod && key === "a") {
      // Select all on the current page (U1)
      e.preventDefault();
      api.selectAll();
    } else if (mod && key === "g") {
      // Group / ungroup (U1)
      e.preventDefault();
      if (e.shiftKey) api.ungroup();
      else api.group();
    } else if (e.key === "F5") {
      // Present: start a fullscreen show from the current page (PowerPoint muscle memory)
      e.preventDefault();
      present?.start();
    }
  }, { signal: ac.signal });
  return { destroy: () => ac.abort() };
}
