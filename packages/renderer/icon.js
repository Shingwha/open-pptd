// ============================================================================
// renderer/icon.js — icon → SVG (same source as the SVG files exported to PPTX)
// ----------------------------------------------------------------------------
// def comes from ctx.iconMap[el.iconName] ({inner,w,h}, preloaded by the app layer —
// editor icons.js / gallery preload, same pattern as imageMap); unloaded/unknown →
// dashed placeholder box. The export writes the same inner + fill into ppt/media/*.svg,
// so PowerPoint renders exactly what the preview shows.
// ============================================================================

import { iconSvgBody, normalizeIconFill } from "../model/icon-svg.js";
import { createElementShell } from "./shell.js";

const SVG_NS = "http://www.w3.org/2000/svg";

/** Icon element → SVG (uniformly scaled and centered, never stretched). Unloaded/unknown icon → placeholder box. */
export function renderIcon(theme, el, ctx = {}) {
  const def = (ctx.iconMap || {})[el.iconName];
  const svg = createElementShell(el, { tag: "svg" });
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  if (!def) {
    svg.setAttribute("viewBox", "0 0 16 16");
    const r = document.createElementNS(SVG_NS, "rect");
    r.setAttribute("x", "1");
    r.setAttribute("y", "1");
    r.setAttribute("width", "14");
    r.setAttribute("height", "14");
    r.setAttribute("fill", "none");
    r.setAttribute("stroke", "#c4cbd4");
    r.setAttribute("stroke-dasharray", "2 2");
    svg.appendChild(r);
    const t = document.createElementNS(SVG_NS, "text");
    t.setAttribute("x", "8");
    t.setAttribute("y", "9");
    t.setAttribute("text-anchor", "middle");
    t.setAttribute("font-size", "6");
    t.setAttribute("fill", "#8a94a3");
    t.textContent = "?";
    svg.appendChild(t);
    return svg;
  }

  svg.setAttribute("viewBox", `${def.vx || 0} ${def.vy || 0} ${def.w} ${def.h}`);
  // Same SVG body as the export (identical inner/fill resolution)
  const fill = normalizeIconFill(theme, el.fill);
  const gid = `ig-${el.elementId}-${Math.random().toString(36).slice(2, 7)}`;
  svg.innerHTML = iconSvgBody(def, fill, gid);
  return svg;
}

/** Icon thumbnail (menus/pickers): uniform scale, fill currentColor. def = {inner,w,h,vx?,vy?}. */
export function iconThumb(def, { size = 16, color = "currentColor" } = {}) {
  if (!def) return "";
  return `<svg viewBox="${def.vx || 0} ${def.vy || 0} ${def.w} ${def.h}" width="${size}" height="${size}" fill="${color}">${def.inner}</svg>`;
}
