// editor/interaction/fields.js — declarative field renderer (property panel / table style panel)
// Fields declare kind/label/get/set (num, text, textarea, select, color, checks,
// button, hint); the control factory and commit transaction are supplied by the
// consumer — the property panel snapshots on first commit, the table panel commits
// directly. Fields only declare what to call; the transaction policy stays outside.

import { listColorTokens, resolveColor } from "../../packages/model/index.js";

/** Every theme color token (standard keys first, then custom tokens). Used by all color controls. */
export function themeSwatches(theme) {
  return listColorTokens(theme).map((t) => ({ key: `$${t.key}`, value: resolveColor(theme, t.value) || "#cccccc" }));
}

