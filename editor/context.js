// ============================================================================
// editor/context.js — per-instance UI context (dom / toast / dialogs / theme)
// ----------------------------------------------------------------------------
// 3.0 componentisation (decisions.md D1): every service that used to be a
// module-level singleton is created per instance and passed down as one context
// object. Modules receive it as `ui` (or as an explicit factory argument) and
// NEVER import the singletons.
//
//   ui = {
//     root,        mount point (the instance owns everything inside it)
//     dom,         createDom(root) scoped element registry
//     toast,       createToast(root)
//     dialogs,     createDialogs(override)
//     themeHost,   element that carries data-pptd-theme / inline token overrides
//     themeMode,   bindThemeMode handle (full chrome without a host mode) or null
//     chrome,      "full" | "embedded"
//     isActive(),  is this the instance keyboard/gesture shortcuts should act on?
//     activate(),  claim the active slot (pointerdown/focusin inside the root)
//     destroy()    idempotent teardown of every context-level service
//   }
//
// Theme scope: chrome "full" themes the document element (one viewer palette per
// page, matching the 2.x standalone behaviour); embedded previews and the headless
// surface theme their own subtree only, so a cover grid never repaints the page.
//
// Active instance: keyboard shortcuts of a preview/editor only act on the instance
// the user last interacted with (two editors on one page do not both react to one
// Ctrl+Z). The registry is process-level by nature — it only arbitrates WHO acts.
// ============================================================================

import { createDom } from "./dom.js";
import { createToast } from "./app/toast.js";
import { createDialogs } from "./dialogs.js";
import { applyThemeTokens, bindThemeMode } from "./theme.js";

/** Mount order; the last entry is the active instance (module-level by design: one "user"). */
const mounted = [];

/**
 * Create the UI context of one instance.
 * @param {HTMLElement} rootEl mount point (the skeleton is rendered into it afterwards)
 * @param {{ chrome?: "full"|"embedded", theme?: object|null, dialogs?: object|null }} [opts]
 * @returns {object} ui context
 */
export function createUiContext(rootEl, { chrome = "full", theme = null, dialogs = null } = {}) {
  if (!rootEl) throw new Error("createUiContext: 需要可用的 rootEl");
  const dom = createDom(rootEl);
  const toast = createToast(rootEl);
  const dialogService = createDialogs(dialogs);

  // Full chrome themes the document (standalone viewer); embedded themes its subtree.
  const doc = rootEl.ownerDocument || (typeof document !== "undefined" ? document : null);
  const themeHost = chrome === "full" && doc?.documentElement ? doc.documentElement : rootEl;
  const restoreTheme = theme ? applyThemeTokens(themeHost, theme) : null;
  // Tri-state theme (light / dark / follow system): a host-injected mode wins over
  // the built-in palette; headless/embedded instances never own the mode.
  const themeMode = chrome === "full" && !theme?.mode ? bindThemeMode({ root: themeHost }) : null;

  const ac = new AbortController();
  const ctx = {
    root: rootEl,
    dom,
    toast,
    dialogs: dialogService,
    themeHost,
    themeMode,
    chrome,
    /** True when this instance is the most recently mounted / interacted one. */
    isActive: () => mounted[mounted.length - 1] === ctx,
    /** Claim the active slot (pointerdown/focusin inside this root). */
    activate() {
      const i = mounted.indexOf(ctx);
      if (i >= 0 && i !== mounted.length - 1) {
        mounted.splice(i, 1);
        mounted.push(ctx);
      }
    },
    destroy() {
      if (ctx._destroyed) return;
      ctx._destroyed = true;
      const i = mounted.indexOf(ctx);
      if (i >= 0) mounted.splice(i, 1);
      try {
        ac.abort();
      } catch {
        /* already aborted */
      }
      themeMode?.destroy();
      restoreTheme?.();
      dialogService.destroy();
      toast.clear();
      dom.clear();
    },
  };

  mounted.push(ctx);
  rootEl.addEventListener("pointerdown", ctx.activate, { capture: true, signal: ac.signal });
  rootEl.addEventListener("focusin", ctx.activate, { capture: true, signal: ac.signal });
  return ctx;
}
