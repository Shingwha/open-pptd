// editor/components/button.js — Button primitive (3 sizes × 4 variants + icon)
// The only button construction point site-wide: shared by the property panel,
// dialogs, topbar and toolbar. className overrides everything, so older
// className:"btn btn-sm" call sites keep working; styles live in primitives.css.
// Usage: button("Export", { variant: "primary", size: "sm" })
//        button("", { icon: svg, variant: "ghost", size: "icon", title: "Undo" })

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
 *   className?      full class override (wins over variant/size)
 *   active?         append .on (toggle state)
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
