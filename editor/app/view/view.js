// ============================================================================
// app/view/view.js — render orchestration (canvas / thumbnail bar / property panel / quickbar / button state)
// ----------------------------------------------------------------------------
// Every entry that "paints the model onto the screen" is centralized here: render()
// is a full refresh, while renderCanvas / renderThumbnails / renderProps /
// renderQuickbar / updateButtons can be called individually (lightweight selection,
// window resize, etc.). Viewport (zoom/pan) and the thumbnail bar are separate
// concerns split into viewport.js / thumbnails.js, each owning its state and DOM
// wiring; this file only orchestrates and rebuilds the canvas.
// ============================================================================

import { getType } from "../../types/index.js";
import { quickbarColor, quickbarSelect, quickbarBtn, quickbarIconBtn, quickbarTextBtn, isNarrow, svgIcon } from "../../ui.js";
import { relRect, setLayoutPage } from "../../coords.js";
import { createViewport, deckSize } from "./viewport.js";
import { createThumbnails } from "./thumbnails.js";
import { dom } from "../../dom.js";
import { resolveColor } from "../../../packages/model/index.js";
import { layout } from "../../../packages/layout/index.js";
import { paintPage, renderPage } from "../../../packages/renderer/index.js";
import { showToast } from "../toast.js";
import { createDomMeasure, isDomMeasureAvailable } from "./dom-measure.js";

// MeasurePort for editor layout: the DOM refinement adapter (M6) in a browser, otherwise the pure function
const measurePort = isDomMeasureAvailable() ? createDomMeasure() : undefined;

// Quickbar trailing action icons (inline SVG, the same convention as the per-type menu icons:
// declared next to their only consumer, sized by CSS, stroke inherits currentColor)
const ICON_QB_PANEL = svgIcon(
  '<circle cx="5.5" cy="12" r="1.5" fill="currentColor" stroke="none"/>' +
  '<circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>' +
  '<circle cx="18.5" cy="12" r="1.5" fill="currentColor" stroke="none"/>'
);
const ICON_QB_DELETE = svgIcon(
  '<path d="M3.5 6.5h17"/><path d="M9 6.5V4.8A1.3 1.3 0 0 1 10.3 3.5h3.4A1.3 1.3 0 0 1 15 4.8v1.7"/>' +
  '<path d="M18.6 6.5l-.9 13a1.6 1.6 0 0 1-1.6 1.5H7.9a1.6 1.6 0 0 1-1.6-1.5l-.9-13"/>' +
  '<path d="M10 11v5.5M14 11v5.5"/>'
);

// Out-of-bounds hint dedupe (remember the last count per page; the same state does not re-toast)
const lastOverflow = new Map();
let overflowDeck = null;

