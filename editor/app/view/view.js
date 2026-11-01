// editor/app/view/view.js — render orchestration (canvas / thumbnail bar / buttons)
// Full refresh is render(); renderCanvas / renderThumbnails / updateButtons can be
// called individually. Viewport (zoom/pan) and thumbnails are split into
// viewport.js / thumbnails.js. Two assemblies share this module: createView (preview
// editable:false, editor editable:true) and createPageView (headless paint surface:
// one page at deck size, scale 1, pixel-stable golden output).

import { createViewport, deckSize } from "./viewport.js";
import { createThumbnails } from "./thumbnails.js";
import { layout } from "../../../packages/layout/index.js";
import { paintPage } from "../../../packages/renderer/index.js";
import { paintModelPage } from "../paint-page.js";

export function createView({ state, page, api, controller = null, getController = null, ops, ui, editable = true, coords, fitPadding = 64, fitMinW = 320, fitMinH = 200 }) {
  // Editor assembly attaches the selection controller after the view exists (the
  // preview core builds the view first); this accessor keeps one source of truth.
  const ctl = () => (getController ? getController() : controller);
  const { dom, toast } = ui;
  // Under strict mode a bare render() call has this === undefined, so self-reference through viewObj
  const viewObj = {};

  // Out-of-bounds hint dedupe (remember the last count per page; the same state does not re-toast)
  const lastOverflow = new Map();
  let overflowDeck = null;

  // Viewport: zoom/pan state and transform application. A zoom change needs a
  // canvas rebuild, while panning only changes the transform — the repaint
  // callback is injected here. controller is null in the preview assembly.
  const viewport = createViewport({
    stage: dom.stage,
    canvas: dom.canvas,
    wrap: dom.canvasWrap,
    zoomLabel: dom.zoomLabel,
    controller: getController ? { setScale: (s) => getController()?.setScale(s) } : controller,
    repaint: () => renderCanvas(),
    getSize: () => deckSize(state),
    fitPadding,
    fitMinW,
    fitMinH,
  });
  // Thumbnail bar: a page switch only moves the active card (reload), a content edit
  // repaints the current card, and only load/page ops/theme rebuild the whole strip.
  const thumbnails = createThumbnails({ state, api, ops, ui, coords, editable, reload: () => viewObj.render({ thumbs: "none" }) });

  // Method table: render() calls the other render functions bare, while allowing external hooks to be attached on viewObj
  Object.assign(viewObj, {
    render,
    renderCanvas,
    updateButtons,
    renderZoom: viewport.renderZoom,
    setZoom: viewport.setZoom,
    panBy: viewport.panBy,
    followStageWidth: viewport.followStageWidth,
    zoomIn: viewport.zoomIn,
    zoomOut: viewport.zoomOut,
    zoomReset: viewport.zoomReset,
    getZoom: viewport.getZoom,
    renderThumbnails: thumbnails.renderThumbnails,
    refreshPage,
    destroy,
  });

  /**
   * Full refresh. options.thumbs picks the thumbnail-bar work:
   *   "all"     rebuild every card — load, page insert/delete/move, theme change, resize (default)
   *   "current" repaint the current card only — content edits, undo/redo, paste/delete element
   *   "none"    only move the active card — page switch / present exit
   * The default stays "all" so callers outside the editor layer (resize hooks in
   * preview.js/editor.js, present.js) keep their previous semantics.
   */
  function render(options = {}) {
    if (!state.deck) return; // load failed/incomplete: skip safely (external triggers such as resize)
    const thumbs = options.thumbs || "all";
    if (thumbs === "all") thumbnails.renderThumbnails();
    else if (thumbs === "current") thumbnails.refreshCurrent();
    else if (thumbs === "none") thumbnails.setActive();
    renderCanvas();
    if (editable) updateButtons();
    viewport.renderZoom();
    // Externally registered per-render hook (statusbar dirty dot etc.), see the editor assembly
    viewObj.afterRender?.();
  }

  // Progressive loading: once one page's assets are ready, refresh that page's
  // thumbnail and, when it is the current page, the canvas.
  function refreshPage(pg) {
    if (!state.deck) return;
    thumbnails.refreshThumb(pg);
    if (state.deck.pages[state.currentPage] === pg) renderCanvas();
  }

  // Canvas
  function renderCanvas() {
    if (!state.deck) return;
    const canvas = dom.canvas;
    if (!canvas) return; // a skeleton without a canvas surface (defensive)
    // Canvas size follows the deck's real canvas (inline override of the 960×540 fallback in canvas.css)
    const [pw, ph] = deckSize(state);
    canvas.style.width = `${pw}px`;
    canvas.style.height = `${ph}px`;
    viewport.applyScale();
    // transform-origin is center: flex centering + center-anchored scaling is visually symmetric, no margin compensation needed
    const pg = page();
    // resolve → layout → paint: layout decides geometry once with the pure
    // fontMetricsMeasure (the same source used by export/headless), so editor and
    // exported text geometry agree and no per-text DOM measurement is needed.
    const tree = layout({ ...state.deck, theme: state.theme ?? state.deck.theme, pages: [pg] });
    paintPage(tree.pages[0], {
      container: canvas,
      page: pg,
      theme: state.theme,
      imageMap: state.imageMap,
      iconMap: state.iconMap,
    });
    coords.setLayoutPage(tree.pages[0]);
    // Out-of-bounds is an editing hint only: gallery covers and full previews stay silent.
    if (editable) notifyOverflow(state.currentPage, tree.pages[0]);
    ctl()?.refreshSelection();
    // Progressive-load mask: cover the failure placeholder while the current page's assets are not ready (assets landing re-render via refreshPage)
    if (dom.canvasLoading) dom.canvasLoading.hidden = !state.pagesPending?.has(pg);
  }

  /** Out-of-bounds fact → light toast (consumes layout overflow; the same count is not re-toasted; not a persistent overlay). */
  function notifyOverflow(pageIndex, layoutPageNode) {
    if (overflowDeck !== state.deck) {
      overflowDeck = state.deck;
      lastOverflow.clear();
    }
    const count = (layoutPageNode?.elements || []).filter((e) => e.overflow?.x || e.overflow?.y).length;
    const prev = lastOverflow.get(pageIndex);
    if (count > 0 && count !== prev) {
      toast.show(`⚠ 本页 ${count} 个元素超出画布范围`, "info", 4000);
    }
    lastOverflow.set(pageIndex, count);
  }

  // Button state (editor only; the preview skeleton has no undo/redo buttons)
  function updateButtons() {
    if (dom.btnUndo) dom.btnUndo.disabled = !state.history.canUndo();
    if (dom.btnRedo) dom.btnRedo.disabled = !state.history.canRedo();
  }

  /** Release: thumbnail chart instances + listeners, viewport animation (destroy; idempotent). */
  function destroy() {
    thumbnails.destroy?.();
    viewport.destroy?.();
  }

  return viewObj;
}

/**
 * Paint surface for the ?shot=1 headless path. Runs the same layout → paintPage
 * channel as the editor preview and nothing else: no viewport fit/zoom/pan (the
 * container is the deck-sized capture surface, so scale stays 1), no thumbnails /
 * chrome / selection box. Geometry comes from the same pure fontMetricsMeasure the
 * editor uses, so the golden baseline stays pixel-identical.
 * render(index) paints one page and sizes the container to the deck.
 * @param {object} deps { state, container } container = the paint surface
 */
export function createPageView({ state, container }) {
  function render(index = state.currentPage) {
    if (!state.deck || !container) return;
    const pg = state.deck.pages[index];
    if (!pg) return;
    const [w, h] = deckSize(state);
    container.style.width = `${w}px`;
    container.style.height = `${h}px`;
    paintModelPage(container, pg, state.deck, state.theme, {
      imageMap: state.imageMap,
      iconMap: state.iconMap,
    });
  }

  return {
    render,
    /** Progressive load has no incremental target here: pages are painted on demand by the shot driver's goto(). */
    refreshPage() {},
    destroy() {},
  };
}
