// ============================================================================
// editor/preview.js — createPreview: load / layout / paint / navigate / present
// ----------------------------------------------------------------------------
// 3.0 splits the old monolithic editor into two components (decisions.md D1):
//   createPreview  read-only viewer used by gallery covers, host embeds, headless
//                  PNG export and the editor's own canvas pipeline
//   createEditor   the preview core + the editing layer (selection / content /
//                  page ops / undo / Design / save)
//
//   createPreview(rootEl, { source, deck?, deckUrl?, theme?, chrome?, on? })
//     → { ready, destroy, view, io, state, goToPage, nextPage, prevPage,
//         zoomIn, zoomOut, zoomReset, present, reload }
//
// Self-contained: the skeleton (editor/skeleton.js) is rendered into rootEl, and
// dom / toast / dialogs / theme / present are instance services (editor/context.js).
// destroy() is idempotent and removes the DOM, listeners, live channel and chart
// instances of this instance only.
//
// chrome: "full"     viewer chrome — brand / present / page bar / zoom / count
//         "embedded" canvas surface only (covers, iframes, host layouts)
//
// Internal options (not part of the public contract):
//   headless   paint surface mode (shot.js): no skeleton, no chrome bindings;
//              the mount point itself is the deck-sized page surface
//   live       false disables the live-reload channel (gallery covers)
// ============================================================================

import { createEditorState } from "./app/state.js";
import { createEditorApi } from "./app/api.js";
import { createView, createPageView } from "./app/view/view.js";
import { createIo } from "./app/project/io.js";
import { createPresent } from "./app/present.js";
import { injectIcons } from "./icons.js";
import { previewSkeletonHtml } from "./skeleton.js";
import { createUiContext } from "./context.js";
import { createCoords } from "./coords.js";
import { disposeChartInstances } from "../packages/renderer/index.js";

/**
 * Public preview factory.
 * @param {HTMLElement} rootEl mount point (the preview owns everything inside it)
 * @param {object} options { source, deck?, deckUrl?, theme?, chrome?, dialogs?, on? }
 * @returns {object} preview handle (see the file header)
 */
export function createPreview(rootEl, options = {}) {
  const chrome = normalizeChrome(options.chrome, "createPreview");
  const core = createPreviewCore(rootEl, options, {
    html: previewSkeletonHtml({ chrome }),
    chrome,
    editable: false,
  });
  return previewHandle(core);
}

/**
 * Public preview handle over an assembled preview core (shared with createEditor,
 * whose instance also exposes the preview as `preview`).
 * @param {object} core createPreviewCore result
 * @returns {object} { ready, destroy, view, io, state, goToPage, nextPage, prevPage, zoomIn, zoomOut, zoomReset, present, reload }
 */
export function previewHandle(core) {
  const { api } = core;
  return {
    ready: core.ready,
    destroy: core.destroy,
    view: core.view,
    io: core.io,
    state: core.state,
    goToPage: api.goToPage,
    nextPage: api.nextPage,
    prevPage: api.prevPage,
    zoomIn: api.zoomIn,
    zoomOut: api.zoomOut,
    zoomReset: api.zoomReset,
    present: api.present,
    reload: api.reload,
  };
}

/** chrome accepts exactly the two 3.0 presets (no "shot" / object spec compat layer). */
export function normalizeChrome(value, caller = "createEditor") {
  if (value == null) return "full";
  if (value === "full" || value === "embedded") return value;
  throw new Error(`${caller}: chrome 仅支持 "full" | "embedded"（当前 ${JSON.stringify(value)}）`);
}

/**
 * Shared assembly used by createPreview and createEditor.
 * @param {HTMLElement} rootEl mount point
 * @param {object} options createPreview/createEditor options
 * @param {{html: string, chrome: "full"|"embedded", editable: boolean}} spec
 * @returns {object} core handle (includes the internals createEditor attaches to)
 */
