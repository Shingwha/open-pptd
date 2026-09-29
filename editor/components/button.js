// ============================================================================
// components/button.js — Button 原语（3 尺寸 × 4 变体 + icon）
// ----------------------------------------------------------------------------
// 全站按钮的唯一构造点：属性面板 / 快速条 / 对话框 / 顶栏 / 工具栏共用，
// 取代散落的 .btn / .icon-btn / .status-btn / .thumb-add 多份重复定义（样式集中在
// editor/styles/primitives.css 的 .btn 体系）。
//
// 用法：
//   button("取消")                                    // 默认
//   button("导出", { variant: "primary", size: "sm" })
//   button("", { icon: "<svg…>", variant: "ghost", size: "icon", title: "撤销" })
//   button("删除", { variant: "danger", onClick: fn })
//
// className 可整体覆盖（兼容既有调用：className:"btn btn-sm"）。
// ============================================================================

const VARIANTS = { default: "", primary: "btn-primary", ghost: "btn-ghost", danger: "btn-danger" };
const SIZES = { default: "", sm: "btn-sm", lg: "btn-lg", icon: "icon-btn" };

/** 组装按钮类名（variant/size → CSS 类；className 覆盖时以 className 为准）。 */
export function btnClass({ variant = "default", size = "default", className = "" } = {}) {
  if (className) return className;
  const parts = ["btn", VARIANTS[variant] ?? "", SIZES[size] ?? ""].filter(Boolean);
  return parts.join(" ");
}

/**
 * 构造 <button>。
 * @param {string} label 文本（icon 时可为空）
 * @param {object} [opts]
 *   onClick?        (event) => void
 *   variant?        "default"|"primary"|"ghost"|"danger"
 *   size?           "default"|"sm"|"lg"|"icon"
 *   icon?           SVG 字符串（放在文字前）
 *   title?          悬浮提示（默认取 label）
 *   className?      整体覆盖类名（兼容旧调用）
 *   active?         追加 .on（快速条开关态）
 *   preventDefault? 默认 true：mousedown 阻止默认（避免 textarea 失焦）
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

/** 纯图标按钮（无文字，正方形命中区）。 */
export function iconButton(iconSvg, opts = {}) {
  return button("", { ...opts, icon: iconSvg, size: opts.size || "icon" });
}

/** 一组按钮（横向排列，用于工具栏/操作行）。 */
export function buttonRow(children, { className = "prop-actions" } = {}) {
  const row = document.createElement("div");
  row.className = className;
  for (const c of children) if (c) row.appendChild(c);
  return row;
}
