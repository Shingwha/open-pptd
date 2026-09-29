// ============================================================================
// renderer/shell.js — element shell (positioning / markers / transforms shared by all renderers)
// ----------------------------------------------------------------------------
// Each element renderer only owns "content"; the positioning shell is created here:
//   - bounds → position:absolute (svg via width/height attributes + overflow:visible;
//     div via cssText, where height:false lets content decide the height, e.g. tables)
//   - data-element-id / data-element-type markers (selection / dragging / quick-bar
//     lookup all hit these; interaction/canvas.js mutates left/top/width/height
//     directly while dragging, so this shell is the shared contract between both sides)
//   - rotation / flip transforms (OOXML semantics: flip before rotate → the transform
//     list applies right-to-left, so scale is written after rotate) and opacity
// ============================================================================

import { resolveColor } from "../model/theme.js";
import { effectiveShadow } from "../model/style-spec.js";

const SVG_NS = "http://www.w3.org/2000/svg";

/** ShadowSpec → CSS shadow value; null when there is no shadow (shared by images /
 * chart frames / tables; defaults come from the effectiveShadow single source, matching
 * the exported outerShdw). The caller decides text-shadow vs box-shadow. */
export function boxShadowCss(theme, shadow) {
  const eff = effectiveShadow(shadow);
  if (!eff) return null;
  const color = resolveColor(theme, eff.color) || eff.color;
  return `${eff.dx}px ${eff.dy}px ${eff.blur}px ${color}`;
}

/**
 * @param {object} el element model (bounds / elementId / elementType / rotation / flip / opacity)
 * @param {object} [opts]
 *  - tag: "div" (default) | "svg"
 *  - height: when false, no height is set (content decides it, e.g. tables)
 *  - css: extra cssText fragment (e.g. a chart's background)
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
