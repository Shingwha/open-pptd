// ============================================================================
// renderer/image.js — image element → DOM (full crop → fit → cropShape pipeline + border/shadow)
// ----------------------------------------------------------------------------
// Official render order: crop (object-view-box: crop the source, then object-fit) → fit
// (object-fit: cover/contain/fill) → cropShape (clip-path by shape outline).
// object-view-box requires Chrome 104+; when unsupported it degrades to an approximate
// clip-path (crop-only scenarios).
// ============================================================================

import { resolveColor } from "../model/theme.js";
import { shapePaths } from "../model/preset-geometry.js";
import { createElementShell, boxShadowCss } from "./shell.js";

/** Image element → positioned DOM. */
export function renderImage(theme, el, ctx = {}) {
  const [, , w, h] = el.bounds;
  const box = createElementShell(el);

  const img = document.createElement("img");
  // Local-folder mode: a relative src is resolved to a dataURL via imageMap (passed in by the caller; no global read)
  const map = ctx.imageMap || {};
  img.src = map[el.src] || el.src;
  img.style.cssText = `width:100%;height:100%;display:block;object-fit:${el.fit?.mode || "cover"};`;
  // crop: crop the source first, then fit (official order). object-view-box percentages are relative to the source image
  const crop = el.crop;
  if (crop && (crop.left || crop.top || crop.right || crop.bottom)) {
    const inset = `inset(${(crop.top || 0) * 100}% ${(crop.right || 0) * 100}% ${(crop.bottom || 0) * 100}% ${(crop.left || 0) * 100}%)`;
    img.style.objectViewBox = inset;
    // Fallback: approximate with clip-path when object-view-box is unsupported (visual only; export unaffected)
    if (!("objectViewBox" in img.style)) img.style.clipPath = inset;
  }
  img.onerror = () => {
    img.style.display = "none";
    box.textContent = "[图片加载失败]";
    box.style.display = "flex";
    box.style.alignItems = "center";
    box.style.justifyContent = "center";
    box.style.color = "#999";
    box.style.fontSize = "12px";
  };
  box.appendChild(img);

  // cropShape: clip by the shape outline (clip-path applies to the whole box, so border/shadow are clipped too)
  const shapeDef = el.cropShape;
  if (shapeDef?.shapeName && shapeDef.shapeName !== "rect") {
    const clip = cropShapeClip(shapeDef, w, h);
    if (clip) box.style.clipPath = clip;
  }

  if (el.border) {
    box.style.border = `${el.border.width || 1}px ${el.border.style || "solid"} ${resolveColor(theme, el.border.color) || "#000"}`;
  }
  const boxShadow = boxShadowCss(theme, el.shadow);
  if (boxShadow) box.style.boxShadow = boxShadow;
  return box;
}

/** ShapeDef → CSS clip-path (preset geometry evaluated at bounds; custom uses the SVG path directly). */
function cropShapeClip(shapeDef, w, h) {
  if (shapeDef.shapeName === "custom") {
    if (!shapeDef.path) return null;
    const [vw = w, vh = h] = shapeDef.viewBox || [w, h];
    // path() coordinates are in the element's local CSS-pixel system, so the viewBox path must be scaled to w×h
    if (vw === w && vh === h) return `path('${shapeDef.path}')`;
    return `path('${scalePath(shapeDef.path, w / vw, h / vh)}')`;
  }
  const paths = shapePaths(shapeDef.shapeName, w, h, shapeDef.adjustments);
  if (!paths) return null;
  // Preset geometry is already in 0..w × 0..h and can be used directly (fill-rule stays nonzero, preserving hole semantics)
  const d = paths.map((p) => p.d).join(" ");
  return `path('${d}')`;
}

/** Scale an SVG path: scale coordinate tokens by command arity (for A only the endpoint xy is scaled). */
function scalePath(d, sx, sy) {
  const ARITY = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?\d*\.?\d+(?:[eE][+-]?\d+)?/g) || [];
  let out = "";
  let cur = [0, 0];
  let i = 0;
  let lastOp = "";
  while (i < tokens.length) {
    let op = "";
    if (/[A-Za-z]/.test(tokens[i])) {
      op = tokens[i];
      lastOp = op.toUpperCase();
      out += op;
      i++;
    } else {
      op = lastOp || "L";
    }
    const arity = ARITY[op.toUpperCase()] || 0;
    if (!arity) {
      out += tokens[i];
      i++;
      continue;
    }
    const seg = tokens.slice(i, i + arity).map(Number);
    if (seg.length < arity) break;
    const U = op.toUpperCase();
    const rel = op !== U;
    const coords = seg.map((v, k) => {
      let outV;
      if (U === "H") outV = v * sx;
      else if (U === "V") outV = v * sy;
      else if (U === "A") outV = k >= 5 ? (rel ? (k === 5 ? cur[0] + v * sx : cur[1] + v * sy) : k === 5 ? v * sx : v * sy) : v;
      else outV = k % 2 === 0 ? v * sx : v * sy;
      return Math.round(outV * 1000) / 1000;
    });
    out += " " + coords.join(" ");
    if (U === "H") cur = [coords[0], cur[1]];
    else if (U === "V") cur = [cur[0], coords[0]];
    else if (U === "C") cur = [coords[4], coords[5]];
    else if (U === "S" || U === "Q") cur = [coords[2], coords[3]];
    else if (U === "A") cur = [coords[5], coords[6]];
    else if (U === "M" || U === "L" || U === "T") cur = [coords[0], coords[1]];
    i += arity;
  }
  return out;
}
