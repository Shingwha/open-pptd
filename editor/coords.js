// ============================================================================
// coords.js — model / node coordinate conversion (shared by selection box, quickbar positioning etc.)
// ----------------------------------------------------------------------------
// The canvas (#canvas) scales around its center as transform-origin, so the visual
// position of model (0,0) differs from canvas-wrap (0,0); "model coords →
// screen/layer coords" used to be reimplemented at several sites — this is the only
// implementation.
// ============================================================================

/**
 * Model bounds → wrap-layer visual geometry.
 * Uses the rect difference between canvas and wrap as the visual origin (this also
 * cancels the wrap's translate pan and the center-anchored scale offset).
 * @returns {{s:number, left:number, top:number, width:number, height:number}}
 */
export function overlayGeom(canvas, wrap, bounds) {
  const s = canvas._scale || 1;
  const cr = canvas.getBoundingClientRect();
  const wr = wrap.getBoundingClientRect();
  const [x, y, w, h] = bounds;
  return {
    s,
    left: cr.left - wr.left + x * s,
    top: cr.top - wr.top + y * s,
    width: w * s,
    height: h * s,
  };
}

/** Offset rect of rect relative to base (e.g. an element node → the stage coordinate system). */
export function relRect(rect, base) {
  return {
    left: rect.left - base.left,
    top: rect.top - base.top,
    width: rect.width,
    height: rect.height,
  };
}

// ----------------------------------------------------------------------------
// LayoutTree for the current page (RP-C / M6): the single geometric source of
// layout facts. Written by view.js on every canvas paint (paint and the selection
// box read the same tree, so they cannot compute separately); the selection
// box/alignment guides read frames from it instead of measuring the DOM
// (offsetHeight) or recomputing el.bounds. Group shells are not in the LayoutTree
// (layout skips them), so callers fall back when they are missing.
// ----------------------------------------------------------------------------
let _layoutPage = null;

/** Write the current page's LayoutTree.pages[i] (called after every canvas repaint). */
export function setLayoutPage(page) {
  _layoutPage = page || null;
}

/** Look up a LayoutElement by elementId (null when there is no current tree or no match). */
export function layoutElementOf(elementId) {
  if (!_layoutPage || !elementId) return null;
  return _layoutPage.elements?.find((le) => le.elementId === elementId) || null;
}
