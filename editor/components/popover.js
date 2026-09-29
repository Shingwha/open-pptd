// ============================================================================
// components/popover.js — Popover primitive (4 anchor directions)
// ----------------------------------------------------------------------------
// Reuses editor/popover.js attachPopover (fixed positioning, outside-click close,
// Esc, resize reposition). This module adds a façade that owns the open/close
// state: the popover is hidden by default and open/toggle/close are all wrapped;
// the 4 anchor directions are covered by combining attachPopover's align
// (left/right) and flip (down/up).
// ============================================================================

import { attachPopover } from "../popover.js";

export { attachPopover };

/**
 * Convenience wrapper: mount content next to anchor, returning { open, close, toggle, position, destroy }.
 * @param {HTMLElement} anchor anchor
 * @param {HTMLElement} content popover content (hidden state uses the hidden attribute by default)
 * @param {object} [opts] passthrough align/gap/width/height/flip for attachPopover
 */
export function popover(anchor, content, opts = {}) {
  const close = () => {
    content.hidden = true;
  };
  const pop = attachPopover(anchor, content, {
    gap: 6,
    flip: true,
    ...opts,
    isOpen: () => !content.hidden,
    close,
  });
  return {
    open() {
      content.hidden = false;
      pop.position();
    },
    close,
    toggle() {
      content.hidden = !content.hidden;
      if (!content.hidden) pop.position();
    },
    position: () => pop.position(),
    destroy: () => pop.destroy?.(),
  };
}
