// ============================================================================
// app/view/zoom-ctl.js — zoom control drag-to-move
// ----------------------------------------------------------------------------
// Docked at the bottom center of the canvas by default (left:50%/bottom in
// editor/styles/); dragging the control's empty space (including the percentage
// label) moves it anywhere in the stage, out of the way of canvas content.
// Position is stored in localStorage as a fraction of the stage width/height
// (reasonable across window sizes/devices) and always clamped inside the stage so
// it cannot be lost; double-clicking the percentage label restores the default dock.
// ============================================================================

const POS_KEY = "pptd.zoomCtlPos";

export function makeZoomCtlDraggable(stage, ctl, label) {
  if (!stage || !ctl) return { destroy() {} };
  const ac = new AbortController();

  /** Switch to explicit-coordinate positioning (overriding the CSS dock styles) and clamp into the stage so it stays fully visible. */
  function place(left, top) {
    const x = Math.min(stage.clientWidth - ctl.offsetWidth, Math.max(0, left));
    const y = Math.min(stage.clientHeight - ctl.offsetHeight, Math.max(0, top));
    ctl.style.left = `${x}px`;
    ctl.style.top = `${y}px`;
    ctl.style.right = "auto";
    ctl.style.bottom = "auto";
    ctl.style.transform = "none";
    ctl.classList.add("docked");
  }

  function save() {
    const r = ctl.getBoundingClientRect();
    const s = stage.getBoundingClientRect();
    try {
      localStorage.setItem(
        POS_KEY,
        JSON.stringify({
          fx: (r.left - s.left) / Math.max(1, s.width),
          fy: (r.top - s.top) / Math.max(1, s.height),
        })
      );
    } catch {
      /* ignore write failures (private mode etc.) */
    }
  }

  // Restore the last position (fraction × current stage size, then clamped)
  try {
    const saved = JSON.parse(localStorage.getItem(POS_KEY) || "null");
    if (saved && Number.isFinite(saved.fx) && Number.isFinite(saved.fy)) {
      place(saved.fx * stage.clientWidth, saved.fy * stage.clientHeight);
    }
  } catch {
    /* ignore corrupt data */
  }

  ctl.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button")) return; // zoom buttons: a normal click, no drag
    const s = stage.getBoundingClientRect();
    const r = ctl.getBoundingClientRect();
    const offX = e.clientX - r.left;
    const offY = e.clientY - r.top;
    // First drag: switch from the dock styles (left:50% + translateX(-50%) + bottom) to explicit coordinates
    place(r.left - s.left, r.top - s.top);
    ctl.classList.add("dragging");
    try {
      ctl.setPointerCapture(e.pointerId);
    } catch {
      /* if capture fails, window-level move still works as a fallback; ignore */
    }
    e.preventDefault(); // prevent text selection
    const onMove = (ev) => {
      place(ev.clientX - s.left - offX, ev.clientY - s.top - offY);
    };
    const onUp = () => {
      ctl.classList.remove("dragging");
      ctl.removeEventListener("pointermove", onMove);
      ctl.removeEventListener("pointerup", onUp);
      ctl.removeEventListener("pointercancel", onUp);
      save();
    };
    ctl.addEventListener("pointermove", onMove);
    ctl.addEventListener("pointerup", onUp);
    ctl.addEventListener("pointercancel", onUp);
  }, { signal: ac.signal });

  // Double-click the percentage label: restore the default dock (bottom center of the canvas)
  label?.addEventListener("dblclick", () => {
    ctl.style.left = "";
    ctl.style.top = "";
    ctl.style.right = "";
    ctl.style.bottom = "";
    ctl.style.transform = "";
    ctl.classList.remove("docked");
    try {
      localStorage.removeItem(POS_KEY);
    } catch {
      /* ignore */
    }
  }, { signal: ac.signal });

  // Window resize: re-clamp a custom position into the stage (a docked control does not move)
  window.addEventListener("resize", () => {
    if (!ctl.classList.contains("docked")) return;
    const r = ctl.getBoundingClientRect();
    const s = stage.getBoundingClientRect();
    place(r.left - s.left, r.top - s.top);
  }, { signal: ac.signal });

  return { destroy: () => ac.abort() };
}
