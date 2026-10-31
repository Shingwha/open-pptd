// ============================================================================
// editor/editor.js — createEditor: a self-contained, destroyable editor instance
// ----------------------------------------------------------------------------
// 3.0 componentisation (decisions.md D1): the editor renders its own skeleton into
// the mount point and creates every service per instance (dom / toast / dialogs /
// theme / present). The host page only provides an empty container; nothing is
// read from a document-level singleton.
//
//   createEditor(rootEl, { source, deck?, deckUrl?, theme?, chrome?, dialogs?, on? })
//     → { ready, destroy, api, io, state, view }
//
// This module is the editing layer on top of the shared preview pipeline (the
// preview split lands in this same wave; the non-interactive assembly is kept
// until app/shot.js migrates to createPreview).
//
// destroy() is idempotent: it removes the skeleton DOM, unbinds all window/document
// listeners, closes push channels, releases chart instances, clears toasts/dialogs,
// restores the theme and drops the context's service instances.
// ============================================================================

import { createEditorState } from "./app/state.js";
import { createEditorApi } from "./app/api.js";
import { createView, createPageView } from "./app/view/view.js";
import { createIo } from "./app/project/io.js";
import { bindToolbar } from "./app/toolbar.js";
import { bindKeyboard } from "./app/keyboard.js";
import { createPresent } from "./app/present.js";
import { createCanvasController } from "./interaction/canvas.js";
import { createStageController } from "./interaction/stage.js";
import { injectIcons } from "./icons.js";
import { editorSkeletonHtml } from "./skeleton.js";
import { createUiContext } from "./context.js";
import { createCoords } from "./coords.js";
import { disposeChartInstances } from "../packages/renderer/index.js";

// chrome presets: embedded = trims host-hostile outbound navigation (brand back to gallery / GitHub new window)
const CHROME_PRESETS = {
  full: null,
  embedded: { topbar: true, brand: false, github: false, thumbbar: true, zoom: true },
};

/**
 * Assemble an editor instance on rootEl.
 * @param {HTMLElement} rootEl mount point (the instance owns everything inside it)
 * @param {object} options
 *   source*    ProjectSource (required)
 *   deck?      { manifestText, pageFiles, manifestPath? } initial document (otherwise read from source)
 *   deckUrl?   project URL loaded via source.read(deckUrl) (standalone ?deck=)
 *   theme?     { tokens?: Record<string,string>, mode?: "light"|"dark" }
 *   chrome?    "full" | "embedded" | "shot" | { topbar?, brand?, github?, thumbbar?, zoom? }
 *              ("shot" = the non-interactive painter, implies interactive:false)
 *   dialogs?   host implementation { alert, confirm } (overrides native dialogs)
 *   interactive? false = non-interactive assembly (headless paint only, no interaction slices)
 *   on?        { ready?, dirty?, saved?, error?, deckChange?, selectionChange? }
 * @returns {{ ready: Promise<void>, destroy(): void, api: object, io: object, state: object, view: object }}
 */
