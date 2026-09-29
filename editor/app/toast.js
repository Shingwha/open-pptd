// ============================================================================
// app/toast.js — unified toast notifications (all operation feedback goes here)
// ----------------------------------------------------------------------------
// Usage: showToast(text, "success") / showToast(text, "danger") / showToast(text, "info").
// Toasts stack in the top-right corner and auto-dismiss; the left color bar
// distinguishes success / failure / info. Persistent status (e.g. live-reload
// state) does not go through toasts — the topbar indicator covers that.
// ============================================================================

let container = null;

/** Tear down the toast layer (createEditor destroy: drops the container, no DOM left behind). */
export function clearToasts() {
  container?.remove();
  container = null;
}

export function showToast(text, type = "info", duration = 3000) {
  if (typeof document === "undefined") return; // Safe under Node (tests/CLI)
  if (!container) {
    container = document.createElement("div");
    container.className = "toast-container";
    document.body.appendChild(container);
  }
  const t = document.createElement("div");
  t.className = `toast toast-${type}`;
  t.textContent = text;
  container.appendChild(t);
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => t.remove(), 220);
  }, duration);
}
