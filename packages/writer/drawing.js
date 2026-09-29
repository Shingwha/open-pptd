// ============================================================================
// drawing.js — shared OOXML drawing fragments (xfrm / fill / border / shadow)
// ----------------------------------------------------------------------------
// Shared by shapes, text borders, image borders and table fills; all driven by the
// packages/model fill model.
// ============================================================================

import { el, hexToRgbVal, angleToOOXML } from "./xml.js";
import { resolveColor } from "../model/theme.js";
import { dashSpec, normalizeFill, effectiveShadow } from "../model/style-spec.js";
import { PRESET_SHAPES } from "../model/preset-geometry.data.js";
import { SUPPORTED_SHAPES } from "../model/model.js";
import { custGeomXml } from "./custgeom.js";

/**
 * Preset geometry → a:prstGeom.
 * Matching PowerPoint storage: with no explicit adjustments, emit an empty avLst (using the
 * preset's built-in defaults); when explicitly set, write gd entries by adjNames (only when
 * element-level adjustments are non-empty).
 */
export function buildPresetGeom(shapeName, adjustments) {
  const def = SUPPORTED_SHAPES[shapeName];
  if (!def) return el("a:prstGeom", { prst: "rect" }, "<a:avLst/>");
  if (Array.isArray(adjustments) && adjustments.length) {
    const names =
      PRESET_SHAPES[shapeName]?.adjNames || adjustments.map((_, i) => (i === 0 ? "adj" : `adj${i}`));
    const gds = adjustments.map((v, i) => el("a:gd", { name: names[i] ?? `adj${i}`, fmla: `val ${v}` })).join("");
    return el("a:prstGeom", { prst: def.preset }, el("a:avLst", {}, gds));
  }
  return el("a:prstGeom", { prst: def.preset }, "<a:avLst/>");
}

/**
 * ShapeDef (shapeName/adjustments/viewBox/path, see the official Image.cropShape) → geometry element.
 * custom goes through a:custGeom; the default falls back to a rectangle.
 */
export function buildShapeDefGeom(shapeDef) {
  if (!shapeDef) return el("a:prstGeom", { prst: "rect" });
  if (shapeDef.shapeName === "custom") {
    if (!shapeDef.path || !Array.isArray(shapeDef.viewBox)) return el("a:prstGeom", { prst: "rect" });
    return custGeomXml(shapeDef.viewBox, shapeDef.path);
  }
  return buildPresetGeom(shapeDef.shapeName, shapeDef.adjustments);
}

/** Color → OOXML fill element. Theme tokens prefer schemeClr (theme-swappable), others srgbClr.
 * opacity (0~1, optional): text/element transparency — the a:alpha modifier goes inside the
 * color element (official PowerPoint storage). */
const TOKEN_SLOT = { text: "dk2", bg: "lt2", primary: "accent1", accent: "accent2" };

/** Merge the hex's own alpha with element opacity (0~1) → a:alpha val (1/1000 %). */
function alphaVal(hex, opacity) {
  let a = 1;
  if (hex && hex.length === 9) a = parseInt(hex.slice(7, 9), 16) / 255;
  if (opacity != null) a *= opacity;
  if (a >= 1) return "";
  return el("a:alpha", { val: Math.round(a * 100000) });
}

export function colorElement(theme, color, opacity) {
  if (color == null) return "";
  if (typeof color === "string" && color.startsWith("$")) {
    const key = color.slice(1);
    if (TOKEN_SLOT[key]) return el("a:schemeClr", { val: TOKEN_SLOT[key] }, alphaVal(null, opacity));
    // Other theme colors keys: PowerPoint renders schemeClr tint/shade in backgrounds unreliably,
    // so derived color keys (primarySoft etc.) export the resolved concrete value (= the preview shows)
    return solidRgb(resolveColor(theme, color), opacity);
  }
  if (typeof color === "string" && color.startsWith("#")) {
    return solidRgb(color, opacity);
  }
  return "";
}

/** Color → a full a:solidFill element (required wherever a fill sits: rPr / a:ln / a:outerShdw).
 * With no explicit color but opacity needed, use the default text slot tx1 + a:alpha (official structure). */
