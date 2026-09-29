// ============================================================================
// interaction/history.js — undo/redo (undo chain + redo chain)
// ----------------------------------------------------------------------------
// Semantics:
//   - snapshot is called *before* a change; the pre-change state is pushed onto
//     the undo chain (a restorable point);
//   - undo(current) pushes the current state onto the redo chain and returns to
//     the most recent restorable point;
//   - redo() pops the redo chain and restores it; a new operation (snapshot)
//     clears the redo chain.
// This makes the first change undoable and keeps undo/redo strictly paired.
// ============================================================================

export function createHistory(cap = 60) {
  let undoStack = [];
  let redoStack = [];
  let index = -1; // current baseline position within the undo chain

  return {
    /** Call before a change: store the current deck snapshot (and clear the redo chain). */
    snapshot(deck) {
      undoStack = undoStack.slice(0, index + 1); // drop the invalidated branch
      undoStack.push(structuredClone(deck));
      if (undoStack.length > cap) undoStack.shift();
      index = undoStack.length - 1;
      redoStack = [];
    },
    /** Undo: return the previous restorable point; the current state enters the redo chain. */
    undo(current) {
      if (index < 0) return null;
      if (current != null) redoStack.push(structuredClone(current));
      index -= 1;
      return structuredClone(undoStack[index + 1]);
    },
    /** Redo: restore the most recently undone state. */
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
