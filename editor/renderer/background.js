// ============================================================================
// renderer/background.js — 页面背景 → DOM（solid / gradient / image）
// ============================================================================

import { resolveColor } from "../core/theme.js";

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
    const stops = (background.stops || [])
      .map((s) => `${resolveColor(theme, s.color)} ${Math.round((s.position ?? 0) * 100)}%`)
      .join(", ");
    node.style.background = `linear-gradient(${background.angle ?? 0}deg, ${stops})`;
  } else if (background.type === "image") {
    node.style.backgroundImage = `url(${background.src})`;
    node.style.backgroundSize = background.fit?.mode || "cover";
    if (background.opacity != null) node.style.opacity = background.opacity;
  }
  return node;
}