export function solidFillElement(theme, color, opacity) {
  let inner;
  if (color == null && opacity != null && opacity < 1) {
    inner = el("a:schemeClr", { val: "tx1" }, alphaVal(null, opacity));
  } else {
    inner = colorElement(theme, color, opacity);
  }
  return inner ? el("a:solidFill", {}, inner) : "";
}

function solidRgb(hex, opacity) {
  const rgb = hexToRgbVal(hex);
  return el("a:srgbClr", { val: rgb }, alphaVal(hex, opacity));
}

/**
 * Resolved concrete color (hex/HEX8, no $token) → a:solidFill (chart series colors only; the
 * caller must resolveColor first). Semantic differences from colorElement/alphaVal (keep apart):
 * an explicit alpha writes a:alpha unconditionally (including 100000), and a HEX8's own alpha
 * OVERRIDES the alpha argument.
 */
export function solidFillResolved(hex, alpha = null) {
  let rgb = hex;
  let a = alpha;
  if (/^#[0-9a-fA-F]{8}$/.test(hex)) {
    rgb = hex.slice(0, 7);
    a = parseInt(hex.slice(7), 16) / 255;
  }
  const inner =
    a == null
      ? el("a:srgbClr", { val: hexToRgbVal(rgb) })
      : el("a:srgbClr", { val: hexToRgbVal(rgb) }, el("a:alpha", { val: Math.round(a * 100000) }));
  return el("a:solidFill", {}, inner);
}

/** Position and size (bounds=[x,y,w,h], pt → EMU). rotation in degrees; flip=[horizontal, vertical]. */
export function buildXfrm(bounds, rotation, flip) {
  const [x, y, w, h] = bounds;
  const off = el("a:off", { x: Math.round(x * 12700), y: Math.round(y * 12700) });
  const ext = el("a:ext", { cx: Math.round(w * 12700), cy: Math.round(h * 12700) });
  const attrs = {};
  if (rotation) attrs.rot = angleToOOXML(rotation);
  if (Array.isArray(flip)) {
    if (flip[0]) attrs.flipH = "1";
    if (flip[1]) attrs.flipV = "1";
  }
  return el("a:xfrm", attrs, off + ext);
}

/** Shadow → a:effectLst, the single implementation (dist/dir/blurRad are computed only here;
 * defaults come from effectiveShadow; offset [x,y] with down positive → dist/dir clockwise,
 * down = 5400000). CT_OuterShadowEffect's child is the color element itself (wrapping it in
 * solidFill triggers repair). */
function shadowEffectLst(theme, shadow, baseAttrs, opacity) {
  const eff = effectiveShadow(shadow);
  if (!eff) return "";
  const attrs = { ...baseAttrs };
  if (eff.blur) attrs.blurRad = Math.round(eff.blur * 12700);
  if (eff.dx || eff.dy) {
    attrs.dist = Math.round(Math.hypot(eff.dx, eff.dy) * 12700);
    attrs.dir = angleToOOXML((Math.atan2(eff.dy, eff.dx) * 180) / Math.PI);
  }
  return el("a:effectLst", {}, el("a:outerShdw", attrs, colorElement(theme, eff.color, opacity)));
}

/** Text shadow → a:effectLst (no algn/rotWithShape attributes; used by text.js). */
export function shadowElement(theme, shadow) {
  return shadowEffectLst(theme, shadow, {}, null);
}

/**
 * Fill → OOXML. The input is normalized by normalizeFill (single source in model/style-spec):
 *  - string (hex / $token) / legacy { color } → solid
 *  - { type:"solid", color }
 *  - { type:"gradient", gradientType, stops, angle }
 *  - { type:"image", src, fit, crop, opacity } (media registered by the caller)
 * @param {number} [opacity] element-level transparency (0~1): injects a:alpha into solid/gradient colors
 */
