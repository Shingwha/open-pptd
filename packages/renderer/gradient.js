// ============================================================================
// renderer/gradient.js — GradientFill → CSS / SVG gradient (unified renderer entry)
// ----------------------------------------------------------------------------
// Angle spec (references/pptd.md): angle 0 = left→right, increasing clockwise (90 = top→bottom).
// CSS linear-gradient 0deg points up and increases clockwise → CSS angle = PPTD angle + 90.
// Shapes (SVG paths) cannot use CSS gradients, so svgGradient builds a <defs> gradient
// referenced via url(#id); backgrounds / text (background-clip:text) / chart frames use gradientCss.
// ============================================================================

import { resolveColor } from "../model/theme.js";
import { svgGradientDef } from "../model/svg-gradient.js";

function valid(fill) {
  return fill?.type === "gradient" && Array.isArray(fill.stops) && fill.stops.length >= 2;
}

/** PPTD gradient angle → CSS linear-gradient angle (degrees). */
function gradientCssAngle(angle) {
  return ((Number(angle) || 0) + 90) % 360;
}

/** GradientFill → CSS background declaration (linear / radial); null for an invalid gradient. */
export function gradientCss(theme, fill) {
  if (!valid(fill)) return null;
  const stops = fill.stops
    .map((s) => `${resolveColor(theme, s.color) || s.color} ${Math.round((s.position ?? 0) * 100)}%`)
    .join(", ");
  if (fill.gradientType === "radial") return `radial-gradient(circle, ${stops})`;
  return `linear-gradient(${gradientCssAngle(fill.angle)}deg, ${stops})`;
}

let uid = 0;

/**
 * GradientFill → SVG gradient definition (for shape paths). Returns { id, def }: the caller
 * places def in <defs> and paths reference it with fill="url(#id)"; null for an invalid
 * gradient. Generation lives in model/svg-gradient.js (same source as icons): linear uses a
 * userSpaceOnUse full-rectangle projection, radial uses an objectBoundingBox circle.
 */
export function svgGradient(theme, fill, w, h) {
  const id = `pptd-grad-${++uid}`;
  return svgGradientDef({ theme, fill, id, w, h });
}
