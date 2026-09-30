// ============================================================================
// interaction/align-guides.js — PowerPoint-style smart alignment (pure math)
// ----------------------------------------------------------------------------
// Given the dragged (or resized) rectangle and the candidate targets (other
// elements' bounds + the page center/edges), find the nearest alignment within
// a threshold per axis. The caller converts the screen-px threshold to deck px
// (threshold / scale) and renders the returned guides while the gesture runs.
//
// Pure module: no DOM access, importable from Node regression tests.
// ============================================================================

export const SNAP_SCREEN_PX = 5; // snap radius in screen px (caller divides by the canvas scale)

/**
 * Move snap: align any of the rect's left/centerX/right (top/centerY/bottom) to
 * any target x (y) within threshold. Returns the delta to apply plus the guide lines.
 * @param rect      {x, y, w, h} in deck px (the selection bounding box at the probe position)
 * @param others    [{x, y, w, h}] other elements' bounds
 * @param page      {w, h} page size in deck px
 * @param threshold deck-px snap radius
 * @param axes      optional {x, y} — only these axes participate (default both). An axis with
 *                  no real movement stays out, otherwise its zero-delta coincidences would draw
 *                  guide lines on every drag (e.g. a shared left margin).
 * @returns {{dx: number, dy: number, guides: [{axis: "x"|"y", pos: number}]}}
 */
export function snapMove(rect, others, page, threshold, axes = { x: true, y: true }) {
  const tx = axes.x ? targetAxis(others, page, (o) => [o.x, o.x + o.w / 2, o.x + o.w], page.w) : [];
  const ty = axes.y ? targetAxis(others, page, (o) => [o.y, o.y + o.h / 2, o.y + o.h], page.h) : [];
  const sx = axes.x ? [rect.x, rect.x + rect.w / 2, rect.x + rect.w] : [];
  const sy = axes.y ? [rect.y, rect.y + rect.h / 2, rect.y + rect.h] : [];
  const bx = bestSnap(sx, tx, threshold);
  const by = bestSnap(sy, ty, threshold);
  return {
    dx: bx ? bx.delta : 0,
    dy: by ? by.delta : 0,
    guides: [
      ...(bx ? [{ axis: "x", pos: bx.pos }] : []),
      ...(by ? [{ axis: "y", pos: by.pos }] : []),
    ],
  };
}

/**
 * Resize snap: only the moving edges participate (x: "e"|"w"|null, y: "s"|"n"|null).
 * Returns the edge delta (positive = rightward/downward) plus guides.
 * @param box  {x, y, w, h} candidate box after the raw resize
 * @param edges {x, y} which edges are moving
 */
export function snapResize(box, edges, others, page, threshold) {
  const guides = [];
  let dx = 0;
  let dy = 0;
  if (edges.x) {
    const tx = targetAxis(others, page, (o) => [o.x, o.x + o.w / 2, o.x + o.w], page.w);
    const edgeVal = edges.x === "e" ? box.x + box.w : box.x;
    const b = bestSnap([edgeVal], tx, threshold);
    if (b) {
      dx = b.delta;
      guides.push({ axis: "x", pos: b.pos });
    }
  }
  if (edges.y) {
    const ty = targetAxis(others, page, (o) => [o.y, o.y + o.h / 2, o.y + o.h], page.h);
    const edgeVal = edges.y === "s" ? box.y + box.h : box.y;
    const b = bestSnap([edgeVal], ty, threshold);
    if (b) {
      dy = b.delta;
      guides.push({ axis: "y", pos: b.pos });
    }
  }
  return { dx, dy, guides };
}

/** Candidate coordinates for one axis: page edges + center + every other's edges/center. */
function targetAxis(others, page, pick, pageLen) {
  const vals = [0, pageLen / 2, pageLen];
  for (const o of others) vals.push(...pick(o));
  return vals;
}

/** Nearest (self value, target value) pair within threshold; ties keep the first found. */
function bestSnap(selfVals, targetVals, threshold) {
  let best = null;
  for (const sv of selfVals) {
    for (const tv of targetVals) {
      const d = tv - sv;
      if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.delta))) {
        best = { delta: d, pos: tv };
      }
    }
  }
  return best;
}
