// editor/app/view/viewport.js — canvas viewport: zoom/pan state + transform application
// Pinch / Ctrl+wheel / the zoom control / stage panning all enter through
// setZoom / panBy; the pan is applied to canvas-wrap in screen pixels and never
// affects hit-testing or export. zoom 1 = fit to viewport.

import { deckSize as deckSizeOf } from "../../../packages/model/index.js";

/** Deck canvas size (falls back to 960×540 when size is missing); fit scaling and pan clamping use the real ratio. */
export function deckSize(state) {
  return deckSizeOf(state.deck);
}

export function createViewport({ stage, canvas, wrap, zoomLabel, controller, repaint, getSize, fitPadding = 64, fitMinW = 320, fitMinH = 200 }) {
  let zoom = 1;
  let panX = 0;
  let panY = 0;
  const ZOOM_MIN = 0.25;
  const ZOOM_MAX = 4;
  // Pan slack: how far the canvas can still be nudged when it is smaller than the stage (fit state)
  const PAN_SLACK = 60;

  // Stage box cache. renderCanvas() sets the canvas size and then calls applyScale();
  // reading stage.clientWidth/clientHeight there forces a synchronous layout on every
  // render (the dominant cost in the JS profile). The box is measured once and
  // invalidated whenever the stage size can change: ResizeObserver, window resize,
  // and the width-follow animation. A cached 0 (hidden mount) is never trusted.
  let boxW = -1;
  let boxH = -1;
  const ac = new AbortController();

  function stageBox() {
    if (boxW <= 0) {
      boxW = stage.clientWidth;
      boxH = stage.clientHeight;
    }
    return { w: boxW, h: boxH };
  }

  function invalidateBox() {
    boxW = -1;
    boxH = -1;
  }

  if (typeof ResizeObserver !== "undefined" && stage) {
    // Size changes (window resize, Design drawer, host layout) re-fit the transform;
    // the page DOM is untouched, so no repaint is involved.
    const ro = new ResizeObserver(() => {
      invalidateBox();
      if (canvas && stage.clientWidth > 0) applyScale();
    });
    ro.observe(stage);
    ac.signal.addEventListener("abort", () => ro.disconnect(), { once: true });
  }
  if (typeof window !== "undefined") {
    // Synchronous fallback for the frame between the resize and the observer callback
    window.addEventListener("resize", invalidateBox, { signal: ac.signal });
  }

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
    // Editor/viewer: leave a 64px breathing margin (with a small-stage floor). Embedded
    // previews (gallery covers) fit the host box exactly: padding 0 and no floor.
    const { w: sw, h: sh } = stageBox();
    const w = Math.max(fitMinW, sw - fitPadding);
    const h = Math.max(fitMinH, sh - fitPadding);
    return Math.min(w / pw, h / ph, 1.2);
  }

  // Compute and apply the canvas scale (fitScale × zoom → transform + controller sync).
  // Pan clamping is executed here in one place: the part of the canvas beyond the
  // stage can be dragged to the edge, the part within (fit state) allows only a
  // slight ±PAN_SLACK nudge, so the canvas is never dragged out of view
  function applyScale() {
    const [pw, ph] = getSize();
    const { w: sw, h: sh } = stageBox();
    const w = Math.max(fitMinW, sw - fitPadding);
    const h = Math.max(fitMinH, sh - fitPadding);
    const s = Math.min(w / pw, h / ph, 1.2) * zoom;
    const mx = Math.max(0, (pw * s - sw) / 2 + PAN_SLACK);
    const my = Math.max(0, (ph * s - sh) / 2 + PAN_SLACK);
    panX = Math.min(mx, Math.max(-mx, panX));
    panY = Math.min(my, Math.max(-my, panY));
    canvas.style.transform = `scale(${s})`;
    wrap.style.transform = `translate(${panX}px, ${panY}px)`;
    controller?.setScale(s);
  }

  // Recompute the scale every frame while a width transition animates: the Design
  // drawer changes the stage width via CSS, and computing once at the start would
  // detach the canvas size from the stage. Each frame only updates the transform.
  let scaleRaf = 0;
  function followStageWidth(duration = 260) {
    cancelAnimationFrame(scaleRaf);
    invalidateBox(); // the transition is changing the stage box: measure every frame
    const t0 = performance.now();
    const tick = () => {
      invalidateBox();
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
    /** Release: cancel the in-flight width-follow animation and size listeners (no leaks). */
    destroy() {
      cancelAnimationFrame(scaleRaf);
      ac.abort();
    },
  };
}
