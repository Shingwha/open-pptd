// editor/app/keyboard.js — global shortcuts (undo/redo, save, select-all, clipboard, F5)
// App-level shortcuts that work regardless of the focused widget. Typing targets
// (input/textarea/select/contenteditable) keep native clipboard behavior; present
// mode owns all keys while active, and only the last-interacted instance reacts.
// Element-level keys (Delete/arrows/Esc layering) are handled in interaction/canvas.js.

export function bindKeyboard({ state, api, io, present, ui }) {
  const ac = new AbortController();
  document.addEventListener("keydown", (e) => {
    // Two instances on one page: only the one the user last interacted with acts on shortcuts
    if (ui && !ui.isActive()) return;
    // While presenting, the present layer owns all keys (page/blackout/exit); editor shortcuts stay quiet
    if (present?.isActive()) return;
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable) return;
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
    } else if (mod && key === "c") {
      e.preventDefault();
      api.copySelected();
    } else if (mod && key === "x") {
      e.preventDefault();
      api.cutSelected();
    } else if (mod && key === "v") {
      e.preventDefault();
      api.pasteClipboard({ inPlace: e.shiftKey });
    } else if (mod && key === "d") {
      e.preventDefault();
      api.duplicateSelected();
    } else if (e.key === "F5") {
      // Present: start a fullscreen show from the current page
      e.preventDefault();
      present?.start();
    }
  }, { signal: ac.signal });
  return { destroy: () => ac.abort() };
}
