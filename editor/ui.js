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

/** 属性分组容器（标题可点击折叠，默认展开；折叠态由 CSS 隐藏非标题子节点）。 */
export function group(title) {
  const g = document.createElement("div");
  g.className = "prop-group";
  const t = document.createElement("div");
  t.className = "prop-group-title";
  t.textContent = title;
  t.title = "点击折叠/展开";
  t.addEventListener("click", () => g.classList.toggle("collapsed"));
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

/**
 * 双列紧凑格（label 上置 + 控件），用于数值类小字段。
 */
export function cell(label, control) {
  const wrap = document.createElement("div");
  wrap.className = "prop-cell";
  const span = document.createElement("span");
  span.className = "prop-cell-label";
  span.textContent = label;
  wrap.append(span, control);
  return wrap;
}

/**
 * 三合一颜色控件：色块按钮（弹主题色面板）+ 取色器 + hex 文本（支持 #RRGGBBAA）。
 * swatches = [{key, value}]（value 为解析后的 hex，点击回填 $key 令牌）。
 * 弹层由色块按钮开关，点击外部关闭；行内只占一排，不挤压布局。
 */
export function colorField(value, onCommit, { resolve, swatches = [], onFocus, onBlur } = {}) {
  const wrap = document.createElement("div");
  wrap.className = "color-field";

  const hexOf = (v) => { const h = resolve ? resolve(v) : v; return /^#[0-9a-fA-F]{6}$/.test(h || "") ? h : null; };

  // 色块按钮：展示当前解析色，点击开关主题色弹层
  const swatchBtn = document.createElement("button");
  swatchBtn.type = "button";
  swatchBtn.className = "color-swatch-btn";
  swatchBtn.title = "主题色";
  // 展示当前解析色：显式传入优先（取色器拖动），否则 hex 输入框（可能是 $key）
  const paint = (raw) => {
    const v = raw || hex.value.trim() || picker.value;
    swatchBtn.style.background = hexOf(v) || "#ffffff";
  };

  const picker = colorInput(value, onCommit, { resolve, onFocus, onBlur });
  picker.addEventListener("input", () => paint(picker.value)); // 拖动取色器时同步色块
  const hex = document.createElement("input");
  hex.type = "text";
  hex.className = "color-hex";
  hex.value = value || "";
  hex.placeholder = "#RRGGBB";
  hex.title = "支持 #RRGGBB 与 #RRGGBBAA";
  hex.addEventListener("change", () => {
    const v = hex.value.trim();
    if (/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v)) {
      onCommit(v);
      const h6 = hexOf(v);
      if (h6) picker.value = h6;
      paint();
    } else {
      hex.value = value || "";
    }
  });

  // 主题色弹层：fixed 定位（不依赖父容器 overflow，永不裁剪），打开时按按钮位置计算
  const pop = document.createElement("div");
  pop.className = "color-pop";
  pop.hidden = true;
  const positionPop = () => {
    const r = swatchBtn.getBoundingClientRect();
    const popH = pop.offsetHeight || 220;
    const W = 224;
    pop.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - W - 8))}px`;
    if (window.innerHeight - r.bottom - 8 < popH && r.top > popH + 8) {
      pop.style.top = `${Math.max(8, r.top - popH - 6)}px`; // 下方空间不足 → 向上弹出
    } else {
      pop.style.top = `${r.bottom + 6}px`;
    }
  };
  for (const s of swatches) {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "color-pop-item";
    dot.title = s.key;
    const chip = document.createElement("span");
    chip.className = "color-pop-chip";
    chip.style.background = s.value || "#ccc";
    const name = document.createElement("span");
    name.className = "color-pop-name";
    name.textContent = s.key.replace("$", "");
    dot.append(chip, name);
    dot.addEventListener("click", () => {
      onCommit(s.key);
      hex.value = s.key;
      const h6 = hexOf(s.key);
      if (h6) picker.value = h6;
      paint();
      pop.hidden = true;
    });
    pop.appendChild(dot);
  }
  if (swatches.length) {
    swatchBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      pop.hidden = !pop.hidden;
      if (!pop.hidden) positionPop(); // 显示后测量并定位（fixed，脱离父容器裁剪）
    });
    window.addEventListener("resize", () => { if (!pop.hidden) positionPop(); });
    document.addEventListener("click", (e) => {
      if (!pop.hidden && !pop.contains(e.target)) pop.hidden = true;
    });
  } else {
    swatchBtn.hidden = true; // 无主题色数据时不显示色块按钮
  }

  wrap.append(swatchBtn, picker, hex, pop);
  paint(); // 初始渲染色块（此时 picker/hex 已就绪）
  return wrap;
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

/** 窄屏断点（≤900px）：缩略图缩窄、快速条吸底横滑共用（与 styles.css 响应式块同步）。 */
export const isNarrow = () => window.matchMedia("(max-width: 900px)").matches;

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