export function createView({ state, page, selected, api, controller, props, ops }) {
  // Under strict mode a bare render() call has this === undefined, so self-reference through viewObj
  const viewObj = {};

  // Viewport: zoom/pan state and transform application. A zoom change needs a
  // canvas rebuild, while panning only changes the transform — the repaint
  // callback is injected here.
  const viewport = createViewport({
    stage: dom.stage,
    canvas: dom.canvas,
    wrap: dom.canvasWrap,
    zoomLabel: dom.zoomLabel,
    controller,
    repaint: () => renderCanvas(),
    getSize: () => deckSize(state),
  });
  // Thumbnail bar: a page switch/delete needs a full refresh, going back to render() via the reload callback
  const thumbnails = createThumbnails({ state, api, ops, reload: () => viewObj.render() });

  // Method table: render() calls the other render functions bare, while allowing external hooks to be attached on viewObj
  Object.assign(viewObj, {
    render,
    renderCanvas,
    renderProps,
    renderQuickbar,
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

  // --------------------------------------------------------------------------
  // Full refresh
  // --------------------------------------------------------------------------
  function render() {
    if (!state.deck) return; // load failed/incomplete: skip safely (external triggers such as resize)
    thumbnails.renderThumbnails();
    renderCanvas();
    renderProps();
    renderQuickbar();
    updateButtons();
    viewport.renderZoom();
    // Externally registered per-render hook (statusbar dirty dot etc.), see the main.js assembly
    viewObj.afterRender?.();
  }

  // --------------------------------------------------------------------------
  // Progressive loading: targeted refresh once a single page's assets are ready
  // (that page's thumbnail skeleton → real render; the current page also redoes the canvas)
  // --------------------------------------------------------------------------
  function refreshPage(pg) {
    if (!state.deck) return;
    thumbnails.refreshThumb(pg);
    if (state.deck.pages[state.currentPage] === pg) renderCanvas();
  }

  // --------------------------------------------------------------------------
  // Canvas
  // --------------------------------------------------------------------------
  function renderCanvas() {
    if (!state.deck) return;
    const canvas = dom.canvas;
    // Canvas size follows the deck's real canvas (inline override of the 960×540 fallback in canvas.css)
    const [pw, ph] = deckSize(state);
    canvas.style.width = `${pw}px`;
    canvas.style.height = `${ph}px`;
    viewport.applyScale();
    // transform-origin is center: flex centering + center-anchored scaling is visually symmetric, no margin compensation needed
    const pg = page();
    // resolve → layout → paint: geometry facts are decided once in layout (RP-C / M6).
    // In the editor, domMeasure refines the text residual (the result only feeds layout, not the model);
    // the same LayoutTree is handed to the selection box/guides (coords.setLayoutPage), so paint and the selection box no longer compute separately.
    const tree = layout({ ...state.deck, theme: state.theme ?? state.deck.theme, pages: [pg] }, measurePort);
    paintPage(tree.pages[0], {
      container: canvas,
      page: pg,
      theme: state.theme,
      imageMap: state.imageMap,
      iconMap: state.iconMap,
    });
    setLayoutPage(tree.pages[0]);
    notifyOverflow(state.currentPage, tree.pages[0]);
    controller.refreshSelection();
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
      showToast(`⚠ 本页 ${count} 个元素超出画布范围`, "info", 4000);
    }
    lastOverflow.set(pageIndex, count);
  }

  // --------------------------------------------------------------------------
  // Property panel (element properties + page settings)
  // --------------------------------------------------------------------------
  function renderProps() {
    const el = selected();
    const count = api.getSelection().length; // selection reads via the api surface, never state.selection
    const badge = dom.inspectorBadge;
    const def = el ? getType(el.elementType) : null;
    if (count > 1) {
      badge.hidden = false;
      badge.textContent = `多选 ×${count}`;
    } else if (el && def) {
      badge.hidden = false;
      badge.textContent = def.label;
    } else {
      badge.hidden = true;
    }
    dom.inspectorTitle.textContent = count > 1 ? "多个元素" : count === 1 ? "元素属性" : "页面设置";
    props.refresh();
  }

  // --------------------------------------------------------------------------
  // Floating quickbar (high-frequency actions shown while an element is selected)
  // --------------------------------------------------------------------------
  function renderQuickbar() {
    const qb = dom.quickbar;
    const el = selected();
    const canvas = dom.canvas;
    const stage = dom.stage;
    // The quickbar only appears on a single selection (batch actions for multi-select live in the property panel / context menu, U2 consolidation)
    const node = el && api.getSelection().length === 1 ? canvas.querySelector(`[data-element-id="${CSS.escape(el.elementId)}"]`) : null;
    if (!el || !node) {
      qb.classList.remove("show");
      qb.innerHTML = "";
      return;
    }
    qb.innerHTML = "";

    // Control helpers: all methods append the control to the quickbar (type modules only say
    // "what", not "where to mount"). Text labels are gone (D3) — every control now takes a
    // title instead, so the meaning survives on hover rather than taking bar space (title
    // first, the same label-first shape as ui.js field()/cell()).
    const h = {
      // Color: tokens ($primary etc.) resolve to a concrete hex, showing the current real color
      color: (title, value, onCommit) => qb.appendChild(quickbarColor(resolveColor(state.theme, value) || "", onCommit, title)),
      select: (title, options, value, onCommit) => qb.appendChild(quickbarSelect(options, value, onCommit, title)),
      fontOptions: () => api.fontOptions?.() || [["", "默认"]],
      btn: (label, title, onClick, active) => qb.appendChild(quickbarBtn(label, title, onClick, active)),
      iconBtn: (icon, title, onClick) => qb.appendChild(quickbarIconBtn(icon, title, onClick)),
      textBtn: (label, title, onClick) => qb.appendChild(quickbarTextBtn(label, title, onClick)),
      change(fn) {
        api.beginChange();
        fn();
        render();
      },
      openEditor: api.openEditor,
    };

    // Type badge + type-specific core controls + ⋯ (property panel) + delete
    const def = getType(el.elementType);
    const badge = document.createElement("span");
    badge.className = "qb-type";
    badge.textContent = def?.label || el.elementType;
    qb.appendChild(badge);
    if (def?.quickbar) def.quickbar(el, h);
    qb.appendChild(quickbarIconBtn(ICON_QB_PANEL, "打开属性面板", openInspector));
    qb.appendChild(quickbarIconBtn(ICON_QB_DELETE, "删除元素", () => api.deleteSelected()));

    // Position: centered above the element; when there is not enough room (near the canvas top) it goes below
    // (node → stage coordinate conversion goes through coords.js)
    const r = relRect(node.getBoundingClientRect(), stage.getBoundingClientRect());
    const x = r.left + r.width / 2;
    const y = r.top;
    qb.classList.add("show");
    // Narrow: CSS owns the bottom-docked horizontal layout, so clear any leftover inline positioning (when the window crosses breakpoints)
    if (isNarrow()) {
      qb.style.left = "";
      qb.style.top = "";
      return;
    }
    // Edge clamp: constrained by the quickbar's own width (including translateX(-50%)) to avoid spilling out of the canvas area/screen
    const qbW = qb.offsetWidth;
    const half = qbW / 2;
    const minLeft = half + 8;
    const maxLeft = Math.max(minLeft, stage.getBoundingClientRect().width - half - 8);
    qb.style.left = `${Math.max(minLeft, Math.min(x, maxLeft))}px`;
    // Above placement: flush to the element's top edge (the rotate handle is at the box bottom, so the whole top space goes to the quickbar);
    // when it does not fit, flip below the element, leaving room for the bottom rotate-handle zone (connector 16 + handle 26 + gap 10 = 52px)
    const topY = y - qb.offsetHeight - 12;
    qb.style.top = topY >= 8 ? `${topY}px` : `${y + r.height + 52}px`;
  }

  // --------------------------------------------------------------------------
  // Property panel entry from the canvas (the quickbar ⋯ button)
  // --------------------------------------------------------------------------
  /** Reveal the property panel: desktop expands the persistent side panel, narrow opens the bottom
   * sheet — the same DOM contract as the topbar/FAB entry point (see app/toolbar.js toggleInspector);
   * only the collapse/toggle direction differs (here it is always "open"). */
  function openInspector() {
    if (isNarrow()) {
      document.body.classList.add("inspector-open");
    } else {
      document.body.classList.remove("inspector-collapsed");
      // Desktop: follow the panel width animation each frame so the canvas stays glued to the stage
      viewObj.followStageWidth?.();
    }
    renderCanvas();
  }

  // --------------------------------------------------------------------------
  // Button state
  // --------------------------------------------------------------------------
  function updateButtons() {
    dom.btnUndo.disabled = !state.history.canUndo();
    dom.btnRedo.disabled = !state.history.canRedo();
  }

  /** Release: thumbnail chart instances + listeners, viewport animation (destroy; idempotent). */
  function destroy() {
    thumbnails.destroy?.();
    viewport.destroy?.();
  }

  return viewObj;
}

// ============================================================================
// Non-interactive paint view
// ============================================================================
/**
 * Headless view for the non-interactive assembly (createEditor with
 * `chrome:"shot"` / `interactive:false`, i.e. the ?shot=1 screenshot path).
 *
 * It runs the SAME paint channel as the editor preview — renderPage
 * (layout → paintPage) with the same imageMap / iconMap / theme / fonts — and
 * nothing else. Everything the interactive view adds is deliberately absent:
 *   · no viewport fit/zoom/pan transform: the container is the deck-sized
 *     screenshot surface, so the scale must stay 1 (the editor's fit scale
 *     depends on the stage box and would shrink the capture);
 *   · no thumbnails / property panel / quickbar / button state / selection box;
 *   · no DOM-measure refinement. The editor geometry is max(pure, DOM); the
 *     golden baseline was produced from the pure-function geometry, so the
 *     headless assembly must stay on it (pixel stability is the gate here).
 *
 * render(index) paints one page of the loaded deck into the container and sizes
 * it to the deck (any canvas ratio); index defaults to state.currentPage so the
 * loader's progressive render calls work unchanged.
 *
 * @param {object} deps { state, container } container = the paint surface (the
 *   shot assembly uses createEditor's mount point, #shot-root).
 */
export function createHeadlessView({ state, container }) {
  function render(index = state.currentPage) {
    if (!state.deck || !container) return;
    const pg = state.deck.pages[index];
    if (!pg) return;
    const [w, h] = deckSize(state);
    container.style.width = `${w}px`;
    container.style.height = `${h}px`;
    renderPage(container, pg, state.deck, state.theme, {
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
