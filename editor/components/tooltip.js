// ============================================================================
// components/tooltip.js — Tooltip primitive (400ms delay)
// ----------------------------------------------------------------------------
// Replaces the native title= (no delay control, uncontrollable styling). Attach to
// any element:
//   attachTooltip(el, "text")  → shows after 400ms hover; hides on leave/press
// A single shared layer node is used, avoiding one DOM node per element.
// ============================================================================

const DELAY = 400;
let layer = null;
let timer = 0;

function ensureLayer() {
  if (layer) return layer;
  layer = document.createElement("div");
  layer.className = "pptd-tooltip";
  layer.hidden = true;
  document.body.appendChild(layer);
  return layer;
}

function show(el, text) {
  const box = ensureLayer();
  box.textContent = text;
  box.hidden = false;
  const r = el.getBoundingClientRect();
  box.style.left = `${Math.round(r.left + r.width / 2)}px`;
  box.style.top = `${Math.round(r.bottom + 6)}px`;
}

function hide() {
  clearTimeout(timer);
  if (layer) layer.hidden = true;
}

/**
 * Attach a delayed tooltip to an element.
 * @param {HTMLElement} el
 * @param {string} text
 * @returns {() => void} unbind
 */
export function attachTooltip(el, text) {
  const onEnter = () => {
    clearTimeout(timer);
    timer = setTimeout(() => show(el, text), DELAY);
  };
  el.addEventListener("pointerenter", onEnter);
  el.addEventListener("pointerleave", hide);
  el.addEventListener("pointerdown", hide);
  return () => {
    el.removeEventListener("pointerenter", onEnter);
    el.removeEventListener("pointerleave", hide);
    el.removeEventListener("pointerdown", hide);
    hide();
  };
}
