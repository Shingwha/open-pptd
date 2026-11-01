// ============================================================================
// app/state.js — editor state + pure model operations (no DOM)
// ----------------------------------------------------------------------------
// Two responsibilities only: hold the state, and offer pure model mutations
// (snapshot/selection/delete/page operations). Composite operations that also
// need to re-render are wrapped by the api layer.
//
// Selection model (minimal editor, editor-ux §3):
//   - state.selection: Set<string> — element id set (ordered, last = "most
//     recently selected"). Every write goes through ops (select/selectMany/
//     selectAll/clearSelection); every read goes through the api surface, whose
//     single derivation is primarySelectedId().
//   - No grouping: group elements are inert shells (their members are hit and
//     transformed as ordinary elements), so selection ids are raw element ids.
//   - Clipboard (copy/cut/paste/duplicate, editor-ux §7): an instance-local array
//     of deep-copied elements. It never references a page and never touches the
//     system clipboard; pasting assigns fresh ids and inserts into the current
//     page. Layer order / arrange stay removed.
// ============================================================================

import { createHistory } from "../interaction/history.js";
import { createPage, nextElementId } from "../../packages/model/index.js";

/**
 * Record the current deck as the saved baseline (a deep copy) and mark the editor
 * clean. Called after a load, a save and "new blank deck" alike (syncDirty
 * equality-compares against this baseline, so undoing back to it counts as no
 * unsaved changes).
 */
export function commitBaseline(state) {
  state.savedDeck = structuredClone(state.deck);
  state.dirty = false;
}

