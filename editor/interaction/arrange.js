// ============================================================================
// interaction/arrange.js — arrangement algorithms (align / distribute / group translation)
// ----------------------------------------------------------------------------
// The property panel (ambiguous align semantics) and the context menu
// ("align to selection ▸ / distribute horizontally / vertically") share this one
// implementation so the two never drift:
//   single selection  → relative to the page (PAGE_WIDTH/HEIGHT)
//   multi selection   → relative to the selection's bounding box
// Group elements (elementType:"group") translate together with their children.
// ============================================================================

import { PAGE_HEIGHT, PAGE_WIDTH } from "../../packages/model/index.js";

/** Members of a group element (empty for non-groups). list = current page elements. */
function groupMembers(el, list) {
  if (el?.elementType !== "group" || !Array.isArray(el.children)) return [];
  return el.children.map((id) => list.find((e) => e.elementId === id)).filter(Boolean);
}

/** Translate an element (including group members). */
export function translate(el, dx, dy, list) {
  el.bounds[0] += dx;
  el.bounds[1] += dy;
  for (const m of groupMembers(el, list)) translate(m, dx, dy, list);
}

/** Bounding box [x, y, w, h] of a selection. */
function unionBounds(els) {
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const el of els) {
    const b = el.bounds;
    x1 = Math.min(x1, b[0]);
    y1 = Math.min(y1, b[1]);
    x2 = Math.max(x2, b[0] + b[2]);
    y2 = Math.max(y2, b[1] + b[3]);
  }
  return [x1, y1, x2 - x1, y2 - y1];
}

/** Six-way align (mode: left/hcenter/right/top/vcenter/bottom). */
export function alignSelection(els, mode, list) {
  const ref = els.length > 1 ? unionBounds(els) : [0, 0, PAGE_WIDTH, PAGE_HEIGHT];
  for (const el of els) {
    const [bx, by, bw, bh] = el.bounds;
    let dx = 0;
    let dy = 0;
    if (mode === "left") dx = ref[0] - bx;
    else if (mode === "hcenter") dx = Math.round(ref[0] + (ref[2] - bw) / 2) - bx;
    else if (mode === "right") dx = ref[0] + ref[2] - bw - bx;
    else if (mode === "top") dy = ref[1] - by;
    else if (mode === "vcenter") dy = Math.round(ref[1] + (ref[3] - bh) / 2) - by;
    else if (mode === "bottom") dy = ref[1] + ref[3] - bh - by;
    translate(el, dx, dy, list);
  }
}

/** Distribute (≥3 selected): axis "h" horizontal / "v" vertical; the two ends stay put. */
export function distribute(els, axis, list) {
  if (els.length < 3) return;
  const size = axis === "h" ? 2 : 3;
  const start = axis === "h" ? 0 : 1;
  const sorted = [...els].sort((a, b) => a.bounds[start] + a.bounds[size] / 2 - (b.bounds[start] + b.bounds[size] / 2));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const spanStart = first.bounds[start];
  const spanEnd = last.bounds[start] + last.bounds[size];
  const totalSize = sorted.reduce((s, e) => s + e.bounds[size], 0);
  const gap = (spanEnd - spanStart - totalSize) / (sorted.length - 1);
  // If the items are wider than the end-to-end span (negative gap), do nothing:
  // re-laying them out with a negative gap stacks them, a destructive result
  // (PowerPoint refuses such a distribution too).
  if (gap < 0) return;
  let cursor = spanStart + first.bounds[size];
  for (let i = 1; i < sorted.length - 1; i += 1) {
    const el = sorted[i];
    const target = Math.round(cursor + gap);
    const d = target - el.bounds[start];
    if (axis === "h") translate(el, d, 0, list);
    else translate(el, 0, d, list);
    cursor = target + el.bounds[size];
  }
}

/** Align modes (for the context-menu submenu; glyphs match the property-panel buttons). */
export const ALIGN_MODES = [
  ["left", "←", "左对齐"],
  ["hcenter", "↔", "水平居中"],
  ["right", "→", "右对齐"],
  ["top", "↑", "顶对齐"],
  ["vcenter", "↕", "垂直居中"],
  ["bottom", "↓", "底对齐"],
];
