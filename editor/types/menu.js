// ============================================================================
// types/menu.js — add-menu data source (derived from the registry)
// ----------------------------------------------------------------------------
// Every type's `menu` declaration is collected into ADD_ITEMS (id → item):
//   - interaction/add-menu.js resolves items by id (basic cards / chart grid /
//     recent items)
//   - the shape catalog is derived directly from SUPPORTED_SHAPES by add-menu.js
//     (icons via the FA browser) — the 187 shapes are not declared one by one
// ============================================================================

import { allTypes } from "../../packages/model/index.js";

/** All menu items (id → item; item is either { create } or carries its own onClick). */
export function buildAddItems() {
  const items = {};
  for (const t of allTypes()) {
    for (const it of t.menu?.items || []) items[it.id] = it;
  }
  return items;
}
