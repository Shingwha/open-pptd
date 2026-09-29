// ============================================================================
// renderer/image.js — image element → DOM (full crop → fit → cropShape pipeline + border/shadow)
// ----------------------------------------------------------------------------
// Official render order: crop (object-view-box: crop the source, then object-fit) → fit
// (object-fit: cover/contain/fill) → cropShape (clip-path by shape outline).
// object-view-box requires Chrome 104+; when unsupported it degrades to an approximate
// clip-path (crop-only scenarios).
// ============================================================================

import { colorOr } from "../model/theme.js";
import { scaleSvgPath } from "../model/svg-path.js";
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
    box.style.border = `${el.border.width || 1}px ${el.border.style || "solid"} ${colorOr(theme, el.border.color, "#000")}`;
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
    return `path('${scaleSvgPath(shapeDef.path, w / vw, h / vh)}')`;
  }
  const paths = shapePaths(shapeDef.shapeName, w, h, shapeDef.adjustments);
  if (!paths) return null;
  // Preset geometry is already in 0..w × 0..h and can be used directly (fill-rule stays nonzero, preserving hole semantics)
  const d = paths.map((p) => p.d).join(" ");
  return `path('${d}')`;
}
