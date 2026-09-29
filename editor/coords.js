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

// ----------------------------------------------------------------------------
// LayoutTree 当前页（RP-C / M6）：排版事实的唯一几何来源。
// 由 view.js 在每次画布绘制时写入（paint 与选中框读同一棵树 → 不会各算一套）；
// 选中框/对齐参考线据此取 frame，不再读 DOM 实测（offsetHeight）或 el.bounds
// 现算。group 组壳不在 LayoutTree 内（layout 跳过组壳），取不到时调用方回退。
// ----------------------------------------------------------------------------
let _layoutPage = null;

/** 写入当前页 LayoutTree.pages[i]（每次画布重绘后调用）。 */
export function setLayoutPage(page) {
  _layoutPage = page || null;
}

/** 按 elementId 取 LayoutElement（无当前树或未命中 → null）。 */
export function layoutElementOf(elementId) {
  if (!_layoutPage || !elementId) return null;
  return _layoutPage.elements?.find((le) => le.elementId === elementId) || null;
}