export function buildFill(theme, fill, mediaRef = null, opacity = null) {
  fill = normalizeFill(fill);
  if (!fill) return "";
  if (fill.type === "solid") {
    // Official SolidFill ({type:"solid", color}) — previously relied on a legacy fill.color compat branch
    return el("a:solidFill", {}, colorElement(theme, fill.color, opacity));
  }
  if (fill.type === "gradient") {
    // a:gs pos unit = thousandths of a percent (100% = 100000), matching official PowerPoint output
    const stops = (fill.stops || []).map((s) =>
      el("a:gs", { pos: Math.round((s.position ?? 0) * 100000) }, colorElement(theme, s.color, opacity))
    ).join("");
    const inner = el("a:gsLst", {}, stops);
    if (fill.gradientType === "radial") {
      const path = el("a:path", { path: "circle" }, el("a:fillToRect", { l: 50000, t: 50000, r: 50000, b: 50000 }));
      return el("a:gradFill", { rotWithShape: 1 }, inner + path);
    }
    const ang = fill.angle ?? 0;
    return el("a:gradFill", { rotWithShape: 1 }, inner + el("a:lin", { ang: Math.round(ang * 60000), scaled: 1 }));
  }
  if (fill.type === "image") {
    if (!mediaRef) return "";
    const kids = [el("a:blip", { "r:embed": mediaRef.id })];
    // Element-level transparency (official: image transparency = a:alphaModFix inside a:blip)
    if (fill.opacity != null && fill.opacity < 1) {
      kids.push(el("a:alphaModFix", { amt: Math.round(fill.opacity * 100000) }));
    }
    // A caller-computed final srcRect (element crop+cover composed) takes priority; otherwise compute plain cover
    if (mediaRef.srcRect) {
      kids.push(el("a:srcRect", mediaRef.srcRect));
    } else {
      const crop = fill.crop;
      if (crop) {
        const sr = {
          l: crop.left != null ? Math.round(crop.left * 100000) : undefined,
          t: crop.top != null ? Math.round(crop.top * 100000) : undefined,
          r: crop.right != null ? Math.round(crop.right * 100000) : undefined,
          b: crop.bottom != null ? Math.round(crop.bottom * 100000) : undefined,
        };
        kids.push(el("a:srcRect", sr));
      }
      const mode = fill.fit?.mode || "cover";
      if (mode !== "fill") {
        // cover / contain (a fill context cannot express contain letterboxing, so both map to
        // proportional cropping = cover): crop the source via srcRect so the target container is
        // fully covered
        const size = mediaRef.size;
        const cw = mediaRef.containerW || fill.containerW || 960;
        const ch = mediaRef.containerH || fill.containerH || 540;
        if (size) {
          const rect = coverSrcRect(size[0], size[1], cw, ch);
          if (rect) kids.push(el("a:srcRect", rect));
        }
      }
    }
    kids.push(el("a:stretch", {}, el("a:fillRect", {})));
    return el("a:blipFill", {}, kids.join(""));
  }
  return "";
}

/**
 * cover: compute the source-rectangle crop (OOXML a:srcRect semantics).
 * l/t/r/b = inward crop ratio from each edge (thousandths), so the target container is fully covered.
 */
export function coverSrcRect(imgW, imgH, boxW, boxH) {
  if (!imgW || !imgH || !boxW || !boxH) return null;
  const scale = Math.max(boxW / imgW, boxH / imgH);
  const srcW = boxW / scale;
  const srcH = boxH / scale;
  const l = (imgW - srcW) / 2 / imgW; // left crop = right crop (symmetric)
  const t = (imgH - srcH) / 2 / imgH; // top crop = bottom crop (symmetric)
  return {
    l: Math.round(l * 100000),
    t: Math.round(t * 100000),
    r: Math.round(l * 100000),
    b: Math.round(t * 100000),
  };
}

/** Border → a:ln. */
export function buildLn(theme, border, opacity = null) {
  if (!border) return "";
  const w = Math.round((border.width ?? 1) * 12700);
  const kids = [solidFillElement(theme, border.color ?? "#000000", opacity)];
  const dash = dashSpec(border.style)?.ooxml;
  if (dash) kids.push(el("a:prstDash", { val: dash }));
  return el("a:ln", { w, cap: "flat", cmpd: "sng", algn: "ctr" }, kids.join(""));
}

/** Shape/table shadow → a:effectLst. shadow: {blur, color, offset:[x,y]}.
 * algn="tl" matches official PowerPoint output (the default algn="b" points the shadow the wrong way). */
export function buildShadow(theme, shadow, opacity = null) {
  return shadowEffectLst(theme, shadow, { algn: "tl", rotWithShape: 0 }, opacity);
}
