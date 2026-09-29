// ============================================================================
// components/menu.js — Menu 原语（子菜单 / 快捷键提示 / 图标位）
// ----------------------------------------------------------------------------
// 外壳 .menu / 条目 .mi / 分隔 .msep / 禁用 .dis，对齐设计稿 §03 右键菜单形态。
// 同时兼容既有文件菜单的 .file-menu* 样式（menu() 可传 className）。
// ============================================================================

/** 菜单容器。className 默认 .menu；文件菜单传 "file-menu"。 */
export function menu({ className = "menu", id = "" } = {}) {
  const el = document.createElement("div");
  el.className = className;
  el.hidden = true;
  if (id) el.id = id;
  return el;
}

/**
 * 菜单条目。
 * @param {string} label
 * @param {object} [opts] { icon, hint, submenu, submenuItems, onClick, disabled, danger, className }
 *   submenuItems: HTMLElement[] —— 二级菜单条目（悬停/点击展开，越界自动向左翻）
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

/** 二级菜单：挂在条目内（.submenu），悬停/点击展开；越界时向左翻。 */
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
    if (sub.contains(e.relatedTarget)) return; // 移入子菜单不收起
    sub.hidden = true;
  });
  item.addEventListener("click", (e) => {
    if (e.target.closest(".submenu")) return;
    sub.hidden = !sub.hidden;
    if (!sub.hidden) place();
  });
}

/** 菜单分隔线。 */
export function menuSeparator() {
  const s = document.createElement("div");
  s.className = "msep";
  return s;
}

/** 菜单内的小节标题。 */
export function menuLabel(text) {
  const l = document.createElement("div");
  l.className = "file-menu-label";
  l.textContent = text;
  return l;
}

// ----------------------------------------------------------------------------
// 指针处弹出菜单（右键上下文菜单 / 缩略条菜单共用同一套开合与定位）
// ----------------------------------------------------------------------------
let activePopup = null;

/** 关闭当前弹出菜单（无则忽略）。 */
export function closePopupMenu() {
  activePopup?.close();
}

/**
 * 在指针位置打开菜单（视口内 clamp；外点/ Esc / 滚轮/失焦/尺寸变化自动关闭）。
 * @param {number} x 客户区 x
 * @param {number} y 客户区 y
 * @param {HTMLElement[]} nodes 菜单内容（menuItem/menuSeparator 产物）
 * @param {object} [opts] { className?: 追加类名 }
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

  // 先放屏幕外测量尺寸，再 clamp 到视口内（避免闪现错位）
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
