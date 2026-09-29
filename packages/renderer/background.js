// ============================================================================
// renderer/background.js — page background → DOM (solid / gradient / image)
// ============================================================================

import { resolveColor } from "../model/theme.js";
import { normalizeFill } from "../model/style-spec.js";
import { gradientCss } from "./gradient.js";

/** Page background → DOM (solid / gradient / image). */
export function pageBackground(theme, background) {
  const node = document.createElement("div");
  node.style.cssText = "position:absolute;left:0;top:0;right:0;bottom:0;";
  if (!background) {
    node.style.background = "#ffffff";
    return node;
  }
  // FillSpec normalization (normalizeFill tolerates strings / legacy {color}, consistent with writer buildFill)
  const fill = normalizeFill(background);
  if (fill?.type === "solid") {
    node.style.background = resolveColor(theme, fill.color) || "#ffffff";
  } else if (fill?.type === "gradient") {
    // linear / radial (gradient.js handles the angle conversion); an invalid gradient falls back to white
    node.style.background = gradientCss(theme, fill) || "#ffffff";
  } else if (fill?.type === "image") {
    // contain letterboxes and centers on a white base (same semantics as the export's white p:bg + centered contain underlay image)
    node.style.backgroundColor = "#ffffff";
    node.style.backgroundImage = `url(${fill.src})`;
    node.style.backgroundSize = fill.fit?.mode || "cover";
    node.style.backgroundPosition = "center";
    if (fill.opacity != null) node.style.opacity = fill.opacity;
  }
  return node;
}
