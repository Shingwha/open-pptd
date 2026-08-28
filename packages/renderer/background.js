// ============================================================================
// renderer/background.js — 页面背景 → DOM（solid / gradient / image）
// ============================================================================

import { resolveColor } from "../model/theme.js";
import { normalizeFill } from "../model/style-spec.js";
import { gradientCss } from "./gradient.js";

/** 页面背景 → DOM（solid / gradient / image）。 */
export function pageBackground(theme, background) {
  const node = document.createElement("div");
  node.style.cssText = "position:absolute;left:0;top:0;right:0;bottom:0;";
  if (!background) {
    node.style.background = "#ffffff";
    return node;
  }
  // FillSpec 归一化（normalizeFill 容忍字符串 / 旧 {color} 形态，与 writer buildFill 兼容一致）
  const fill = normalizeFill(background);
  if (fill?.type === "solid") {
    node.style.background = resolveColor(theme, fill.color) || "#ffffff";
  } else if (fill?.type === "gradient") {
    // linear / radial（gradient.js 统一角度换算）；无效渐变回退白底
    node.style.background = gradientCss(theme, fill) || "#ffffff";
  } else if (fill?.type === "image") {
    node.style.backgroundImage = `url(${fill.src})`;
    node.style.backgroundSize = fill.fit?.mode || "cover";
    if (fill.opacity != null) node.style.opacity = fill.opacity;
  }
  return node;
}
