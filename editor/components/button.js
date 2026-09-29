// ============================================================================
// components/button.js — Button primitive (3 sizes × 4 variants + icon)
// ----------------------------------------------------------------------------
// The only button construction point site-wide: shared by the property panel /
// quickbar / dialogs / topbar / toolbar, replacing scattered .btn / .icon-btn /
// .status-btn / .thumb-add duplicates (styles centralized in the .btn system in
// editor/styles/primitives.css).
//
// Usage:
//   button("Cancel")                                  // default
//   button("Export", { variant: "primary", size: "sm" })
//   button("", { icon: "<svg…>", variant: "ghost", size: "icon", title: "Undo" })
//   button("Delete", { variant: "danger", onClick: fn })
//
// className can override everything (compatible with existing calls: className:"btn btn-sm").
// ============================================================================

const VARIANTS = { default: "", primary: "btn-primary", ghost: "btn-ghost", danger: "btn-danger" };
const SIZES = { default: "", sm: "btn-sm", lg: "btn-lg", icon: "icon-btn" };

/** Assemble the button class list (variant/size → CSS classes; className wins when provided). */
export function btnClass({ variant = "default", size = "default", className = "" } = {}) {
  if (className) return className;
  const parts = ["btn", VARIANTS[variant] ?? "", SIZES[size] ?? ""].filter(Boolean);
  return parts.join(" ");
}

/**
 * Construct a <button>.
 * @param {string} label text (may be empty for icon-only)
 * @param {object} [opts]
 *   onClick?        (event) => void
 *   variant?        "default"|"primary"|"ghost"|"danger"
 *   size?           "default"|"sm"|"lg"|"icon"
 *   icon?           SVG string (placed before the text)
 *   title?          hover tooltip (defaults to label)
 *   className?      full class override (compatible with old calls)
 *   active?         append .on (quickbar toggle state)
 *   preventDefault? default true: prevent default on mousedown (avoids textarea blur)
 *   disabled?
 * @returns {HTMLButtonElement}
 */
export function button(label, opts = {}) {
  const {
    onClick,
    icon = "",
    title = "",
    className = "",
    variant = "default",
    size = "default",
    active = false,
    preventDefault = true,
    disabled = false,
  } = opts;
  const b = document.createElement("button");
  b.type = "button";
  b.className = btnClass({ variant, size, className }) + (active ? " on" : "");
  b.title = title || label || "";
  if (icon) b.innerHTML = icon;
  if (label) b.appendChild(document.createTextNode(label));
  if (disabled) b.disabled = true;
  if (preventDefault) b.addEventListener("mousedown", (e) => e.preventDefault());
  if (onClick) b.addEventListener("click", onClick);
  return b;
}

/** Icon-only button (no text, square hit area). */
export function iconButton(iconSvg, opts = {}) {
  return button("", { ...opts, icon: iconSvg, size: opts.size || "icon" });
}

/** A row of buttons (horizontal, for toolbars/action rows). */
export function buttonRow(children, { className = "prop-actions" } = {}) {
  const row = document.createElement("div");
  row.className = className;
  for (const c of children) if (c) row.appendChild(c);
  return row;
}