export function createPreviewCore(rootEl, options, { html, chrome, editable }) {
  const {
    source,
    deck = null,
    deckUrl = null,
    theme = null,
    dialogs: dialogsImpl = null,
    on = {},
    headless = false,
    live = true,
  } = options;

  if (!source) throw new Error("createPreview: options.source（ProjectSource）为必填");
  const mount = rootEl;
  if (!mount) throw new Error("createPreview: 需要可用的 rootEl");

  // Skeleton + instance services. headless paints the deck into the bare mount point.
  mount.innerHTML = html;
  if (html) injectIcons(mount);
  const ui = createUiContext(mount, { chrome, theme, dialogs: dialogsImpl });
  const coords = createCoords();

  const disposers = [];
  let destroyed = false;

  // --------------------------------------------------------------------------
  // State + view + IO
  // --------------------------------------------------------------------------
  const stateParts = createEditorState();
  const { state, page, selected, primarySelectedId, selectedElements, ops } = stateParts;
  const api = createEditorApi({ state, page, selected, primarySelectedId, selectedElements, ops, ui });

  // The selection controller is attached by createEditor after the core is built.
  let controller = null;
  // Embedded covers fit their host box exactly; editor/viewer keep the 64px margin.
  const embeddedFit = !editable && chrome === "embedded";
  const view = headless
    ? createPageView({ state, container: mount })
    : createView({
        state,
        page,
        api,
        ops,
        ui,
        coords,
        editable,
        getController: () => controller,
        ...(embeddedFit ? { fitPadding: 0, fitMinW: 0, fitMinH: 0 } : {}),
      });
  api.bind({ view });

  const io = createIo({
    state,
    view,
    ops,
    source,
    ui,
    live,
    onSaved: () => safeCall(on.saved),
    onDeckChange: (d) => safeCall(on.deckChange, d),
    onError: (err) => safeCall(on.error, err),
  });
  api.fontOptions = () => io.fontManager.fontOptions(); // element font dropdown options (late-bound)
  api.bind({ io });

  /** Host callbacks must never break the instance. */
  function safeCall(fn, ...args) {
    if (typeof fn !== "function") return;
    try {
      fn(...args);
    } catch (err) {
      console.warn("[preview] 回调异常:", err?.message || err);
    }
  }

  // --------------------------------------------------------------------------
  // Present mode + viewer chrome (preview only; createEditor binds its own layer)
  // --------------------------------------------------------------------------
  let present = null;
  const chromeAc = new AbortController();
  let resizeRaf = 0; // viewer resize debounce (cancelled on destroy)
  if (!headless) {
    present = createPresent({ state, view, ops, ui });
    api.bind({ present });
    disposers.push(() => present.destroy?.());
    if (!editable) bindViewerChrome();
  }

  // --------------------------------------------------------------------------
  // Viewer chrome: present / zoom buttons / resize / page keys / pan-zoom surface
  // --------------------------------------------------------------------------
  function bindViewerChrome() {
    const { dom } = ui;
    dom.btnPresent?.addEventListener("click", () => present.start(), { signal: chromeAc.signal });
    dom.btnZoomIn?.addEventListener("click", () => view.zoomIn(), { signal: chromeAc.signal });
    dom.btnZoomOut?.addEventListener("click", () => view.zoomOut(), { signal: chromeAc.signal });
    dom.btnZoomReset?.addEventListener("click", () => view.zoomReset(), { signal: chromeAc.signal });
    dom.zoomLabel?.addEventListener("dblclick", () => view.zoomReset(), { signal: chromeAc.signal });

    // Resize: rAF debounce + full render (fit scale follows the container)
    window.addEventListener(
      "resize",
      () => {
        cancelAnimationFrame(resizeRaf);
        resizeRaf = requestAnimationFrame(() => view.render());
      },
      { signal: chromeAc.signal }
    );

    // Page keys (full chrome only: an embedded cover must not steal the host's arrows)
    if (chrome === "full") {
      document.addEventListener(
        "keydown",
        (e) => {
          if (!ui.isActive() || present?.isActive()) return;
          const tag = (e.target.tagName || "").toLowerCase();
          if (tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable) return;
          if (e.target.closest?.("button")) return; // keep native Space on focused buttons
          if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "PageDown" || e.key === " ") {
            e.preventDefault();
            api.nextPage();
          } else if (e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "PageUp") {
            e.preventDefault();
            api.prevPage();
          }
        },
        { signal: chromeAc.signal }
      );
    }

    bindPanZoom();
  }

  /** Canvas pan/zoom (no element interaction: a preview is read-only). */
  function bindPanZoom() {
    const stage = ui.dom.stage;
    if (!stage) return;
    const ac = chromeAc; // shares the viewer lifetime
    let drag = null;
    stage.addEventListener(
      "pointerdown",
      (e) => {
        if (e.button !== 0 && e.button !== 1) return;
        drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
        stage.classList.add("panning");
        e.preventDefault();
      },
      { signal: ac.signal }
    );
    window.addEventListener(
      "pointermove",
      (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        view.panBy(e.clientX - drag.x, e.clientY - drag.y);
        drag.x = e.clientX;
        drag.y = e.clientY;
      },
      { signal: ac.signal }
    );
    const end = () => {
      drag = null;
      stage.classList.remove("panning");
    };
    window.addEventListener("pointerup", end, { signal: ac.signal });
    window.addEventListener("pointercancel", end, { signal: ac.signal });
    stage.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) {
          view.setZoom(view.getZoom() * (e.deltaY < 0 ? 1.1 : 1 / 1.1), { x: e.clientX, y: e.clientY });
        } else {
          view.panBy(e.deltaX, e.deltaY);
        }
      },
      { passive: false, signal: ac.signal }
    );
    stage.addEventListener("dblclick", () => view.zoomReset(), { signal: ac.signal });
  }

  // --------------------------------------------------------------------------
  // Initial load: deck → use directly; deckUrl → read(url); neither → source.read()
  // --------------------------------------------------------------------------
  const ready = bootstrap().then(() => {
    if (destroyed) return;
    safeCall(on.ready, instance);
  });

  async function bootstrap() {
    if (deck) {
      await io.loadDeckData(deck, { silent: true });
      return;
    }
    if (deckUrl) {
      try {
        // Headless loads silently: there is no UI, and a load toast would land in the screenshot.
        await io.loadDeck(deckUrl, headless ? { silent: true } : {});
      } catch (err) {
        console.error(err);
        showLoadError(err);
        if (headless) throw err; // the CDP driver is parked on ready: propagate the failure
      }
      return;
    }
    try {
      const data = await source.read();
      await io.loadDeckData(data, { silent: true });
    } catch {
      // No established project: blank preview (one empty page)
      await io.newProject({ toast: false });
    }
  }

  function showLoadError(err) {
    safeCall(on.error, err);
    if (ui.dom.canvasLoading) ui.dom.canvasLoading.hidden = true; // reveal the error state
  }

  // --------------------------------------------------------------------------
  // Editing-layer attachment + destroy
  // --------------------------------------------------------------------------
  /** Attach the selection controller (createEditor only). */
  function setController(next) {
    controller = next;
    api.bind({ controller: next });
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    for (const d of disposers.splice(0)) {
      try {
        d();
      } catch (err) {
        console.warn("[preview] destroy 子项异常:", err?.message || err);
      }
    }
    try {
      chromeAc.abort();
    } catch {
      /* already aborted */
    }
    cancelAnimationFrame(resizeRaf);
    try {
      io.destroy?.();
    } catch (err) {
      console.warn("[preview] destroy io 异常:", err?.message || err);
    }
    try {
      disposeChartInstances(ui.dom.canvas || mount);
    } catch {
      /* the canvas is no longer in the document */
    }
    try {
      ui.destroy();
    } catch (err) {
      console.warn("[preview] destroy ui 异常:", err?.message || err);
    }
    try {
      if (mount) mount.innerHTML = "";
    } catch {
      /* ignore */
    }
  }

  const instance = {
    ready,
    destroy,
    view,
    io,
    state,
    api,
    ui,
    coords,
    present,
    page,
    ops,
    setController,
  };
  return instance;
}
