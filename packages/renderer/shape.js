// ============================================================================
// renderer/shape.js — shape → SVG (preset geometry with multiple paths + custom path)
// ----------------------------------------------------------------------------
// Preset geometry: all paths are evaluated from ECMA-376 formulas (main fill + light/dark
// faces + stroke details), the same source as the prstGeom export. Custom paths
// (shapeName:"custom"): viewBox + SVG path rendered directly, the same source as the
// a:custGeom export.
// ============================================================================

import { resolveColor, colorOr } from "../model/theme.js";
import { normalizeFill, dashSpec } from "../model/style-spec.js";
import { shapePaths } from "../model/preset-geometry.js";
import { svgGradient } from "./gradient.js";
import { createElementShell, boxShadowCss } from "./shell.js";

const SVG_NS = "http://www.w3.org/2000/svg";

function solidFill(theme, fill) {
  // normalizeFill tolerates strings and legacy {color} shapes (treated as solid); gradient/image → null
  const f = normalizeFill(fill);
  if (f?.type !== "solid") return null;
  return resolveColor(theme, f.color);
}

/** Light/dark face shading (preview approximates PowerPoint's fill modifiers): blend toward white/black. */
function shadeColor(hex, modifier) {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex || "");
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const mix = (c, target, t) => Math.round(c + (target - c) * t);
  const t = modifier === "lighten" ? 0.45 : modifier === "darken" ? 0.45 : modifier === "lightenLess" ? 0.22 : 0.22;
  const target = modifier.startsWith("lighten") ? 255 : 0;
  return "#" + [mix(r, target, t), mix(g, target, t), mix(b, target, t)].map((v) => v.toString(16).padStart(2, "0")).join("");
}

/** Shape element → positioned SVG (viewBox + preserveAspectRatio=none, stretching proportionally when scaled). */
export function renderShape(theme, el) {
  const [, , w, h] = el.bounds;
  const svg = createElementShell(el, { tag: "svg" });
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.setAttribute("preserveAspectRatio", "none");

  // Base fill color: a spec fill is not applied by default (transparent, matching the
  // writer's no-fill export); no fill → transparent. A gradient becomes an SVG <defs>
  // gradient (gradient.js) that every fill path references via url(#id), matching the
  // writer's single a:gradFill export (PowerPoint applies one gradient to the whole preset
  // geometry, with no light/dark face shading). Gradient coordinate space: preset-geometry
  // paths are in bounds coordinates; custom paths carry a viewBox scale transform (viewBox coords).
  const solid = solidFill(theme, el.fill);
  const [gw, gh] = el.shapeName === "custom" ? el.viewBox || [w, h] : [w, h];
  const grad = svgGradient(theme, el.fill, gw, gh);
  const base = solid || (grad ? `url(#${grad.id})` : null);
  if (grad) {
    const defs = document.createElementNS(SVG_NS, "defs");
    defs.innerHTML = grad.def;
    svg.appendChild(defs);
  }

  // Custom path: draw the SVG path directly (stretched by viewBox)
  if (el.shapeName === "custom") {
    if (!el.path) {
      console.warn(`[renderer] custom 形状缺少 path（${el.elementId}）`);
      return svg;
    }
    const geom = document.createElementNS(SVG_NS, "path");
    geom.setAttribute("d", el.path);
    const [vw = w, vh = h] = el.viewBox || [w, h];
    if (w / vw !== 1 || h / vh !== 1) {
      geom.setAttribute("transform", `scale(${w / vw} ${h / vh})`);
      geom.setAttribute("vector-effect", "non-scaling-stroke");
    }
    geom.setAttribute("fill", base || "none");
    if (el.border) {
      geom.setAttribute("stroke", colorOr(theme, el.border.color, "#000000"));
      geom.setAttribute("stroke-width", el.border.width || 1);
      const ds = dashSpec(el.border.style);
      if (ds) geom.setAttribute("stroke-dasharray", ds.css);
    }
    svg.appendChild(geom);
    applyShadow(svg, theme, el.shadow);
    return svg;
  }

  const strokeColor = el.border ? colorOr(theme, el.border.color, "#000000") : null;
  const strokeWidth = el.border?.width || 1;
  const strokeDash = dashSpec(el.border?.style)?.css || null;
  // Only stroke guide lines / inner lines: with no border nothing is stroked (matching the
  // writer's a:ln noFill for no border; no longer darkening the fill color to approximate
  // PowerPoint's lnRef fallback line)
  const strokeFor = (p) => ((p.stroke || p.fill === "none") ? strokeColor : null);

  const paths = shapePaths(el.shapeName, w, h, el.adjustments);
  if (!paths) {
    console.warn(`[renderer] 不支持形状 ${el.shapeName}`);
    return svg;
  }

  for (const p of paths) {
    const geom = document.createElementNS(SVG_NS, "path");
    geom.setAttribute("d", p.d);
    if (p.fill === "none") {
      geom.setAttribute("fill", "none");
    } else if (p.fill && p.fill !== "null") {
      // Light/dark face: blend the fill toward black/white (preview approximates PowerPoint
      // shading); nothing is drawn without a fill; gradients are not shaded (matching the
      // writer's single gradFill)
      if (!base) {
        geom.setAttribute("fill", "none");
      } else {
        geom.setAttribute("fill", grad ? base : shadeColor(base, p.fill));
      }
    } else {
      geom.setAttribute("fill", base || "none");
    }
    const sc = strokeFor(p);
    if (sc) {
      geom.setAttribute("stroke", sc);
      geom.setAttribute("stroke-width", p.fill === "none" ? Math.max(1.2, strokeWidth) : strokeWidth);
      if (strokeDash) geom.setAttribute("stroke-dasharray", strokeDash);
    }
    svg.appendChild(geom);
  }

  applyShadow(svg, theme, el.shadow);
  return svg;
}

/** Shape shadow → SVG drop-shadow (boxShadowCss single source, matching the exported outerShdw defaults). */
function applyShadow(svg, theme, shadow) {
  const sh = boxShadowCss(theme, shadow);
  if (sh) svg.style.filter = `drop-shadow(${sh})`;
}
