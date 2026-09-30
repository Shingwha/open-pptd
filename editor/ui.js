// ============================================================================
// ui.js — shared form controls (used by the property panel / quickbar / type-registry props)
// ----------------------------------------------------------------------------
// Interaction convention: controls support an { onBlur } hook, which the property
// panel uses to implement the "first commit → beginChange snapshot / blur →
// endChange re-render" transaction mode; the quickbar passes no hook and wraps
// change() directly in onCommit.
// ============================================================================

// svgIcon moved to icons.js (the single inline-icon source); re-exported here so existing import paths stay valid
export { svgIcon } from "./icons.js";
import { attachPopover } from "./popover.js";
import { button as coreButton } from "./components/button.js";

/** Property row: label + control. */
export function field(label, control) {
  const wrap = document.createElement("label");
  wrap.className = "prop-field";
  const span = document.createElement("span");
  span.className = "prop-label";
  span.textContent = label;
  wrap.append(span, control);
  return wrap;
}

/** Property group container (the title is click-to-collapse, expanded by default; collapsed state hides non-title children via CSS). */
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

/** Text input (textarea when rows > 0, committing on input; otherwise committing on change).
 * The textarea height follows its content (min one line / max 140px scroll), no manual rows needed. */
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
    if (autoResize) requestAnimationFrame(fit); // initial height by content (only measurable once the panel is in the DOM)
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

/** Number input (commits live; invalid values ignored). */
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
 * Color picker.
 * value may be a hex or a theme token ($primary etc.); opts.resolve(value) → a
 * concrete hex, used to fill in the input's current value (otherwise a token always
 * shows the default black and the user never sees the real color). Only #RRGGBB is
 * accepted for the fill; anything else is left alone (keeping the browser default).
 */
export function colorInput(value, onCommit, { className = "", title = "", resolve, onFocus, onBlur } = {}) {
  const input = document.createElement("input");
  input.type = "color";
  if (className) input.className = className;
  if (title) input.title = title;
  const hex = resolve ? resolve(value) : value;
  if (/^#[0-9a-fA-F]{6}$/.test(hex || "")) input.value = hex;
  if (onFocus) input.addEventListener("focus", onFocus);
  // input = commit live while dragging in the picker (dragging inside applies immediately); change = picker-close fallback (idempotent)
  input.addEventListener("input", () => onCommit(input.value));
  input.addEventListener("change", () => onCommit(input.value));
  if (onBlur) input.addEventListener("blur", onBlur);
  return input;
}

/**
 * Two-column compact cell (label above + control), for small numeric fields.
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
 * Three-in-one color control: swatch button (opens the theme-color panel) + picker + hex text (supports #RRGGBBAA).
 * swatches = [{key, value}] (value is the resolved hex; clicking writes back the $key token).
 * The panel is toggled by the swatch button and closes on an outside click; it occupies one row inline without squeezing the layout.
 */
export function colorField(value, onCommit, { resolve, swatches = [], onFocus, onBlur } = {}) {
  const wrap = document.createElement("div");
  wrap.className = "color-field";

  const hexOf = (v) => { const h = resolve ? resolve(v) : v; return /^#[0-9a-fA-F]{6}$/.test(h || "") ? h : null; };

  // Swatch button: shows the current resolved color, click toggles the theme-color panel
  const swatchBtn = document.createElement("button");
  swatchBtn.type = "button";
  swatchBtn.className = "color-swatch-btn";
  swatchBtn.title = "主题色";
  // Show the current resolved color: an explicit argument wins (picker drag), otherwise the hex input (possibly a $key)
  const paint = (raw) => {
    const v = raw || hex.value.trim() || picker.value;
    swatchBtn.style.background = hexOf(v) || "var(--panel)";
  };

  const picker = colorInput(value, onCommit, { resolve, onFocus, onBlur });
  picker.addEventListener("input", () => paint(picker.value)); // keep the swatch in sync while dragging the picker
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

  // Theme-color panel: fixed positioning (independent of parent overflow, never clipped);
  // positioning/outside-click close/resize reposition go through the popover.js generic piece (gap 6, flips up when there is not enough room below)
  const pop = document.createElement("div");
  pop.className = "color-pop";
  pop.hidden = true;
  for (const s of swatches) {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "color-pop-item";
    dot.title = s.key;
    const chip = document.createElement("span");
    chip.className = "color-pop-chip";
    chip.style.background = s.value || "var(--line-strong)";
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
    const popover = attachPopover(swatchBtn, pop, {
      gap: 6,
      width: 224, // hidden-state measurement fallback (offsetWidth/Height only have a value once visible)
      height: 220,
      flip: true,
      isOpen: () => !pop.hidden,
      close: () => { pop.hidden = true; },
    });
    swatchBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      pop.hidden = !pop.hidden;
      if (!pop.hidden) popover.position(); // measure and position after showing (fixed, escapes parent clipping)
    });
  } else {
    swatchBtn.hidden = true; // hide the swatch button when there is no theme-color data
  }

  wrap.append(swatchBtn, picker, hex, pop);
  paint(); // initial swatch paint (picker/hex are ready by now)
  return wrap;
}

/** Dropdown select. options = [[value, label], ...]. */
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

/** Checkbox (label text + control). */
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

/** Button. active appends .on (quickbar toggle state); preventDefault defaults to preventing textarea blur.
 * The implementation delegates to components/button.js (the Button primitive, the only button construction point site-wide). */
export function button(label, onClick, { title = "", className = "btn btn-sm", active = false, preventDefault = true } = {}) {
  return coreButton(label, {
    className,
    title,
    active,
    preventDefault,
    onClick,
  });
}

// ----------------------------------------------------------------------------
// Quickbar-only controls (qb-* styles)
// ----------------------------------------------------------------------------

/** Narrow breakpoint (px): thumbnail narrowing, bottom-docked quickbar horizontal scroll and the property drawer form share it
 * (in sync with the max-width media queries in editor/styles/; changes must match on both sides). */
export const BP_NARROW = 900;

export const isNarrow = () => window.matchMedia(`(max-width: ${BP_NARROW}px)`).matches;

/** Color swatch. Since decision D3 the bar has no text labels, so the title carries the meaning. */
export function quickbarColor(value, onCommit, title = "颜色") {
  return colorInput(value, onCommit, { className: "qb-color", title });
}

/** Compact dropdown. title carries the meaning in place of the removed text labels. */
export function quickbarSelect(options, value, onCommit, title = "") {
  return selectInput(options, value, onCommit, { className: "qb-select", title });
}

/** Text toggle (B / I). active appends .on (persistent on-state, accent-soft per the Line rules). */
export function quickbarBtn(label, title, onClick, active) {
  return button(label, onClick, { title, className: "qb-btn", active });
}

/** Icon-only button (⋯ / delete / type-specific icon actions); icon = an svgIcon() string. */
export function quickbarIconBtn(icon, title, onClick) {
  const b = button("", onClick, { title, className: "qb-icon-btn" });
  b.innerHTML = icon;
  return b;
}

export function quickbarTextBtn(label, title, onClick) {
  return button(label, onClick, { title, className: "qb-text-btn" });
}
