// editor/app/toast.js — toast notifications, one layer per instance
// createToast(rootEl) returns show(text, type?, duration?) and clear(); each instance
// owns its layer, so two editors on one page never share or clear each other's
// messages. .toast-container is fixed, so the mount point anchor does not matter.

export function createToast(rootEl) {
  const host = rootEl || (typeof document !== "undefined" ? document.body : null);
  let container = null;
  const timers = new Set();

  function later(fn, ms) {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
  }

  /** Show one toast (stacked; auto-dismissed after `duration`). */
  function show(text, type = "info", duration = 3000) {
    if (!host || typeof document === "undefined") return; // Node/SSR: no-op
    if (!container || !container.isConnected) {
      container = document.createElement("div");
      container.className = "toast-container";
      host.appendChild(container);
    }
    const t = document.createElement("div");
    t.className = `toast toast-${type}`;
    t.textContent = text;
    container.appendChild(t);
    requestAnimationFrame(() => t.classList.add("show"));
    later(() => {
      t.classList.remove("show");
      later(() => t.remove(), 220);
    }, duration);
  }

  /** Tear down the layer (destroy: no DOM and no pending timers left behind). */
  function clear() {
    for (const id of timers) clearTimeout(id);
    timers.clear();
    container?.remove();
    container = null;
  }

  return { show, clear };
}
