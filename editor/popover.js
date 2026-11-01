// editor/popover.js — generic anchored popover (positioning + outside-click close + Esc)
// Shared shell for the file menu and the color/font popovers. This module owns only
// positioning and global close listeners; open/close state stays with the caller
// (isOpen/close callbacks), and the anchor click toggle stays with the caller.
// Positioning is fixed, `gap` below the anchor, optional upward flip and an 8px
// viewport clamp; hidden-state width/height are fallbacks for measurement.

/**
 * Bind an anchored popover.
 * @param anchor trigger element (exempt from the outside-click test; click toggle is bound by the caller)
 * @param panel  popover element (CSS fixed positioning; this module only writes style.top/left/right)
 * @param opts.align   "left" aligns the left edge to the anchor (default); "right" aligns the
 *                     right edge (pulled in at most 24px from the viewport edge, like the color/font popovers)
 * @param opts.gap     vertical gap from the anchor (default 8)
 * @param opts.width   hidden-state width fallback (for the left-aligned clamp)
 * @param opts.height  hidden-state height fallback (for the flip decision)
 * @param opts.flip    pop upward when there is not enough room below and enough above
 * @param opts.isOpen  () => boolean
 * @param opts.close   () => void
 * @returns {{ position: () => void, destroy: () => void }}
 */
export function attachPopover(anchor, panel, { align = "left", gap = 8, width = 0, height = 0, flip = false, isOpen, close } = {}) {
  const ac = new AbortController();
  function position() {
    const r = anchor.getBoundingClientRect();
    let top = r.bottom + gap;
    if (flip) {
      const h = panel.offsetHeight || height;
      // Not enough room below → pop upward (keeping an 8px viewport margin)
      if (window.innerHeight - r.bottom - 8 < h && r.top > h + 8) {
        top = Math.max(8, r.top - h - gap);
      }
    }
    panel.style.top = `${top}px`;
    if (align === "right") {
      panel.style.right = `${Math.max(8, Math.min(window.innerWidth - r.right, 24))}px`;
    } else {
      const w = panel.offsetWidth || width;
      panel.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - w - 8))}px`;
      panel.style.right = "auto";
    }
  }

  // Pointerdown outside the popover/anchor → close (pointerdown precedes click, so the layer closes before the target action fires)
  document.addEventListener("pointerdown", (e) => {
    if (!isOpen()) return;
    if (panel.contains(e.target) || anchor.contains(e.target)) return;
    close();
  }, { signal: ac.signal });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen()) close();
  }, { signal: ac.signal });
  window.addEventListener("resize", () => {
    if (isOpen()) position();
  }, { signal: ac.signal });

  return {
    position,
    /** Unbind the global close/reposition listeners (the popover DOM is removed by the caller). */
    destroy: () => ac.abort(),
  };
}
