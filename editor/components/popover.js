// ============================================================================
// components/popover.js — Popover 原语（4 锚点方向）
// ----------------------------------------------------------------------------
// 复用 editor/popover.js 的 attachPopover（fixed 定位、外点关闭、Esc、resize 重定位）。
// 本模块补一层「开合状态自管」的门面：浮层默认 hidden，open/toggle/close 全包，
// 4 个锚点方向由 attachPopover 的 align(left/right) + flip(下/上) 组合覆盖。
// ============================================================================

import { attachPopover } from "../popover.js";

export { attachPopover };

/**
 * 便捷封装：把 content 挂到 anchor 旁，返回 { open, close, toggle, position, destroy }。
 * @param {HTMLElement} anchor 锚点
 * @param {HTMLElement} content 浮层内容（默认隐藏态用 hidden 属性）
 * @param {object} [opts] 透传 attachPopover 的 align/gap/width/height/flip
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
