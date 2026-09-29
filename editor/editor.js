// ============================================================================
// editor/editor.js — createEditor: a mountable, destroyable editor instance (contract 1)
// ----------------------------------------------------------------------------
// Moves the whole assembly logic of the old main.js boot()/initEditor() in here and
// closes it over:
//   createEditor(rootEl, { source, deck?, deckUrl?, theme?, chrome?, dialogs?, locale?, on? })
//     → { ready, destroy, api, io, state, view }
//
// rootEl is the mount point: dom refs prefer its subtree, falling back to document
// for unmatched elements (the static skeleton is still in index.html; an embedded
// caller may pass an empty container) — that fallback policy lives only in dom.js.
// destroy() is idempotent: it removes DOM created or taken over by this instance,
// unbinds all window/document listeners, closes push channels, releases chart
// instances, clears the dom cache and restores the theme and default dialogs.
//
// Zero external behavior change: standalone main.js still opens with ?deck=,
// screenshots with ?shot=1, and main.js keeps exposing window.__pptdEditor/__pptdIo.
// ============================================================================

import { createEditorState } from "./app/state.js";
import { createEditorApi } from "./app/api.js";
import { createView } from "./app/view/view.js";
import { createIo } from "./app/project/io.js";
import { bindToolbar } from "./app/toolbar.js";
import { bindKeyboard } from "./app/keyboard.js";
import { createPresent } from "./app/present.js";
import { clearToasts } from "./app/toast.js";
import { createCanvasController } from "./interaction/canvas.js";
import { createStageController } from "./interaction/stage.js";
import { bindContextMenu } from "./interaction/contextmenu.js";
import { makeZoomCtlDraggable } from "./app/view/zoom-ctl.js";
import { bindProperties } from "./interaction/properties.js";
import { injectIcons } from "./icons.js";
import { dom } from "./dom.js";
import { applyThemeTokens, bindThemeMode } from "./theme.js";
import { configureDialogs, resetDialogs } from "./dialogs.js";
import { closeAllDialogs } from "./interaction/dialogs/base.js";
import { disposeChartInstances } from "../packages/renderer/index.js";

// chrome presets: embedded = trims host-hostile outbound navigation (brand back to gallery / GitHub new window)
const CHROME_PRESETS = {
  full: null,
  embedded: { topbar: true, brand: false, github: false, thumbbar: true, quickbar: true, zoom: true, inspector: true },
};

