// ============================================================================
// writer/image.js — image element export (p:pic, full crop → fit → cropShape pipeline)
// ----------------------------------------------------------------------------
// Official render order: crop (srcRect crops the source) → fit (cover/contain/fill) → cropShape
// (geometric outline crop via spPr). crop and fit are composed on the source rectangle
// (a:srcRect); cropShape is expressed through spPr's prstGeom/custGeom (official PowerPoint storage).
// ============================================================================

import { el, escAttr } from "./xml.js";
import { buildXfrm, buildFill, buildLn, buildShadow, buildShapeDefGeom } from "./drawing.js";

/**
 * crop (source-rectangle crop, ratios) → final a:srcRect attributes composed with fit.
 * Same semantics as official: crop the source by ratio first, then adapt to bounds by fit mode.
 * @param {object} crop {left,top,right,bottom} ratios (default 0; negative = outward transparent margin)
 * @param {"cover"|"contain"|"fill"} fitMode
 * @param {[number,number]} imgSize source image native size
 * @param {[number,number]} boxSize bounds size
 * @returns {object|null} a:srcRect attributes (l/t/r/b thousandths) or null (no crop)
 */
export function cropFitSrcRect(crop, fitMode, imgSize, boxSize) {
  const l = crop?.left || 0;
  const t = crop?.top || 0;
  const r = crop?.right || 0;
  const b = crop?.bottom || 0;
  if (l + r >= 1 || t + b >= 1) {
    console.warn(`[writer] crop 越界（left+right/top+bottom ≥ 1），已忽略`);
    return null;
  }
  const effW = 1 - l - r;
  const effH = 1 - t - b;
  if (fitMode === "fill" || !imgSize || !boxSize) {
    // fill: stretch to fill after cropping; with no size info, only express the crop
    if (!l && !t && !r && !b) return null;
    return {
      l: Math.round(l * 100000),
      t: Math.round(t * 100000),
      r: Math.round(r * 100000),
      b: Math.round(b * 100000),
    };
  }
  // cover / contain take a centered fit box inside the cropped source rectangle (source aspect = imgSize)
  const aEff = (effW * imgSize[0]) / (effH * imgSize[1]);
  const aBox = boxSize[0] / boxSize[1];
  let outL, outT, outW, outH;
  if (aEff >= aBox) {
    // Cropped source is wider → crop left/right further (cover semantics; contain also takes a centered fit box)
    outW = effH * (aBox * imgSize[1]) / imgSize[0];
    outH = effH;
    outL = l + (effW - outW) / 2;
    outT = t;
  } else {
    outH = effW * imgSize[0] / (aBox * imgSize[1]);
    outW = effW;
    outL = l;
    outT = t + (effH - outH) / 2;
  }
  return {
    l: Math.round(outL * 100000),
    t: Math.round(outT * 100000),
    r: Math.round((1 - outL - outW) * 100000),
    b: Math.round((1 - outT - outH) * 100000),
  };
}

/** Image element → p:pic XML. */
export function imageXml(theme, element, ctx) {
  const src = element.src;
  const loaded = ctx.loadImage(src);
  if (!loaded) {
    console.warn(`[writer] 无法加载图片 ${src}（${element.elementId}），已跳过`);
    return "";
  }
  const mediaRef = ctx.addMedia(loaded.bytes, loaded.ext);
  mediaRef.size = loaded.size; // [w,h]
  const fitMode = element.fit?.mode || "cover";
  const [bw, bh] = [element.bounds[2], element.bounds[3]];

  // p:pic's blipFill lives in the presentationml namespace (p:blipFill), while buildFill returns
  // a:blipFill (for shape/background fills) — so the prefix must be swapped here
  const toPicBlipFill = (aXml) =>
    aXml ? aXml.replace(/^<a:blipFill/, "<p:blipFill").replace(/<\/a:blipFill>$/, "</p:blipFill>") : "";

  let xfrm = buildXfrm(element.bounds, element.rotation, element.flip);
  let blipFill;
  if (fitMode === "contain" && loaded.size) {
    // contain: uniformly scale the cropped source rectangle to fit inside bounds, centered (no distortion, no crop)
    const crop = element.crop || {};
    const l = crop.left || 0;
    const t = crop.top || 0;
    const r = crop.right || 0;
    const b = crop.bottom || 0;
    const [iw, ih] = loaded.size;
    const effAspect = ((1 - l - r) * iw) / ((1 - t - b) * ih);
    const boxAspect = bw / bh;
    let w, h;
    if (effAspect >= boxAspect) {
      w = bw;
      h = Math.round(bw / effAspect);
    } else {
      h = bh;
      w = Math.round(bh * effAspect);
    }
    const cx = Math.round((bw - w) / 2);
    const cy = Math.round((bh - h) / 2);
    xfrm = buildXfrm([element.bounds[0] + cx, element.bounds[1] + cy, w, h], element.rotation, element.flip);
    // contain needs no source crop (uniform scaling already shows it fully)
    const sr = cropFitSrcRect(element.crop, "fill", loaded.size, [w, h]);
    blipFill = toPicBlipFill(
      el("p:blipFill", {}, [
        el("a:blip", { "r:embed": mediaRef.id }),
        element.opacity != null && element.opacity < 1
          ? el("a:alphaModFix", { amt: Math.round(element.opacity * 100000) })
          : "",
        sr ? el("a:srcRect", sr) : "",
        el("a:stretch", {}, el("a:fillRect", {})),
      ].join(""))
    );
  } else {
    // cover / fill: compose crop + fit into the final source rectangle and stretch to fill
    const sr = cropFitSrcRect(element.crop, fitMode, loaded.size, [bw, bh]);
    mediaRef.srcRect = sr;
    blipFill = toPicBlipFill(
      buildFill(theme, { type: "image", src, fit: { mode: "fill" }, opacity: element.opacity }, mediaRef)
    );
  }
  const spPr = el("p:spPr", {}, [
    xfrm,
    buildShapeDefGeom(element.cropShape), // default rectangle (no crop)
    buildLn(theme, element.border),
    buildShadow(theme, element.shadow),
  ].join(""));
  return (
    el("p:pic", {}, [
      el("p:nvPicPr", {}, [
        el("p:cNvPr", { id: ctx.nextId(), name: escAttr(element.elementId) }),
        el("p:cNvPicPr", {}, el("a:picLocks", { noChangeAspect: "1" })),
        el("p:nvPr"),
      ]),
      blipFill || `<p:blipFill><a:blip r:embed="${escAttr(mediaRef.id)}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>`,
      spPr,
    ].join(""))
  );
}
