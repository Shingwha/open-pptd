// ============================================================================
// interaction/stage.js — stage gesture router (single entry / state arbitration)
// ----------------------------------------------------------------------------
// All pointer / wheel gestures are classified and arbitrated here; execution of
// element gestures is delegated to interaction/canvas.js (selection box / drag /
// resize / rotate). The sole owner of viewport state (zoom/pan) is
// app/view/viewport.js — this module only calls panBy / setZoom / zoomReset.
//
// Routing rules (pointerdown on #stage, capture phase, before inner controls):
//   1. floating controls (zoom bar / button rows / add menu / quickbar …) → pass through
//   2. space held / middle mouse button  → pan (anywhere, including over elements)
//   3. selection-box handle (resize/rotate/move) → element gesture
//   4. element body                      → select + move gesture
//   5. blank area (inside or outside canvas) → travel ≤4px = click to deselect,
//                                              >4px = pan
//   6. a second pointer lands            → pinch zoom (terminates any in-flight
//                                          gesture; anchor = midpoint of the two)
// Wheel: Ctrl/⌘ = anchored zoom, otherwise pan (passes through on overlays so
// native scrolling keeps working).
// Double-click: element → open its editor; blank → reset the fitted view.
// ============================================================================

export function createStageController(stage, opts) {
  const {
    element,      // interaction/canvas.js: { startGesture, startMarquee, cancelGesture, cancelMarquee, isGestureActive }
    select,       // (id, mode) => void  select (mode: replace/add/toggle)
    getSelected,  // () => id | null
    isSelected,   // (id) => boolean
    deselect,     // () => void  click blank to deselect
    onActivate,   // (id) => void  double-click an element to open its editor
    panBy, setZoom, getZoom, zoomReset,
  } = opts;
  if (!stage) return { destroy() {} };

  // Lifecycle: every listener is registered through a signal; destroy() detaches
  // them all at once (supports repeated mount/destroy).
  const ac = new AbortController();
  const on = (target, type, handler, o) =>
    target.addEventListener(type, handler, { ...(typeof o === "boolean" ? { capture: o } : o || {}), signal: ac.signal });

  // Floating controls carry their own click/scroll behaviour and are not stage gestures
  const FLOATING =
    ".fab-stack, .add-menu, .quickbar, " +
    "button, input, textarea, select, [contenteditable]";
  const isFloating = (t) => !!t.closest(FLOATING);

  // Selection-box handle → gesture type: a resize handle's data-handle value is
  // itself the direction (n/s/e/w/nw/ne/sw/se, see canvas.js); the rotate handle is "rotate"
  const handleMode = (t) =>
    t.closest("[data-handle]")?.dataset.handle || (t.closest("[data-rotate-handle]") ? "rotate" : null);

  // Touch: block browser gestures on the blank surface (page bounce / double-tap
  // zoom) so pointer events arrive intact. Elements and handles are covered by
  // .canvas's touch-action:none.
  on(
    stage,
    "touchstart",
    (e) => {
      if (!isFloating(e.target) && !handleMode(e.target) && !e.target.closest("[data-element-id]")) {
        e.preventDefault();
      }
    },
    { passive: false }
  );

  // --------------------------------------------------------------------------
  // Space hand tool (desktop): while space is held, dragging anywhere pans
  // --------------------------------------------------------------------------
  let spacePan = false;
  const isTyping = (e) => {
    const tag = (e.target.tagName || "").toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable;
  };
  on(document, "keydown", (e) => {
    // Keep native space behaviour on inputs and buttons (accessibility)
    if (e.code !== "Space" || e.repeat || isTyping(e) || e.target.closest?.("button")) return;
    spacePan = true;
    stage.classList.add("space-pan");
    e.preventDefault(); // prevent page scroll
  });
  on(document, "keyup", (e) => {
    if (e.code !== "Space") return;
    spacePan = false;
    stage.classList.remove("space-pan");
  });

  // --------------------------------------------------------------------------
  // Gesture state machine: pointers (active pointers) / tapPan (blank press) / pinch
  // --------------------------------------------------------------------------
  const pointers = new Map();
  let tapPan = null;
  let pinch = null;

  function startPan(e, tapDeselect = false) {
    tapPan = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, tapDeselect };
    stage.classList.add("panning");
    e.preventDefault(); // block text selection / focus / middle-click autoscroll
  }

  /** Second pointer lands: terminate any in-flight gesture (including element drag) and start pinch. */
  function beginPinch() {
    const wasDragging = element.isGestureActive?.();
    if (wasDragging) element.cancelGesture(); // commit the movement so far (same as a normal release)
    element.cancelMarquee?.(); // terminate marquee selection (two-finger gestures win)
    tapPan = null;
    stage.classList.remove("panning");
    const [a, b] = [...pointers.values()];
    pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom: getZoom?.() ?? 1 };
  }

  // Double-click detection: the second press does not start a new gesture
  // (avoids a spurious history snapshot); dblclick handles it instead.
  let lastTap = null;
  function isRepeatTap(e) {
    const now = performance.now();
    const repeat =
      lastTap &&
      now - lastTap.t < 350 &&
      Math.abs(e.clientX - lastTap.x) < 8 &&
      Math.abs(e.clientY - lastTap.y) < 8;
    lastTap = { t: now, x: e.clientX, y: e.clientY };
    return repeat;
  }

  on(
    stage,
    "pointerdown",
    (e) => {
      if (isFloating(e.target)) return;
      if (isRepeatTap(e)) return;

      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        beginPinch();
        e.preventDefault();
        return;
      }
      if (pointers.size > 2) return;

      // 1) space / middle button → hand pan (anywhere, including over elements)
      if (spacePan || e.button === 1) {
        startPan(e);
        return;
      }
      // 2) selection-box handle → element resize / rotate (executed by canvas.js)
      const mode = handleMode(e.target);
      if (mode) {
        const id = getSelected();
        if (id) {
          e.preventDefault();
          element.startGesture(e, mode, id);
        }
        return;
      }
      // 3) element body → select (Shift adds / Ctrl toggles) + move gesture
      //    Ctrl/Alt + drag = duplicate drag (threshold in canvas.js: without a drag,
      //    Ctrl-click toggles selection)
      const node = e.target.closest("[data-element-id]");
      if (node) {
        const id = node.dataset.elementId;
        const additive = e.shiftKey;
        const toggle = e.ctrlKey || e.metaKey;
        const copyMod = e.altKey || e.ctrlKey || e.metaKey;
        let toggleOnTap = false;
        if (additive) {
          if (!isSelected?.(id)) select(id, "add");
        } else if (toggle) {
          if (isSelected?.(id)) toggleOnTap = true; // already selected: drag-copy / toggle-off without a drag
          else select(id, "add");
        } else if (!isSelected?.(id)) {
          select(id, "replace");
        }
        e.preventDefault();
        element.startGesture(e, "move", id, { copyOnMove: copyMod, toggleOnTap });
        return;
      }
      // 4) blank area (inside or outside canvas) → marquee selection (space/middle pan, see above)
      e.preventDefault();
      element.startMarquee?.(e);
    },
    true // capture: before inner element events such as ECharts/zrender
  );

  on(window, "pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size >= 2) {
      // Pinch: anchor = midpoint of the two pointers (content under the midpoint
      // stays put across the zoom)
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (dist > 0) {
        setZoom?.(pinch.zoom * (dist / pinch.dist), { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      }
      return;
    }
    if (!tapPan) return;
    // Only count as a pan past the movement threshold; otherwise keep "click"
    // semantics (release deselects)
    if (!tapPan.moved && Math.hypot(e.clientX - tapPan.sx, e.clientY - tapPan.sy) > 4) tapPan.moved = true;
    if (!tapPan.moved) return;
    panBy?.(e.clientX - tapPan.x, e.clientY - tapPan.y);
    tapPan.x = e.clientX;
    tapPan.y = e.clientY;
  });

  function endPointer(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size > 0) return;
    // Click (no drag) on blank → deselect; pointercancel/system interruption is not a click
    if (tapPan && !tapPan.moved && e.type === "pointerup" && tapPan.tapDeselect) deselect?.();
    tapPan = null;
    stage.classList.remove("panning");
  }
  on(window, "pointerup", endPointer);
  on(window, "pointercancel", endPointer);
  on(window, "blur", () => {
    pointers.clear();
    pinch = null;
    tapPan = null;
    spacePan = false;
    stage.classList.remove("panning", "space-pan");
  });

  // --------------------------------------------------------------------------
  // Wheel: Ctrl/⌘ = anchored zoom (blocking browser page zoom), otherwise pan
  // --------------------------------------------------------------------------
  on(
    stage,
    "wheel",
    (e) => {
      if (isFloating(e.target)) return; // overlays (add-menu list etc.) keep native scrolling
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
        setZoom?.((getZoom?.() ?? 1) * factor, { x: e.clientX, y: e.clientY });
      } else {
        panBy?.(e.deltaX, e.deltaY);
      }
    },
    { passive: false }
  );

  // --------------------------------------------------------------------------
  // Double-click: element → open its editor; blank → reset the fitted view (zoom and pan)
  // --------------------------------------------------------------------------
  on(
    stage,
    "dblclick",
    (e) => {
      if (isFloating(e.target)) return;
      const node = e.target.closest("[data-element-id]");
      if (node) onActivate?.(node.dataset.elementId);
      else zoomReset?.();
    },
    true
  );

  return {
    /** Release all listeners and gesture state (idempotent). */
    destroy() {
      ac.abort();
      pointers.clear();
      pinch = null;
      tapPan = null;
      spacePan = false;
      stage.classList.remove("panning", "space-pan");
    },
  };
}
