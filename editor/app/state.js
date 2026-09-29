// ============================================================================
// app/state.js — editor state + pure model operations (no DOM)
// ----------------------------------------------------------------------------
// Two responsibilities only: hold the global state, and offer pure model
// mutations (snapshot/selection/delete/layer order). Composite operations that
// also need to re-render (deleteSelected etc.) are wrapped by the api layer.
//
// Selection model (U1):
//   - state.selection: Set<string> — element id set (ordered, last = "most
//     recently selected")
//   - state.selectedId — compatibility accessor: single select returns the only
//     id, multi-select returns the last one, empty returns null; assignment still
//     works (`state.selectedId = null` clears, `= id` single-selects). Legacy
//     call sites need no change.
//   - group elements (elementType:"group") reference member ids via children;
//     selection/hit-testing normalizes to the group (clicking a member = select
//     the group).
// ============================================================================

import { createHistory } from "../interaction/history.js";
import { createPage, nextElementId } from "../../packages/model/index.js";

/** Deep-copy an element and remap elementId / group.children (clone helper). */
function cloneElement(el) {
  const copy = JSON.parse(JSON.stringify(el));
  copy.elementId = nextElementId(el.elementType);
  return copy;
}

/** Deep-copy a whole page and remap every elementId (including group.children refs). */
function clonePage(pg) {
  const copy = JSON.parse(JSON.stringify(pg));
  const map = new Map();
  for (const el of copy.elements || []) {
    const nid = nextElementId(el.elementType);
    map.set(el.elementId, nid);
    el.elementId = nid;
  }
  for (const el of copy.elements || []) {
    if (Array.isArray(el.children)) el.children = el.children.map((cid) => map.get(cid)).filter(Boolean);
  }
  return copy;
}

