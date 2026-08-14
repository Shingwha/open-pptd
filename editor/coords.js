// ============================================================================
// coords.js — 模型 / 节点坐标换算（选中框、快速条定位等浮层共用）
// ----------------------------------------------------------------------------
// 画布（#canvas）以中心为 transform-origin 缩放，模型 (0,0) 的视觉位置
// ≠ canvas-wrap (0,0)；「模型坐标 → 屏幕/图层坐标」的换算历史上散落在
// 多处各写一套，这里是唯一实现。
// ============================================================================

/**
 * 模型 bounds → wrap 图层视觉几何。
 * 取 canvas 与 wrap 的 rect 差作为视觉原点（同时自动抵消 wrap 的平移
 * translate 与中心锚点缩放偏移）。
 * @returns {{s:number, left:number, top:number, width:number, height:number}}
 */
export function overlayGeom(canvas, wrap, bounds) {
  const s = canvas._scale || 1;
  const cr = canvas.getBoundingClientRect();
  const wr = wrap.getBoundingClientRect();
  const [x, y, w, h] = bounds;
  return {
    s,
    left: cr.left - wr.left + x * s,
    top: cr.top - wr.top + y * s,
    width: w * s,
    height: h * s,
  };
}

/** rect 相对 base 的偏移矩形（如元素节点 → 舞台坐标系）。 */
export function relRect(rect, base) {
  return {
    left: rect.left - base.left,
    top: rect.top - base.top,
    width: rect.width,
    height: rect.height,
  };
}
