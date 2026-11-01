// editor/context.js — per-instance UI context (dom / toast / dialogs / theme)
// Every service is created per instance and passed down as `ui`; modules never
// import module-level singletons. `chrome: "full"` themes the document, embedded
// and headless instances theme their own subtree only. Keyboard shortcuts act
// only on the instance mounted or interacted with last.
//
// ui = { root, dom, toast, dialogs, events, themeHost, themeMode, chrome, isActive(),
//        activate(), destroy() }

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
    // 实例级事件总线：目前用于 "themechange"（detail.origin: design/history/load/editor），
    // Design 面板据此同步颜色行；不依赖跨实例的模块级单例。
    events: new EventTarget(),
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