export function createEditorState() {
  const state = {
    deck: null,
    theme: null,
    currentPage: 0,
    history: createHistory(),
    selection: new Set(), // selected element ids (multi-select)
    _lastSelected: null,  // last id added to the selection (selectedId returns it on multi-select)
    imageMap: {},
    iconMap: {}, // { [iconName]: {inner,w,h} } (icons.js preload cache, shared by render/export)
    pagesPending: new Set(), // pages not yet ready during progressive load (page object refs; survives delete/reorder)
    fontLibrary: {}, // { [family]: { bytes, source: "local"|"url", url, file, subset, embed, size } }
    manifestPath: null, // current project URL (/project/xxx/deck.pptd; a remote URL in deploy mode)
    projectHandle: null, // local project DirectoryHandle (opened via the OS folder picker; IO goes through the handle)
    projectName: "", // local project folder name (shown in the topbar/statusbar)
    dirty: false, // whether the editor has unsaved changes (checked before auto-refresh to avoid losing edits)
    savedDeck: null, // deck baseline from the last load/save (undo/redo back to it = clean)
    clipboard: null, // element clipboard (copySelected snapshot; a page.elements slice)
  };

  // ---- selectedId compatibility accessor (getter returns the primary selection, setter keeps old single-value assignment) ----
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

  /** The group element containing id (member → group; otherwise null). */
  const groupOf = (id) =>
    elements().find((e) => e.elementType === "group" && Array.isArray(e.children) && e.children.includes(id)) || null;

  /** Normalize a selection id to its group: clicking a member = selecting the whole group. */
  const normalizeId = (id) => (id == null ? null : groupOf(id)?.elementId || id);

  /** Bounding box of the selection (shared by multi-select/group; null when empty). */
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

  /** Pure model operations (rendering is composed by the api layer). */
  const ops = {
    beginChange() {
      state.history.snapshot(state.deck);
      state.dirty = true;
    },
    /** Recompute dirty: equality-compare the current deck against the saved baseline (called from the render hook).
     * RP-C / M6: the old special-case amnesty ("passively absorb into the baseline when there was no user edit")
     * is gone — rendering no longer writes back to the model (measurement only feeds layout, see
     * app/view/view.js + dom-measure.js), so render-triggered passive normalization no longer exists and dirty
     * reflects only real content differences (undoing back to the save point marks it clean again). */
    syncDirty() {
      if (!state.savedDeck) return;
      state.dirty = JSON.stringify(state.deck) !== JSON.stringify(state.savedDeck);
    },

    // ---- selection ----
    /** Select. mode: "replace" (default) | "add" (Shift) | "toggle" (Ctrl). */
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
    /** Select all on the current page (group members collapse into the group, so they are not double-counted). */
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

    // ---- mutations ----
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
          for (const cid of el.children) doomed.add(cid); // deleting a group also deletes its members
        }
      }
      const kept = list.filter((e) => !doomed.has(e.elementId));
      if (kept.length === list.length) return;
      page().elements = kept;
      ops.clearSelection();
    },
    /** Copy the selection (including group members); copies go on top of the list and become the selection. Returns the new ids. */
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
    /** Duplicate the selection without offset (Ctrl/Alt drag-copy: the copy starts on top of the original and follows the pointer). */
    duplicateInPlace() {
      return ops.duplicateSelected(0);
    },
    /** Move in layer order. dir = array-index delta; array order is paint order (later = drawn on top):
     *  dir=+1 moves one layer forward (up; the B5 fix — the old up/down labels were inverted vs z-order). */
    moveLayer(dir) {
      const list = elements();
      const idxs = selectedElements()
        .map((el) => list.indexOf(el))
        .filter((i) => i >= 0)
        .sort((a, b) => (dir > 0 ? b - a : a - b)); // move up from high to low, down from low to high, so shifts don't collide
      for (const idx of idxs) {
        const to = idx + dir;
        if (to < 0 || to >= list.length) continue;
        const [el] = list.splice(idx, 1);
        list.splice(to, 0, el);
      }
    },
    /** Bring to front (edge="front") / send to back (edge="back"), relative to the whole page, preserving relative order. */
    moveLayerEdge(edge) {
      const list = elements();
      const picked = selectedElements();
      if (picked.length === 0) return;
      const front = edge !== "back";
      // Keep the original order among the selected items: front takes them front-to-back and appends; back takes them back-to-front and unshifts
      const ordered = picked.slice().sort((a, b) => list.indexOf(a) - list.indexOf(b));
      const seq = front ? ordered : ordered.slice().reverse();
      for (const el of seq) {
        const from = list.indexOf(el);
        if (from < 0) continue;
        list.splice(from, 1);
        if (front) list.push(el);
        else list.unshift(el);
      }
    },

    // ---- clipboard (context menu "paste" / Ctrl+C / Ctrl+V) ----
    /** Copy the selection to the clipboard (including group members, deep copy; returns whether anything was written). */
    copySelected() {
      const picked = selectedElements();
      if (picked.length === 0) return false;
      const ids = new Set(picked.map((el) => el.elementId));
      for (const el of picked) {
        if (el.elementType === "group" && Array.isArray(el.children)) {
          for (const cid of el.children) ids.add(cid);
        }
      }
      const list = elements();
      state.clipboard = list.filter((el) => ids.has(el.elementId)).map((el) => JSON.parse(JSON.stringify(el)));
      return state.clipboard.length > 0;
    },
    /** Paste the clipboard (+24 offset, new elementId, group children remapped), select the new copies and return their ids. */
    pasteClipboard(offset = 24) {
      const clip = Array.isArray(state.clipboard) ? state.clipboard : [];
      if (clip.length === 0) return [];
      // Group member ids (these copies do not enter the selection directly; they are selected with the group)
      const memberIds = new Set();
      for (const src of clip) {
        if (Array.isArray(src.children)) for (const cid of src.children) memberIds.add(cid);
      }
      const map = new Map();
      const copies = clip.map((src) => {
        const copy = JSON.parse(JSON.stringify(src));
        copy.elementId = nextElementId(src.elementType);
        copy.bounds = [copy.bounds[0] + offset, copy.bounds[1] + offset, copy.bounds[2], copy.bounds[3]];
        map.set(src.elementId, copy.elementId);
        return { src, copy };
      });
      const list = elements();
      for (const { copy } of copies) {
        if (Array.isArray(copy.children)) copy.children = copy.children.map((cid) => map.get(cid)).filter(Boolean);
        list.push(copy);
      }
      const topIds = copies.filter(({ src }) => !memberIds.has(src.elementId)).map(({ copy }) => copy.elementId);
      ops.selectMany(topIds);
      return topIds;
    },

    // ---- pages ----
    /** Add a page and switch to it (statusbar + / page-level context menu). */
    addPage() {
      state.deck.pages.push(createPage({}));
      state.currentPage = state.deck.pages.length - 1;
      ops.clearSelection();
      return state.currentPage;
    },
    /** Duplicate pages (deep copy + element id remap), inserted right after each original; returns the new page indexes (ascending). */
    duplicatePages(indexes) {
      const list = state.deck.pages;
      const idxs = [...new Set((indexes || []).filter((i) => Number.isInteger(i) && i >= 0 && i < list.length))].sort((a, b) => a - b);
      if (!idxs.length) return [];
      for (const i of idxs.slice().reverse()) list.splice(i + 1, 0, clonePage(list[i])); // insert back-to-front so earlier indexes stay valid
      // Final position of a copy = original index + 1 + how many copies were inserted before it (= its rank in idxs)
      return idxs.map((i, k) => i + 1 + k);
    },
    /** Delete pages (always keeps at least 1); returns whether anything was deleted. */
    deletePages(indexes) {
      const list = state.deck.pages;
      const doomed = new Set((indexes || []).filter((i) => Number.isInteger(i) && i >= 0 && i < list.length));
      if (!doomed.size || list.length - doomed.size < 1) return false;
      const before = state.currentPage;
      const removedBefore = [...doomed].filter((i) => i < before).length;
      for (const [i, pg] of list.entries()) if (doomed.has(i)) state.pagesPending?.delete(pg);
      const kept = list.filter((_, i) => !doomed.has(i));
      state.deck.pages = kept;
      state.currentPage = Math.max(0, Math.min(kept.length - 1, before - removedBefore));
      ops.clearSelection();
      return true;
    },
    /** Reorder pages (drag-sort): move the page at `from` to `to`; `to` is clamped. */
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

    // ---- grouping ----
    /** Group the current selection (≥2) into a group element; returns the new group id (null on failure). */
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
      list.splice(topIdx + 1, 0, group); // place the group above its members to keep the paint order
      ops.select(group.elementId);
      return group.elementId;
    },
    /** Ungroup: when a single group is selected, dissolve it into its members (member bounds unchanged, round-trip idempotent). */
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
