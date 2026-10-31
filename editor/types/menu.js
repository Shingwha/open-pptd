// ============================================================================
// types/menu.js — add-menu data source (derived from the TypeManifest registry)
// ----------------------------------------------------------------------------
// Every type's `menu` declaration is collected into ADD_ITEMS (id → item):
//   - interaction/add-menu.js resolves items by id (basic cards / chart grid /
//     recent items)
//   - the shape catalog is derived directly from SUPPORTED_SHAPES by add-menu.js
//     (icons via the FA browser) — the 187 shapes are not declared one by one
//
// The type set comes from the model manifest (allTypes() is seeded from
// packages/model/types/), so adding a type changes the model side first. The 3.0
// boundary keeps only content-editor types (contentEditor:true in the manifest:
// text/table/chart); contentEditorTypeIds() is the shared derivation for the
// editor/UI waves, while the remaining menu/create/props shards are removed in W7.
// ============================================================================

import { allTypes } from "../../packages/model/index.js";

/** Manifest type ids that declare a content editor (contentEditor:true). */
export function contentEditorTypeIds() {
  return allTypes()
    .filter((t) => t.contentEditor === true)
    .map((t) => t.id);
}

/** All menu items (id → item; item is either { create } or carries its own onClick). */
export function buildAddItems() {
  const items = {};
  for (const t of allTypes()) {
    for (const it of t.menu?.items || []) items[it.id] = it;
  }
  return items;
}