/**
 * Assemble an editor instance on rootEl.
 * @param {HTMLElement} rootEl mount point
 * @param {object} options
 *   source*    ProjectSource (required)
 *   deck?      { manifestText, pageFiles, manifestPath? } initial document (otherwise read from source)
 *   deckUrl?   project URL loaded via source.read(deckUrl) (standalone ?deck=)
 *   theme?     { tokens?: Record<string,string>, mode?: "light"|"dark" }
 *   chrome?    "full" | "embedded" | { topbar?, brand?, github?, thumbbar?, quickbar?, zoom?, inspector? }
 *   dialogs?   host implementation { alert, confirm } (overrides native dialogs, see editor/dialogs.js)
 *   locale?    "zh-CN" (default; no i18n resources yet, recorded only)
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
    locale = "zh-CN",
    on = {},
  } = options;

  if (!source) throw new Error("createEditor: options.source（ProjectSource）为必填");
  const mount = rootEl || (typeof document !== "undefined" ? document.body : null);
  if (!mount) throw new Error("createEditor: 需要可用的 rootEl");

  // Mount-point scope (unmatched ids fall back to document, see dom.js)
  dom.rebind(mount);
  injectIcons(mount);
  if (dialogsImpl) configureDialogs(dialogsImpl);

  const disposers = [];
  let destroyed = false;

  // --------------------------------------------------------------------------
  // Theme injection (contract 3): mode/tokens land on the common ancestor (the
  // skeleton is in body, the mount point may be an empty container)
  // --------------------------------------------------------------------------
  const themeHost = mount.contains && mount.contains(dom.editorApp) ? mount : document.documentElement;
  const restoreTheme = theme ? applyThemeTokens(themeHost, theme) : null;

  // Tri-state theme (B3: light / dark / follow system): when the host injects a
  // mode, defer to the host (injection wins over the built-in palette); otherwise
  // the editor manages it (localStorage persistence + prefers-color-scheme
  // following, applied on data-pptd-theme)
  const themeMode = theme?.mode ? null : bindThemeMode();
  disposers.push(() => themeMode?.destroy());

  // --------------------------------------------------------------------------
  // Assembly (the closure of the old main.js initEditor)
  // --------------------------------------------------------------------------
  const { state, page, selected, primarySelectedId, selectedElements, groupOf, ops } = createEditorState();
  const api = createEditorApi({ state, page, selected, primarySelectedId, selectedElements, ops });

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

  // Element gesture executor (drag/resize/rotate; viewport gestures are in the stage router)
  const controller = createCanvasController(dom.canvas, { ...api });

  const props = bindProperties(dom.props, api);
  const view = createView({ state, page, selected, api, controller, props, ops });
  api.bind({ controller, view });
  disposers.push(() => view.destroy?.());

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
  });
  disposers.push(() => stage.destroy?.());

  // Canvas right-click context menu (three states: single-select / multi-select / empty page-level)
  const contextMenu = bindContextMenu({ stage: dom.stage, api, state, page, groupOf, view });
  disposers.push(() => contextMenu.destroy?.());

  // Zoom control: drag-to-move (position persisted, double-click the percentage resets)
  const zoomCtl = makeZoomCtlDraggable(dom.stage, dom.zoomCtl, dom.zoomLabel);
  disposers.push(() => zoomCtl.destroy?.());

  const io = createIo({
    state,
    view,
    ops,
    source,
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

  // Present mode (topbar "Present" button + F5)
  const present = createPresent({ state, view, ops });
  api.present = present;
  disposers.push(() => present.destroy?.());

  view.afterRender = () => {
    ops.syncDirty(); // recompute dirty after undo/redo or editing back to the saved value
    io.renderStatusBar(); // statusbar (dirty dot etc.) refreshed on every render
    present.sync(); // while presenting: sync the current page on live refresh/window resize
    emitEvents();
  };

  const toolbar = bindToolbar({ state, api, ops, view, io, present, themeMode });
  disposers.push(() => toolbar.destroy?.());
  const keyboard = bindKeyboard({ state, api, io, present });
  disposers.push(() => keyboard.destroy?.());
  disposers.push(() => props.destroy?.());
  disposers.push(() => controller.destroy?.());

  // Live reload (unified project mode): subscribe to push/polling once the project is ready
  io.connectLiveReload();

  // resize: rAF debounce + full render (thumbnail sizes / quickbar positioning sync when dragging the window across breakpoints)
  const resizeAc = new AbortController();
  let resizeRaf = 0;
  window.addEventListener(
    "resize",
    () => {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => view.render());
    },
    { signal: resizeAc.signal }
  );

  // chrome trimming (embedded/object form): hide host-hostile outbound navigation and the given regions
  const chromeHidden = applyChrome(chrome);

  // --------------------------------------------------------------------------
  // Initial load: deck → use directly; deckUrl → read(url); both omitted → follow
  // the contract via source.read() (a source.read failure = no established project
  // → blank silently, matching the existing initEditor(null))
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
        await io.loadDeck(deckUrl);
      } catch (err) {
        console.error(err);
        showLoadError(err);
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
    // Skeleton region pickers; the scope-first / document-fallback policy is dom.js's (single point)
    const map = {
      topbar: () => dom.query(".topbar"),
      brand: () => dom.query(".brand-home"),
      github: () => dom.query(".topbar-actions a[href^='http']"),
      thumbbar: () => dom.query("footer.thumbbar"),
      quickbar: () => dom.quickbar,
      zoom: () => dom.zoomCtl,
      inspector: () => dom.query("aside.inspector"),
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
    // 4) Chart instances (canvas) + dynamic DOM cleanup
    try {
      disposeChartInstances(dom.canvas);
    } catch {
      /* the canvas is no longer in the document */
    }
    closeAllDialogs();
    clearToasts();
    if (dom.quickbar) dom.quickbar.innerHTML = "";
    // 5) Restore chrome-hidden elements
    for (const [el, prev] of chromeHidden) el.style.display = prev || "";
    // 6) Restore theme
    restoreTheme?.();
    resetDialogs();
    // 7) When the mount point is a standalone container (not body/html), clear its content
    if (mount && mount !== document.body && mount !== document.documentElement) {
      try {
        if (mount.contains(dom.editorApp)) mount.innerHTML = "";
      } catch {
        /* ignore */
      }
    }
    // 8) Restore the dom cache to the document-level default instance
    dom.clear();
    dom.rebind(document);
  }

  const instance = { ready, destroy, api, io, state, view };
  return instance;
}
