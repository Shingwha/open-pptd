// editor/editor.js — createEditor: the editing layer on the shared preview core
// createEditor(rootEl, { source, deck?, deckUrl?, theme?, chrome?, dialogs?, on? })
//   → { ready, destroy, preview, editor, io, state }
// Builds the preview core (load / layout / paint / live reload / present / theme)
// and attaches selection + transform, lazy content editors, page ops, undo/redo,
// the Design panel and save/export. Every service is per instance; destroy() is
// idempotent and tears down the editing bindings before the core.

import { createCanvasController } from "./interaction/canvas.js";
import { createStageController } from "./interaction/stage.js";
import { bindToolbar } from "./app/toolbar.js";
import { bindKeyboard } from "./app/keyboard.js";
import { editorSkeletonHtml } from "./skeleton.js";
import { createPreviewCore, previewHandle, normalizeChrome } from "./preview.js";

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
 *   chrome?    "full" | "embedded"
 *   dialogs?   host implementation { alert, confirm } (overrides native dialogs)
 *   on?        { ready?, dirty?, saved?, error?, deckChange?, selectionChange? }
 * @returns {{ ready: Promise<void>, destroy(): void, preview: object, editor: object, io: object, state: object }}
 */
export function createEditor(rootEl, options = {}) {
  const { chrome: chromeInput = "full", on = {} } = options;
  const chrome = normalizeChrome(chromeInput, "createEditor");

  // The shared preview core renders the editor skeleton and owns the paint pipeline.
  const core = createPreviewCore(rootEl, { ...options, on: withoutReady(on) }, {
    html: editorSkeletonHtml(),
    chrome,
    editable: true,
  });
  const { ui, api, page, ops, state, view, io, coords } = core;
  const { dom } = ui;
  const disposers = [];
  let destroyed = false;

  // Selection / transform layer
  const controller = createCanvasController(dom.canvas, {
    ...api,
    coords,
    isActive: ui.isActive,
  });
  core.setController(controller);
  disposers.push(() => controller.destroy?.());

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

  // Public events (dirty / selectionChange) + per-render hooks
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

  view.afterRender = () => {
    ops.syncDirty(); // recompute dirty after undo/redo or editing back to the saved value
    io.renderStatusBar(); // statusbar (dirty dot etc.) refreshed on every render
    core.present?.sync(); // while presenting: sync the current page on live refresh/window resize
    emitEvents();
  };

  // Toolbar / keyboard / resize / live channel
  const toolbar = bindToolbar({ state, api, view, io, present: core.present, themeMode: ui.themeMode, ui });
  disposers.push(() => toolbar.destroy?.());
  const keyboard = bindKeyboard({ state, api, io, present: core.present, ui });
  disposers.push(() => keyboard.destroy?.());

  io.connectLiveReload(); // idempotent; the load pipeline also connects once a project is ready

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

  // chrome trimming (embedded presets): hide host-hostile outbound navigation and the given regions
  const chromeHidden = applyChrome(chrome);

  const ready = core.ready.then(() => {
    if (destroyed) return;
    try {
      on.ready?.(instance);
    } catch (err) {
      console.warn("[editor] on.ready 回调异常:", err?.message || err);
    }
  });

  function applyChrome(spec) {
    const obj = spec === "embedded" ? CHROME_PRESETS.embedded : null;
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

  // destroy (idempotent): editing bindings first, then the shared core
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    for (const d of disposers.splice(0)) {
      try {
        d();
      } catch (err) {
        console.warn("[editor] destroy 子项异常:", err?.message || err);
      }
    }
    resizeAc.abort();
    cancelAnimationFrame(resizeRaf);
    for (const [el, prev] of chromeHidden) el.style.display = prev || "";
    core.destroy();
  }

  // public shape: preview = read-only handle, editor = the api surface.
  // The nested preview's destroy delegates to the editor teardown (one instance, one destroy).
  const preview = previewHandle(core);
  preview.destroy = destroy;
  const instance = { ready, destroy, preview, editor: api, io, state };
  return instance;
}

/** Drop the ready callback: the core resolves it against its own handle; the editor re-emits its own. */
function withoutReady(on) {
  const { ready, ...rest } = on || {};
  return rest;
}
