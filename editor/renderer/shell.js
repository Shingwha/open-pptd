// ============================================================================
// renderer/shell.js — 元素外壳（所有渲染器共用的定位 / 标记 / 变换）
// ----------------------------------------------------------------------------
// 每种元素的渲染器只负责「内容」，定位外壳统一由此创建：
//   - bounds → position:absolute 定位（svg 走 width/height 属性 + overflow
//     visible；div 走 cssText，height:false 时高度由内容决定，如表格）
//   - data-element-id / data-element-type 标记（选中 / 拖动 / 快速条定位
//     都靠它命中；interaction/canvas.js 拖动期间直接改 left/top/width/height，
//     此外壳即两侧的共同契约）
//   - rotation / flip 变换（OOXML 语义：先翻转后旋转 → transform 列表
//     从右向左应用，scale 写在 rotate 之后）与 opacity
// ============================================================================

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * @param {object} el 元素模型（bounds / elementId / elementType / rotation / flip / opacity）
 * @param {object} [opts]
 *  - tag: "div"（默认）| "svg"
 *  - height: false 时不设高度（内容自适应，表格）
 *  - css: 附加 cssText 片段（图表的 background 等）
 */
export function createElementShell(el, { tag = "div", height = true, css = "" } = {}) {
  const [x, y, w, h] = el.bounds;
  const isSvg = tag === "svg";
  const node = isSvg ? document.createElementNS(SVG_NS, "svg") : document.createElement("div");
  node.style.cssText =
    `position:absolute;left:${x}px;top:${y}px;` +
    (isSvg
      ? `overflow:visible;`
      : `width:${w}px;${height ? `height:${h}px;` : ""}overflow:hidden;`) +
    css;
  if (isSvg) {
    node.setAttribute("width", w);
    node.setAttribute("height", h);
  }
  node.dataset.elementId = el.elementId;
  node.dataset.elementType = el.elementType;
  if (el.rotation || el.flip?.[0] || el.flip?.[1]) {
    const t = [];
    if (el.rotation) t.push(`rotate(${el.rotation}deg)`);
    if (el.flip?.[0] || el.flip?.[1]) t.push(`scale(${el.flip[0] ? -1 : 1}, ${el.flip[1] ? -1 : 1})`);
    node.style.transform = t.join(" ");
  }
  if (el.opacity != null) node.style.opacity = el.opacity;
  return node;
}
