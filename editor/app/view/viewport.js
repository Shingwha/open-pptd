// ============================================================================
// app/view/viewport.js — canvas viewport: zoom/pan state + transform application
// ----------------------------------------------------------------------------
// Touch pinch / Ctrl+wheel / the zoom control / dragging outside the canvas to pan
// (interaction/stage.js) all enter through setZoom / panBy here; the pan amount is
// applied to canvas-wrap (screen pixels) and does not affect element hit-testing
// or export. 1 = fit to viewport.
// ============================================================================

import { deckSize as deckSizeOf } from "../../../packages/model/index.js";

/** Deck canvas size (falls back to 960×540 when size is missing); fit scaling and pan clamping use the real ratio. */
export function deckSize(state) {
  return deckSizeOf(state.deck);
}

export function createViewport({ stage, canvas, wrap, zoomLabel, controller, repaint, getSize }) {
  let zoom = 1;
  let panX = 0;
  let panY = 0;
  const ZOOM_MIN = 0.25;
  const ZOOM_MAX = 4;
  // Pan slack: how far the canvas can still be nudged when it is smaller than the stage (fit state)
  const PAN_SLACK = 60;

  /**
   * Anchor zoom: the content point under anchor (client coords) stays put across
   * the zoom. A pinch uses the midpoint of the two fingers, Ctrl+wheel the cursor
   * position; with no anchor it zooms around the canvas center.
   * Derivation: pan' = pan·k + (anchor − stage center)·(1 − k), k = new/old zoom ratio.
   */
  function setZoom(z, anchor) {
    const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
    if (anchor) {
      const r = stage.getBoundingClientRect();
      const k = next / zoom;
      panX = panX * k + (anchor.x - r.left - r.width / 2) * (1 - k);
      panY = panY * k + (anchor.y - r.top - r.height / 2) * (1 - k);
    }
    zoom = next;
    repaint(); // ratio changed → rebuild the canvas (DOM decided by the caller)
    renderZoom();
  }

  function panBy(dx, dy) {
    panX += dx;
    panY += dy;
    applyScale(); // only reset the transform, no page DOM rebuild — affordable per drag frame
  }

  // Restore to fit view: zero both zoom and pan
  function zoomReset() {
    panX = 0;
    panY = 0;
    setZoom(1);
  }

  // Zoom control percentage display
  function renderZoom() {
    if (zoomLabel) zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
  }

  function fitScale() {
    const [pw, ph] = getSize();
    const w = Math.max(320, stage.clientWidth - 64);
    const h = Math.max(200, stage.clientHeight - 64);
    return Math.min(w / pw, h / ph, 1.2);
  }

  // Compute and apply the canvas scale (fitScale × zoom → transform + controller sync).
  // Pan clamping is executed here in one place: the part of the canvas beyond the
  // stage can be dragged to the edge, the part within (fit state) allows only a
  // slight ±PAN_SLACK nudge, so the canvas is never dragged out of view
  function applyScale() {
    const [pw, ph] = getSize();
    const s = fitScale() * zoom;
    const mx = Math.max(0, (pw * s - stage.clientWidth) / 2 + PAN_SLACK);
    const my = Math.max(0, (ph * s - stage.clientHeight) / 2 + PAN_SLACK);
    panX = Math.min(mx, Math.max(-mx, panX));
    panY = Math.min(my, Math.max(-my, panY));
    canvas.style.transform = `scale(${s})`;
    wrap.style.transform = `translate(${panX}px, ${panY}px)`;
    controller.setScale(s);
  }

  // Recompute the scale every frame while the panel width animates:
  // collapsing/expanding on desktop changes .inspector width via CSS and the stage
  // widens with it; computing once at the animation start would detach the canvas
  // size from the stage (a visual jump). Each frame only updates the transform, no
  // page DOM rebuild, so the cost is negligible.
  let scaleRaf = 0;
  function followStageWidth(duration = 260) {
    cancelAnimationFrame(scaleRaf);
    const t0 = performance.now();
    const tick = () => {
      applyScale();
      if (performance.now() - t0 < duration) scaleRaf = requestAnimationFrame(tick);
    };
    scaleRaf = requestAnimationFrame(tick);
  }

  return {
    setZoom,
    panBy,
    zoomReset,
    renderZoom,
    applyScale,
    followStageWidth,
    zoomIn: () => setZoom(zoom * 1.25),
    zoomOut: () => setZoom(zoom / 1.25),
    getZoom: () => zoom,
    /** Release: cancel the in-flight width-follow animation (no window-level listeners). */
    destroy() {
      cancelAnimationFrame(scaleRaf);
    },
  };
}
