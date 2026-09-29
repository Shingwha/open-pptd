// ============================================================================
// icon-svg.js — icon -> SVG string (same source for preview rendering and PPTX export)
// ----------------------------------------------------------------------------
// Icon data def = the product of normalizeIconSvg(): {inner, w, h} (Font Awesome
// paths with root svg/comments/currentColor already stripped). This module is the
// only place that generates icon SVG: the preview injects it via innerHTML, the
// export writes it to media/*.svg — preview == export.
//
// fill injection: injected per shape (FA inner has no fill attribute after
// normalize), which is more deterministic than inheriting from the root svg —
// PowerPoint's SVG engine gives no spec guarantee for paint-server inheritance.
// ============================================================================

import { colorOr } from "./theme.js";
import { svgGradientDef } from "./svg-gradient.js";

/** Resolve icon fill -> {type:'solid', color:hex} or {type:'gradient', gradientType, stops:[{color,position}], angle}. */
export function normalizeIconFill(theme, fill) {
  if (typeof fill === "string") return { type: "solid", color: colorOr(theme, fill, "#333333") };
  if (!fill) return { type: "solid", color: colorOr(theme, "$text", "#333333") };
  if (fill.type === "gradient" && Array.isArray(fill.stops) && fill.stops.length >= 2) {
    return {
      type: "gradient",
      gradientType: fill.gradientType === "radial" ? "radial" : "linear",
      angle: fill.angle ?? 0,
      stops: fill.stops.map((s) => ({
        color: colorOr(theme, s.color, "#333333"),
        position: s.position ?? 0,
      })),
    };
  }
  const color = fill.type === "solid" ? fill.color : fill.color ?? "$text";
  return { type: "solid", color: colorOr(theme, color, "#333333") };
}

/** Shape opening tags inside FA inner (no fill attribute after normalize, so injection is safe). */
const SHAPE_OPEN = /<(path|circle|ellipse|rect|polygon|polyline)(?=[\s/>])/g;

/**
 * Icon SVG inner content (<defs> + FA inner with injected fill). Shared by preview and export.
 * @param {object} def normalizeIconSvg product ({inner, w, h})
 * @param {object} fill output of normalizeIconFill
 * @param {string} [gid] gradient id (must be unique when several icons share a page; may be omitted for a single exported file)
 */
export function iconSvgBody(def, fill, gid = "ig") {
  if (fill?.type === "gradient") {
    // Same gradient generator as shapes (model/svg-gradient.js): full-length
    // rectangle projection, so the angle does not distort on non-square boxes —
    // previously icon carried its own half-vector implementation that disagreed
    // with shape gradient direction
    const g = svgGradientDef({ fill, id: gid, w: def.w, h: def.h, x: def.vx || 0, y: def.vy || 0 });
    const paint = `url(#${gid})`;
    return `<defs>${g.def}</defs>${def.inner.replace(SHAPE_OPEN, `<$1 fill="${paint}"`)}`;
  }
  const color = fill?.color || "#333333";
  return def.inner.replace(SHAPE_OPEN, `<$1 fill="${color}"`);
}

/** Full SVG file string (written to PPTX media/*.svg). viewBox includes the origin (some FA
 *  icons extend beyond the declared box; it has been expanded); explicit width/height let
 *  PowerPoint compute the intrinsic size correctly (when missing, PPT stretches the image
 *  non-proportionally to fill the picture frame). */
export function iconToSvg(def, fill, gid = "ig") {
  return `<svg viewBox="${def.vx || 0} ${def.vy || 0} ${def.w} ${def.h}" width="${def.w}" height="${def.h}" xmlns="http://www.w3.org/2000/svg">${iconSvgBody(def, fill, gid)}</svg>\n`;
}
