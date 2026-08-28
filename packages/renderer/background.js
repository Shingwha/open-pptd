// ============================================================================
// renderer/background.js — 页面背景 → DOM（solid / gradient / image）
// ============================================================================

import { resolveColor } from "../model/theme.js";
import { gradientCss } from "./gradient.js";

/** 页面背景 → DOM（solid / gradient / image）。 */
export function pageBackground(theme, background) {
  const node = document.createElement("div");
  node.style.cssText = "position:absolute;left:0;top:0;right:0;bottom:0;";
  if (!background) {
    node.style.background = "#ffffff";
    return node;
  }
  // 省略 type 的 {color} 对象按纯色处理（与 writer buildFill 旧形态兼容一致）
  if (background.type === "solid" || typeof background === "string" || (!background.type && background.color)) {
    node.style.background = resolveColor(theme, typeof background === "string" ? background : background.color) || "#ffffff";
  } else if (background.type === "gradient") {
    // linear / radial（gradient.js 统一角度换算）；无效渐变回退白底
    node.style.background = gradientCss(theme, background) || "#ffffff";
  } else if (background.type === "image") {
    node.style.backgroundImage = `url(${background.src})`;
    node.style.backgroundSize = background.fit?.mode || "cover";
    if (background.opacity != null) node.style.opacity = background.opacity;
  }
  return node;
}