export function createEditor(rootEl, options = {}) {
  const {
    source,
    deck = null,
    deckUrl = null,
    theme = null,
    chrome = "full",
    dialogs: dialogsImpl = null,
    on = {},
  } = options;

  // Assembly capability, decided in one place: "shot" is inherently non-interactive.
  const interactive = options.interactive !== false && chrome !== "shot";
  if (!source) throw new Error("createEditor: options.source（ProjectSource）为必填");
  const mount = rootEl;
  if (!mount) throw new Error("createEditor: 需要可用的 rootEl");

  // --------------------------------------------------------------------------
  // Skeleton + instance services (the whole component lives inside rootEl)
  // --------------------------------------------------------------------------
  mount.innerHTML = interactive ? editorSkeletonHtml() : ""; // headless paints the deck only
  if (interactive) injectIcons(mount);
  const ctxChrome = chrome === "full" || chrome === "embedded" ? chrome : "embedded";
  const ui = createUiContext(mount, { chrome: ctxChrome, theme, dialogs: dialogsImpl });
  const { dom } = ui;
  const coords = createCoords();

  const disposers = [];
  let destroyed = false;

  // --------------------------------------------------------------------------
  // Assembly
  // --------------------------------------------------------------------------
  const { state, page, selected, primarySelectedId, selectedElements, ops } = createEditorState();
  const api = createEditorApi({ state, page, selected, primarySelectedId, selectedElements, ops, ui });

  // Public events: dirty/selectionChange dispatched after each render when the state changed
  let lastDirty = null;
  let lastSelected = null;
  const emitEvents = () => {
    if (state.dirty !== lastDirty) {
      lastDirty = state.dirty;
      try {
        on.dirty?.(state.dirty);
      } catch (err) {
        console.warn("[editor] on.dirty 回调异常:", err?.message || err);
      }
    }
    const primaryId = api.getSelected(); // the api read surface (no direct state field access)
    if (primaryId !== lastSelected) {
      lastSelected = primaryId;
      try {
        on.selectionChange?.(primaryId);
      } catch (err) {
        console.warn("[editor] on.selectionChange 回调异常:", err?.message || err);
      }
    }
  };

  // Interaction slices (element gestures) exist only in the interactive assembly;
  // the headless one builds the same api without them.
  let controller = null;
  if (interactive) {
    controller = createCanvasController(dom.canvas, { ...api, coords, isActive: ui.isActive });
  }

  // Interactive: the full canvas view; headless: the deck-sized paint surface
  // (scale 1, pure-function geometry — pixel stability of the golden baseline).
  const view = interactive
    ? createView({ state, page, api, controller, ops, ui, coords, editable: true })
    : createPageView({ state, container: mount });
  api.bind({ controller, view });
  disposers.push(() => view.destroy?.());

  if (interactive) {
    // Stage gesture router: viewport pan/zoom + element gesture dispatch + click-empty deselect + double-click
    const stage = createStageController(dom.stage, {
      element: controller,
      select: api.select,
      getSelected: api.getSelected,
      isSelected: api.isSelected,
      deselect: () => api.select(null),
      onActivate: (id) => {
        const el = page().elements.find((e) => e.elementId === id);
        if (!el) return;
        ops.beginChange();
        api.openEditor(el);
      },
      panBy: (dx, dy) => view.panBy(dx, dy),
      setZoom: (z, anchor) => view.setZoom(z, anchor),
      getZoom: () => view.getZoom(),
      zoomReset: () => view.zoomReset(),
      isActive: ui.isActive,
    });
    disposers.push(() => stage.destroy?.());
  }

  const io = createIo({
    state,
    view,
    ops,
    source,
    ui,
    onSaved: () => {
      try {
        on.saved?.();
      } catch (err) {
        console.warn("[editor] on.saved 回调异常:", err?.message || err);
      }
    },
    onDeckChange: (d) => {
      try {
        on.deckChange?.(d);
      } catch (err) {
        console.warn("[editor] on.deckChange 回调异常:", err?.message || err);
      }
    },
    onError: (err) => {
      try {
        on.error?.(err);
      } catch (e) {
        console.warn("[editor] on.error 回调异常:", e?.message || e);
      }
    },
  });
  api.fontOptions = () => io.fontManager.fontOptions(); // element font dropdown options (late-bound)
  api.bind({ io }); // save/export/undo-redo/navigation delegate to the IO facade

  // --------------------------------------------------------------------------
  // Interactive bindings (skipped entirely by the headless assembly)
  // --------------------------------------------------------------------------
  const resizeAc = new AbortController();
  let resizeRaf = 0;

  if (interactive) {
    // Present mode (topbar "Present" button + F5)
    const present = createPresent({ state, view, ops, ui });
    api.bind({ present });
    disposers.push(() => present.destroy?.());

    view.afterRender = () => {
      ops.syncDirty(); // recompute dirty after undo/redo or editing back to the saved value
      io.renderStatusBar(); // statusbar (dirty dot etc.) refreshed on every render
      present.sync(); // while presenting: sync the current page on live refresh/window resize
      emitEvents();
    };

    const toolbar = bindToolbar({ state, api, view, io, present, themeMode: ui.themeMode, ui });
    disposers.push(() => toolbar.destroy?.());
    const keyboard = bindKeyboard({ state, api, io, present, ui });
    disposers.push(() => keyboard.destroy?.());
    disposers.push(() => controller.destroy?.());

    // Live reload (unified project mode): subscribe to push/polling once the project is ready.
    // (The headless assembly still connects through the load pipeline's own connect() call.)
    io.connectLiveReload();

    // resize: rAF debounce + full render (thumbnail sizes / canvas fit sync when crossing breakpoints)
    window.addEventListener(
      "resize",
      () => {
        cancelAnimationFrame(resizeRaf);
        resizeRaf = requestAnimationFrame(() => view.render());
      },
      { signal: resizeAc.signal }
    );
  }

  // chrome trimming (embedded/object form): hide host-hostile outbound navigation and the given regions
  const chromeHidden = interactive ? applyChrome(chrome) : [];

  // --------------------------------------------------------------------------
  // Initial load: deck → use directly; deckUrl → read(url); both omitted → follow
  // the contract via source.read() (a source.read failure = no established project
  // → blank silently)
  // --------------------------------------------------------------------------
  const ready = bootstrap().then(() => {
    if (destroyed) return;
    try {
      on.ready?.(instance);
    } catch (err) {
      console.warn("[editor] on.ready 回调异常:", err?.message || err);
    }
  });

  async function bootstrap() {
    if (deck) {
      await io.loadDeckData(deck, { silent: true });
      return;
    }
    if (deckUrl) {
      try {
        // Headless assembly loads silently: there is no UI, and a load toast would
        // land in the screenshot.
        await io.loadDeck(deckUrl, interactive ? {} : { silent: true });
      } catch (err) {
        console.error(err);
        showLoadError(err);
        if (!interactive) throw err; // headless: the CDP driver is parked on ready, propagate the failure
      }
      return;
    }
    try {
      const data = await source.read();
      await io.loadDeckData(data, { silent: true });
    } catch {
      // No established project: blank editor (same path as "File → new blank")
      await io.newProject({ toast: false });
    }
  }

  function showLoadError(err) {
    on.error?.(err);
    if (dom.canvasLoading) dom.canvasLoading.hidden = true; // drop the startup mask, revealing the error state
  }

  // --------------------------------------------------------------------------
  // chrome trimming
  // --------------------------------------------------------------------------
  function applyChrome(spec) {
    const obj = spec === "embedded" ? CHROME_PRESETS.embedded : spec === "full" || !spec ? null : spec;
    if (!obj) return [];
    const map = {
      topbar: () => dom.query(".topbar"),
      brand: () => dom.query(".brand-home"),
      github: () => dom.query(".topbar-actions a[href^='http']"),
      thumbbar: () => dom.query("footer.thumbbar"),
      zoom: () => dom.zoomCtl,
    };
    const hidden = [];
    for (const [key, pick] of Object.entries(map)) {
      if (obj[key] === false) {
        const el = pick();
        if (el) {
          hidden.push([el, el.style.display]);
          el.style.display = "none";
        }
      }
    }
    return hidden;
  }

  // --------------------------------------------------------------------------
  // destroy (idempotent)
  // --------------------------------------------------------------------------
  function destroy() {
    if (destroyed) return;
    destroyed = true;

    // 1) Child bindings (keyboard/stage/toolbar/popovers/sub-controllers) released one by one
    for (const d of disposers.splice(0)) {
      try {
        d();
      } catch (err) {
        console.warn("[editor] destroy 子项异常:", err?.message || err);
      }
    }
    // 2) Live channel + statusbar button listeners
    try {
      io.destroy?.();
    } catch (err) {
      console.warn("[editor] destroy io 异常:", err?.message || err);
    }
    // 3) window-level listeners and rAF
    resizeAc.abort();
    cancelAnimationFrame(resizeRaf);
    // 4) Chart instances (canvas)
    try {
      disposeChartInstances(dom.canvas);
    } catch {
      /* the canvas is no longer in the document */
    }
    // 5) Restore chrome-hidden elements
    for (const [el, prev] of chromeHidden) el.style.display = prev || "";
    // 6) Instance services: dialogs / toasts / theme / dom cache
    try {
      ui.destroy();
    } catch (err) {
      console.warn("[editor] destroy ui 异常:", err?.message || err);
    }
    // 7) Drop the skeleton the instance owns
    try {
      if (mount) mount.innerHTML = "";
    } catch {
      /* ignore */
    }
  }

  const instance = { ready, destroy, api, io, state, view };
  return instance;
}
