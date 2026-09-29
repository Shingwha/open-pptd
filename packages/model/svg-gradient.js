// ============================================================================
// svg-gradient.js — GradientFill -> SVG <defs> gradient definition (same source for preview and export media)
// ----------------------------------------------------------------------------
// Angle spec (references/pptd.md): angle 0 = left->right, increasing clockwise
// (90 = top->bottom). linear uses userSpaceOnUse and projects the gradient vector
// over the full rectangle length (matching the CSS gradient-line formula, so angles
// do not distort on non-square boxes); radial is an objectBoundingBox circle
// (cx/cy 50%, r 50%). Shapes (renderer/svgGradient) and icons (model/iconSvgBody)
// share this generator — icon previously carried its own objectBoundingBox
// half-vector implementation, so gradients pointed differently from shapes on
// non-square boxes.
// ============================================================================

import { colorOr } from "./theme.js";

function valid(fill) {
  return fill?.type === "gradient" && Array.isArray(fill.stops) && fill.stops.length >= 2;
}

/** Color stop -> <stop> (splits #RRGGBBAA into stop-color + stop-opacity; resolves $token first when theme is given). */
function stopXml(theme, s) {
  let color = theme ? colorOr(theme, s.color, s.color) : s.color;
  let opacity = "";
  const m = /^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})$/.exec(color || "");
  if (m) {
    color = `#${m[1]}`;
    opacity = ` stop-opacity="${(parseInt(m[2], 16) / 255).toFixed(3)}"`;
  }
  return `<stop offset="${Math.round((s.position ?? 0) * 100)}%" stop-color="${color}"${opacity}/>`;
}

/**
 * GradientFill -> SVG gradient definition. Returns { id, def }; null for an invalid gradient.
 * @param {object} opts
 *   - theme: theme (resolves $token color stops; may be omitted when icon colors are already resolved)
 *   - fill:  GradientFill
 *   - id:    gradient id (caller guarantees uniqueness; referenced as fill="url(#id)")
 *   - w, h:  rectangle size in user coordinates (used to project the linear gradient vector)
 *   - x, y:  rectangle origin in user coordinates (default 0,0; an icon viewBox origin may be non-zero)
 */
export function svgGradientDef({ theme = null, fill, id, w, h, x = 0, y = 0 }) {
  if (!valid(fill)) return null;
  const stops = fill.stops.map((s) => stopXml(theme, s)).join("");
  if (fill.gradientType === "radial") {
    return { id, def: `<radialGradient id="${id}" cx="50%" cy="50%" r="50%">${stops}</radialGradient>` };
  }
  const rad = ((Number(fill.angle) || 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const half = (Math.abs(w * cos) + Math.abs(h * sin)) / 2;
  const f = (v) => Math.round(v * 100) / 100;
  const def =
    `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" ` +
    `x1="${f(cx - half * cos)}" y1="${f(cy - half * sin)}" x2="${f(cx + half * cos)}" y2="${f(cy + half * sin)}">` +
    `${stops}</linearGradient>`;
  return { id, def };
}
