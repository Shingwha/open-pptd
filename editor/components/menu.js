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
 * @param {object} [opts] { icon, hint, submenu, onClick, disabled, danger, className }
 */
export function menuItem(label, opts = {}) {
  const { icon = "", hint = "", submenu = false, onClick, disabled = false, danger = false, className = "" } = opts;
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
  if (submenu) item.appendChild(document.createTextNode(" ▸"));
  if (hint) {
    const k = document.createElement("span");
    k.className = "k";
    k.textContent = hint;
    item.appendChild(k);
  }
  if (!disabled && onClick) item.addEventListener("click", onClick);
  return item;
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
