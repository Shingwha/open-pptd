// ============================================================================
// components/menu.js — Menu primitive (submenu / shortcut hints / icon slot)
// ----------------------------------------------------------------------------
// Shell .menu / item .mi / separator .msep / disabled .dis, matching design
// §03 context-menu form. Also compatible with the existing file-menu .file-menu*
// styles (menu() accepts a className).
// ============================================================================

/** Menu container. className defaults to .menu; the file menu passes "file-menu". */
export function menu({ className = "menu", id = "" } = {}) {
  const el = document.createElement("div");
  el.className = className;
  el.hidden = true;
  if (id) el.id = id;
  return el;
}

/**
 * Menu item.
 * @param {string} label
 * @param {object} [opts] { icon, hint, submenu, submenuItems, onClick, disabled, danger, className }
 *   submenuItems: HTMLElement[] — second-level items (open on hover/click, flips left when out of bounds)
 */
export function menuItem(label, opts = {}) {
  const {
    icon = "", hint = "", submenu = false, submenuItems = null,
    onClick, disabled = false, danger = false, className = "",
  } = opts;
  const item = document.createElement("div");
  item.className = "mi" + (disabled ? " dis" : "") + (className ? " " + className : "");
  if (danger) item.style.color = "var(--danger)";
  if (icon) {
    const ic = document.createElement("span");
    ic.className = "mi-ic";
    ic.innerHTML = icon;
    item.appendChild(ic);
  }
  item.appendChild(document.createTextNode(label));
  if (submenu || submenuItems) item.appendChild(document.createTextNode(" ▸"));
  if (hint) {
    const k = document.createElement("span");
    k.className = "k";
    k.textContent = hint;
    item.appendChild(k);
  }
  if (submenuItems?.length) {
    item.classList.add("has-sub");
    attachSubmenu(item, submenuItems);
  } else if (!disabled && onClick) {
    item.addEventListener("click", onClick);
  }
  return item;
}

/** Second-level menu: mounted inside the item (.submenu), opens on hover/click; flips left when out of bounds. */
function attachSubmenu(item, nodes) {
  const sub = document.createElement("div");
  sub.className = "menu submenu";
  sub.hidden = true;
  for (const n of nodes) sub.appendChild(n);
  item.appendChild(sub);
  const place = () => {
    const r = item.getBoundingClientRect();
    const w = sub.offsetWidth || 180;
    const h = sub.offsetHeight || 140;
    const left = r.right - 4 + w > window.innerWidth - 8 ? Math.max(8, r.left - w + 4) : r.right - 4;
    const top = Math.min(r.top - 4, Math.max(8, window.innerHeight - h - 8));
    sub.style.left = `${Math.max(8, left)}px`;
    sub.style.top = `${Math.max(8, top)}px`;
  };
  item.addEventListener("pointerenter", () => {
    sub.hidden = false;
    place();
  });
  item.addEventListener("pointerleave", (e) => {
    if (sub.contains(e.relatedTarget)) return; // moving into the submenu does not close it
    sub.hidden = true;
  });
  item.addEventListener("click", (e) => {
    if (e.target.closest(".submenu")) return;
    sub.hidden = !sub.hidden;
    if (!sub.hidden) place();
  });
}

/** Menu separator line. */
export function menuSeparator() {
  const s = document.createElement("div");
  s.className = "msep";
  return s;
}

/** Section title inside a menu. */
export function menuLabel(text) {
  const l = document.createElement("div");
  l.className = "file-menu-label";
  l.textContent = text;
  return l;
}

// ----------------------------------------------------------------------------
// Pointer-position popup menu (context menu / thumbnail-bar menu share one open/close and positioning path)
// ----------------------------------------------------------------------------
let activePopup = null;

/** Close the active popup menu (no-op when none). */
export function closePopupMenu() {
  activePopup?.close();
}

/**
 * Open a menu at the pointer position (clamped into the viewport; auto-closes on
 * outside click / Esc / wheel / blur / resize).
 * @param {number} x client x
 * @param {number} y client y
 * @param {HTMLElement[]} nodes menu content (menuItem/menuSeparator products)
 * @param {object} [opts] { className?: extra class }
 * @returns {{ el: HTMLElement, close(): void }}
 */
export function openMenuAt(x, y, nodes, { className = "" } = {}) {
  closePopupMenu();
  const el = menu({ className: "menu" + (className ? " " + className : "") });
  for (const n of nodes) if (n) el.appendChild(n);

  const ac = new AbortController();
  const close = () => {
    if (!el.isConnected) return;
    ac.abort();
    el.remove();
    if (activePopup?.el === el) activePopup = null;
  };
  document.addEventListener("pointerdown", (e) => { if (!el.contains(e.target)) close(); }, { signal: ac.signal });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); }, { signal: ac.signal });
  window.addEventListener("wheel", close, { passive: true, signal: ac.signal });
  window.addEventListener("blur", close, { signal: ac.signal });
  window.addEventListener("resize", close, { signal: ac.signal });

  // Measure offscreen first, then clamp into the viewport (avoids a flash at the wrong spot)
  el.style.position = "fixed";
  el.style.left = "-9999px";
  el.style.top = "0";
  document.body.appendChild(el);
  el.hidden = false;
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  el.style.left = `${Math.max(6, Math.min(x, window.innerWidth - w - 6))}px`;
  el.style.top = `${Math.max(6, Math.min(y, window.innerHeight - h - 6))}px`;

  const popup = { el, close };
  activePopup = popup;
  return popup;
}
