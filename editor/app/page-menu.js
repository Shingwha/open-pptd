// editor/app/page-menu.js — visible page menu in the thumbnail bar (#btn-page-menu)
// Operates on the current page: insert before/after, move forward/backward/first/last,
// delete. Every action goes through api.insertPage / movePage / deletePage (one
// beginChange snapshot + full render, so Ctrl+Z restores it).

import { menuItem, menuSeparator, openMenuAt } from "../components/menu.js";

/**
 * Bind the page menu button.
 * @param {object} opts { api, state, anchor }
 * @returns {{ destroy(): void }}
 */
export function bindPageMenu({ api, state, anchor }) {
  if (!anchor) return { destroy() {} };
  const ac = new AbortController();
  let popup = null;

  /** Close first, then run the action (a click always dismisses the menu). */
  const item = (label, opts = {}) =>
    menuItem(label, {
      ...opts,
      onClick: opts.disabled || !opts.onClick ? undefined : () => {
        popup?.close();
        opts.onClick();
      },
    });

  function open() {
    popup?.close();
    const pages = state.deck?.pages || [];
    const i = state.currentPage;
    const last = pages.length - 1;
    const nodes = [
      item("在当前页前插入", { onClick: () => api.insertPage(i) }),
      item("在当前页后插入", { onClick: () => api.insertPage(i + 1) }),
      menuSeparator(),
      item("前移一页", { disabled: i <= 0, onClick: () => api.movePage(i, i - 1) }),
      item("后移一页", { disabled: i >= last, onClick: () => api.movePage(i, i + 1) }),
      item("移到最前", { disabled: i <= 0, onClick: () => api.movePage(i, 0) }),
      item("移到最后", { disabled: i >= last, onClick: () => api.movePage(i, last) }),
      menuSeparator(),
      item("删除当前页", { danger: true, disabled: pages.length <= 1, onClick: () => api.deletePage(i) }),
    ];
    const r = anchor.getBoundingClientRect();
    // Open above the thumbnail bar (the bar sits at the bottom of the viewport)
    popup = openMenuAt(r.left, Math.max(8, r.top - 8), nodes, { className: "page-menu" });
    // openMenuAt clamps to the viewport; shift the menu up by its own height so it hugs the button
    const h = popup.el.offsetHeight || 0;
    popup.el.style.top = `${Math.max(8, r.top - h - 8)}px`;
    popup.el.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - (popup.el.offsetWidth || 180) - 8))}px`;
  }

  anchor.addEventListener("click", (e) => {
    e.stopPropagation();
    // The shared popup closes itself on an outside pointerdown (which precedes this
    // click on the anchor): a stale, detached popup means "reopen", not "close".
    if (popup?.el?.isConnected) {
      popup.close();
      popup = null;
      return;
    }
    popup = null;
    open();
  }, { signal: ac.signal });

  return {
    destroy() {
      ac.abort();
      popup?.close();
      popup = null;
    },
  };
}