export function createEditorState() {
  const state = {
    deck: null,
    theme: null,
    currentPage: 0,
    history: createHistory(),
    selection: new Set(), // selected element ids (multi-select)
    _lastSelected: null,  // last id added to the selection (returned as primary on multi-select)
    imageMap: {},
    iconMap: {}, // { [iconName]: {inner,w,h} } (icons.js preload cache, shared by render/export)
    pagesPending: new Set(), // pages not yet ready during progressive load (page object refs; survives delete/reorder)
    clipboard: [], // deep copies of copied elements (instance-local; no page/store reference)
    clipboardCascade: 0, // consecutive paste counter: non-in-place paste n gets +16*n (first paste +16)
    fontLibrary: {}, // { [family]: { bytes, source, url, file, subset, embed, size } }
    manifestPath: null, // current project URL (/project/xxx/deck.pptd; a remote URL in deploy mode)
    projectHandle: null, // local project DirectoryHandle (opened via the OS folder picker; IO goes through the handle)
    projectName: "", // local project folder name (shown in the topbar/statusbar)
    dirty: false, // whether the editor has unsaved changes (checked before auto-refresh to avoid losing edits)
    savedDeck: null, // deck baseline from the last load/save (undo/redo back to it = clean)
  };

  const page = () => state.deck.pages[state.currentPage];
  const elements = () => page().elements || [];

  /**
   * Primary selection id — the single definition of the "current element id" read
   * (single select → the only id; multi → the most recently added, otherwise the
   * last iterated; empty → null). Exposed through api.getSelected.
   */
  const primarySelectedId = () => {
    if (state.selection.size === 0) return null;
    if (state.selection.size === 1) return state.selection.values().next().value;
    if (state._lastSelected && state.selection.has(state._lastSelected)) return state._lastSelected;
    let last = null;
    for (const id of state.selection) last = id;
    return last;
  };

  const selected = () => elements().find((el) => el.elementId === primarySelectedId()) || null;

  /** All selected elements (in selection order; ids absent from the page are skipped). */
  const selectedElements = () => {
    const list = elements();
    const out = [];
    for (const id of state.selection) {
      const el = list.find((e) => e.elementId === id);
      if (el) out.push(el);
    }
    return out;
  };

  /**
   * Insert fresh copies of `clones` into the current page: each gets a new
   * elementId and a bounds offset on both axes, then the pasted ids become the
   * selection. Callers wrap this in one beginChange() (one undo step per paste).
   */
  function pasteClones(clones, offset) {
    if (!Array.isArray(clones) || clones.length === 0) return [];
    const ids = [];
    for (const source of clones) {
      const el = structuredClone(source);
      el.elementId = nextElementId();
      if (Array.isArray(el.bounds)) {
        el.bounds[0] = (Number(el.bounds[0]) || 0) + offset;
        el.bounds[1] = (Number(el.bounds[1]) || 0) + offset;
      }
      page().elements.push(el);
      ids.push(el.elementId);
    }
    ops.selectMany(ids, "replace");
    return ids;
  }

  /** Pure model operations (rendering is composed by the api layer). */
  const ops = {
    beginChange() {
      state.history.snapshot(state.deck);
      state.dirty = true;
    },
    /**
     * Recompute dirty: equality-compare the current deck against the saved baseline
     * (called from the render hook). Rendering never writes back to the model, so
     * dirty reflects only real content differences (undoing back to the save point
     * marks it clean again).
     */
    syncDirty() {
      if (!state.savedDeck) return;
      state.dirty = JSON.stringify(state.deck) !== JSON.stringify(state.savedDeck);
    },

    // ---- selection ----
    /** Select. mode: "replace" (default) | "add" (Shift) | "toggle" (Ctrl). */
    select(id, mode = "replace") {
      if (id == null) {
        ops.clearSelection();
        return;
      }
      if (mode === "add") {
        state.selection.add(id);
        state._lastSelected = id;
      } else if (mode === "toggle") {
        if (state.selection.has(id)) {
          state.selection.delete(id);
          if (state._lastSelected === id) {
            state._lastSelected = null;
            for (const sid of state.selection) state._lastSelected = sid;
          }
        } else {
          state.selection.add(id);
          state._lastSelected = id;
        }
      } else {
        state.selection = new Set([id]);
        state._lastSelected = id;
      }
    },
    selectMany(ids, mode = "replace") {
      const targets = [...new Set((ids || []).filter(Boolean))];
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
    /** Select all on the current page. */
    selectAll() {
      const ids = elements().map((el) => el.elementId);
      state.selection = new Set(ids);
      state._lastSelected = ids.length ? ids[ids.length - 1] : null;
    },
    isSelected(id) {
      return state.selection.has(id);
    },

    // ---- mutations ----
    /** Append an element to the current page (add menu / type pickers). Selecting it is a separate op. */
    addElement(el) {
      page().elements.push(el);
    },
    /** Install a deck as the current document (load / new blank / undo-redo all share it); the surrounding resets stay with the caller. */
    replaceDeck(deck) {
      state.deck = deck;
    },
    updateSelected(patch) {
      for (const el of selectedElements()) Object.assign(el, patch);
    },
    deleteSelected() {
      const ids = new Set(state.selection);
      if (ids.size === 0) return;
      const list = elements();
      const kept = list.filter((e) => !ids.has(e.elementId));
      if (kept.length === list.length) return;
      page().elements = kept;
      ops.clearSelection();
    },

    // ---- clipboard (copy / cut / paste / duplicate; editor-ux §7) ----
    /**
     * Deep-copy the selected elements into the instance clipboard. The deck is
     * untouched (no snapshot, no dirty flag); a fresh copy restarts the paste
     * cascade. Returns the copied element count.
     */
    copySelected() {
      const picked = selectedElements();
      if (picked.length === 0) return 0; // nothing selected: keep the existing clipboard
      state.clipboard = structuredClone(picked);
      state.clipboardCascade = 0;
      return state.clipboard.length;
    },
    /** Copy + delete the selection as one undo step; returns the cut count. */
    cutSelected() {
      const count = ops.copySelected();
      if (count === 0) return 0;
      ops.beginChange();
      ops.deleteSelected();
      return count;
    },
    /**
     * Paste the clipboard into the current page as one undo step. Non-in-place
     * pastes cascade +16px per paste on both axes (first +16, then +32…);
     * inPlace (Ctrl+Shift+V) keeps the original bounds and does not advance the
     * cascade. Returns the new element ids.
     */
    pasteClipboard({ inPlace = false } = {}) {
      if (state.clipboard.length === 0) return [];
      ops.beginChange();
      const offset = inPlace ? 0 : 16 * (state.clipboardCascade + 1);
      if (!inPlace) state.clipboardCascade += 1;
      return pasteClones(state.clipboard, offset);
    },
    /**
     * Duplicate the selection (+16px, one undo step) from a temporary snapshot:
     * the user clipboard and its cascade are left untouched.
     */
    duplicateSelected() {
      const picked = selectedElements();
      if (picked.length === 0) return [];
      ops.beginChange();
      return pasteClones(structuredClone(picked), 16);
    },
    clearClipboard() {
      state.clipboard = [];
      state.clipboardCascade = 0;
    },
    hasClipboard() {
      return state.clipboard.length > 0;
    },
    getClipboardCount() {
      return state.clipboard.length;
    },

    // ---- pages (single page operations; editor-ux §2) ----
    /** Insert a blank page at `at` (clamped) and switch to it; returns the new index. */
    insertPage(at) {
      const list = state.deck.pages;
      const index = Math.max(0, Math.min(list.length, Number.isInteger(at) ? at : state.currentPage + 1));
      list.splice(index, 0, createPage({}));
      state.currentPage = index;
      ops.clearSelection();
      return index;
    },
    /** Delete page `index` (always keeps at least one); current page follows. Returns whether a page was deleted. */
    deletePage(index) {
      const list = state.deck.pages;
      const i = Number.isInteger(index) ? index : state.currentPage;
      if (i < 0 || i >= list.length || list.length <= 1) return false;
      const [removed] = list.splice(i, 1);
      state.pagesPending?.delete(removed);
      if (state.currentPage > i) state.currentPage -= 1;
      else if (state.currentPage === i) state.currentPage = Math.min(i, list.length - 1);
      ops.clearSelection();
      return true;
    },
    /** Reorder pages (drag-sort): move the page at `from` to `to`; `to` is clamped. The current page follows the moved page. */
    movePage(from, to) {
      const list = state.deck.pages;
      if (!Number.isInteger(from) || from < 0 || from >= list.length) return false;
      const target = Math.max(0, Math.min(list.length - 1, to));
      if (target === from) return false;
      const [pg] = list.splice(from, 1);
      list.splice(target, 0, pg);
      state.currentPage = target;
      return true;
    },
  };

  return { state, page, elements, selected, primarySelectedId, selectedElements, ops };
}
