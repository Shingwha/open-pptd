// ============================================================================
// ui.js — 共享表单控件（属性面板 / 快速条 / 类型注册表 props 共用）
// ----------------------------------------------------------------------------
// 交互约定：控件支持 { onFocus, onBlur } 钩子，属性面板借此实现
// 「focus → beginChange 快照 / blur → endChange 重渲染」的事务模式；
// 快速条则不传钩子，直接在 onCommit 里包 change()。
// ============================================================================

/** 添加菜单图标（描边 SVG，继承 currentColor）。 */
export function svgIcon(inner) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

/** 属性行：label + 控件。 */
export function field(label, control) {
  const wrap = document.createElement("label");
  wrap.className = "prop-field";
  const span = document.createElement("span");
  span.className = "prop-label";
  span.textContent = label;
  wrap.append(span, control);
  return wrap;
}

/** 属性分组容器。 */
export function group(title) {
  const g = document.createElement("div");
  g.className = "prop-group";
  const t = document.createElement("div");
  t.className = "prop-group-title";
  t.textContent = title;
  g.appendChild(t);
  return g;
}

/** 文本输入（rows > 0 时为 textarea，input 事件实时提交；否则 change 提交）。
 * textarea 高度自动跟随内容（min 一行 / max 140px 滚动），无需手动设 rows。 */
export function textInput(value, onCommit, { rows = 0, placeholder = "", onFocus, onBlur, autoResize = true } = {}) {
  const input = document.createElement(rows ? "textarea" : "input");
  if (rows) {
    input.rows = rows;
    input.placeholder = placeholder;
    input.style.cssText = "resize:none;overflow-y:auto;min-height:34px;max-height:140px;";
    const fit = () => {
      input.style.height = "auto";
      input.style.height = Math.min(Math.max(input.scrollHeight, 34), 140) + "px";
    };
    input.addEventListener("input", fit);
    if (autoResize) requestAnimationFrame(fit); // 初始高度按内容（面板刚插入 DOM 才能量到）
  } else {
    input.type = "text";
    input.placeholder = placeholder;
  }
  input.value = value || "";
  if (onFocus) input.addEventListener("focus", onFocus);
  input.addEventListener(rows ? "input" : "change", () => onCommit(input.value));
  if (onBlur) input.addEventListener("blur", onBlur);
  return input;
}

/** 数字输入（实时提交，非法值忽略）。 */
export function numInput(value, onCommit, { min = -10000, step = 1, onFocus, onBlur } = {}) {
  const input = document.createElement("input");
  input.type = "number";
  input.value = value;
  input.step = step;
  if (onFocus) input.addEventListener("focus", onFocus);
  input.addEventListener("input", () => {
    const v = Number(input.value);
    if (Number.isFinite(v)) onCommit(v);
  });
  if (onBlur) input.addEventListener("blur", onBlur);
  return input;
}

/**
 * 颜色选择。
 * value 可为 hex 或主题令牌（$primary 等）；opts.resolve(value) → 具体 hex，
 * 用于回填 input 当前值（否则令牌永远显示默认黑，用户无法看到真实颜色）。
 * 仅接受 #RRGGBB 回填，其余不设置（保持浏览器默认）。
 */
export function colorInput(value, onCommit, { className = "", title = "", resolve, onFocus, onBlur } = {}) {
  const input = document.createElement("input");
  input.type = "color";
  if (className) input.className = className;
  if (title) input.title = title;
  const hex = resolve ? resolve(value) : value;
  if (/^#[0-9a-fA-F]{6}$/.test(hex || "")) input.value = hex;
  if (onFocus) input.addEventListener("focus", onFocus);
  // input = 取色拖动中实时提交（选择器内拖动即生效）；change = 选择器关闭兜底（幂等）
  input.addEventListener("input", () => onCommit(input.value));
  input.addEventListener("change", () => onCommit(input.value));
  if (onBlur) input.addEventListener("blur", onBlur);
  return input;
}

/** 下拉选择。options = [[value, label], ...]。 */
export function selectInput(options, value, onCommit, { className = "", title = "", onFocus, onBlur } = {}) {
  const sel = document.createElement("select");
  if (className) sel.className = className;
  if (title) sel.title = title;
  for (const [v, label] of options) {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = label;
    sel.appendChild(opt);
  }
  sel.value = value;
  if (onFocus) sel.addEventListener("focus", onFocus);
  sel.addEventListener("change", () => onCommit(sel.value));
  if (onBlur) sel.addEventListener("blur", onBlur);
  return sel;
}

/** 勾选框（label 文本 + 控件）。 */
export function checkbox(label, checked, onCommit, { onFocus, onBlur } = {}) {
  const wrap = document.createElement("label");
  wrap.className = "prop-check";
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = !!checked;
  if (onFocus) cb.addEventListener("focus", onFocus);
  cb.addEventListener("change", () => onCommit(cb.checked));
  if (onBlur) cb.addEventListener("blur", onBlur);
  wrap.appendChild(cb);
  wrap.appendChild(document.createTextNode(label));
  return wrap;
}

/** 按钮。active 追加 .on（快速条开关态）；preventDefault 默认防 textarea 失焦。 */
export function button(label, onClick, { title = "", className = "btn btn-sm", active = false, preventDefault = true } = {}) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = className + (active ? " on" : "");
  b.title = title || label;
  b.textContent = label;
  if (preventDefault) b.addEventListener("mousedown", (e) => e.preventDefault());
  b.addEventListener("click", onClick);
  return b;
}

// ----------------------------------------------------------------------------
// 快速条专用控件（qb-* 样式）
// ----------------------------------------------------------------------------

export function quickbarColor(value, onCommit) {
  return colorInput(value, onCommit, { className: "qb-color", title: "颜色" });
}

export function quickbarSelect(options, value, onCommit) {
  return selectInput(options, value, onCommit, { className: "qb-select" });
}

export function quickbarBtn(label, title, onClick, active) {
  return button(label, onClick, { title, className: "qb-btn", active });
}

export function quickbarTextBtn(label, title, onClick) {
  return button(label, onClick, { title, className: "qb-text-btn" });
}
