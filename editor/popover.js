// ============================================================================
// popover.js — 锚定浮层通用件（定位 + 外点关闭 + Esc + resize 重定位）
// ----------------------------------------------------------------------------
// 文件菜单 / 配色浮层 / 字体浮层 / 主题色弹层（ui.js colorField）的公共外壳。
// 本模块只管「定位与全局关闭监听」，开合状态仍由调用方自管
// （.open class 或 hidden 属性，经 isOpen/close 回调接入），锚点 click
// 开合逻辑也留在调用方（各自有 toggle/重建差异）。
// 定位：fixed，锚点下方 gap 处；flip 时下方放不下且上方够则向上弹出；
// 水平方向 clamp 进视口（8px 边距）。调用方在浮层可见后调 position()
// （offsetWidth/Height 需可见才能量到，隐藏态用 width/height 兜底）。
// ============================================================================

/**
 * 绑定一个锚定浮层。
 * @param anchor 触发元素（外点判定豁免；点击开合由调用方自行绑定）
 * @param panel  浮层元素（CSS fixed 定位；本模块只写 style.top/left/right）
 * @param opts.align   "left" 左缘对齐锚点（默认）；"right" 右缘对齐锚点
 *                     （右缘最多收进视口 24px 内，与配色/字体浮层一致）
 * @param opts.gap     与锚点的垂直间距（默认 8）
 * @param opts.width   隐藏态宽度兜底（左对齐 clamp 用）
 * @param opts.height  隐藏态高度兜底（flip 判定用）
 * @param opts.flip    下方空间不足且上方足够时向上弹出
 * @param opts.isOpen  () => boolean
 * @param opts.close   () => void
 * @returns {{ position: () => void }}
 */
export function attachPopover(anchor, panel, { align = "left", gap = 8, width = 0, height = 0, flip = false, isOpen, close } = {}) {
  function position() {
    const r = anchor.getBoundingClientRect();
    let top = r.bottom + gap;
    if (flip) {
      const h = panel.offsetHeight || height;
      // 下方空间不足 → 向上弹出（保持 8px 视口边距）
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

  // 指针按下到浮层/锚点之外 → 关闭（pointerdown 早于 click，先收层再触发目标动作）
  document.addEventListener("pointerdown", (e) => {
    if (!isOpen()) return;
    if (panel.contains(e.target) || anchor.contains(e.target)) return;
    close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen()) close();
  });
  window.addEventListener("resize", () => {
    if (isOpen()) position();
  });

  return { position };
}
