// ============================================================================
// components/tooltip.js — Tooltip 原语（400ms 延迟）
// ----------------------------------------------------------------------------
// 取代原生 title=（无延迟控制、样式不可控）。挂到任意元素上：
//   attachTooltip(el, "文字")  → 悬停 400ms 后显示；离开/按下即隐藏
// 只用一个共享浮层节点，避免每个元素建 DOM。
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
 * 给元素挂延迟提示。
 * @param {HTMLElement} el
 * @param {string} text
 * @returns {() => void} 解绑
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
