// ============================================================================
// app/file-menu.js — "File" dropdown shell (shared by the gallery and the editor)
// ----------------------------------------------------------------------------
// Desktop-app mental model: file operations live in a File menu. The gallery
// (as the start page) puts "open editor / open / recent" there; the editor adds
// new/save/export — same shell, content rendered per context. The shell owns the
// popover open/close (positioning / outside-click close / resize repositioning
// all go through popover.js), the item builders (item/sep/label) and the
// "recently opened" section (IndexedDB handle list).
// ============================================================================

import { listRecent } from "./project/handle-store.js";
import { attachPopover } from "../popover.js";

/**
 * Bind a "File" dropdown.
 * @param anchor the trigger button (click toggles open/close)
 * @param renderBody async ({ menu, item, sep, label, appendRecents }) => void
 *   called on every open (content is refreshed each time, so the recent list never goes stale)
 */
export function createFileMenu(anchor, renderBody) {
  let menu = null;
  let popover = null;
  const ac = new AbortController();
  const isOpen = () => menu?.classList.contains("open");

  function item(text, { hint = "", onClick }) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "file-menu-item";
    const label = document.createElement("span");
    label.textContent = text;
    btn.appendChild(label);
    if (hint) {
      const kbd = document.createElement("span");
      kbd.className = "file-menu-hint";
      kbd.textContent = hint;
      btn.appendChild(kbd);
    }
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      close();
      onClick();
    });
    return btn;
  }

  function sep() {
    const el = document.createElement("div");
    el.className = "file-menu-sep";
    return el;
  }

  function label(text) {
    const el = document.createElement("div");
    el.className = "file-menu-label";
    el.textContent = text;
    return el;
  }

  /** "Recent" section (not rendered when there are no entries). onPick(entry) is defined by the caller. */
  async function appendRecents(menu, onPick) {
    const recents = await listRecent();
    if (!recents.length) return;
    menu.append(sep(), label("最近打开"));
    for (const entry of recents) {
      menu.appendChild(item(entry.name, { hint: timeAgo(entry.ts), onClick: () => onPick(entry) }));
    }
  }

  /** Relative time (secondary text in the recent list). */
  function timeAgo(ts) {
    const diff = Date.now() - ts;
    if (diff < 60_000) return "刚刚";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
    return new Date(ts).toLocaleDateString();
  }

  async function open() {
    if (!menu) {
      menu = document.createElement("div");
      menu.className = "file-menu";
      document.body.appendChild(menu);
      // Popover shell (left-aligned below the anchor / outside-click and Esc close / resize reposition)
      popover = attachPopover(anchor, menu, { align: "left", isOpen, close });
    }
    menu.innerHTML = "";
    await renderBody({ menu, item, sep, label, appendRecents });
    menu.classList.add("open");
    popover.position(); // show first, then position: offsetWidth only has a value once visible
  }

  function close() {
    menu?.classList.remove("open");
  }

  anchor.addEventListener("click", (e) => {
    e.stopPropagation();
    isOpen() ? close() : open();
  }, { signal: ac.signal });

  return {
    /** Release: unbind the anchor listener, drop the popover and the global close listeners. */
    destroy() {
      ac.abort();
      popover?.destroy();
      popover = null;
      menu?.remove();
      menu = null;
    },
  };
}
