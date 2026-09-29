// ============================================================================
// writer/icon.js — icon element export (SVG image embedding, PowerPoint native icon format)
// ----------------------------------------------------------------------------
// Matches PowerPoint's native storage for "Insert → Icons":
//   <p:pic><p:blipFill><a:blip><a:extLst><a:ext uri="{96DAC541-...}">
//     <asvg:svgBlip ... r:embed="rIdN"/>…<a:stretch><a:fillRect/></a:stretch>
//   </p:blipFill><p:spPr>…</p:spPr></p:pic>
// The SVG file is written to ppt/media/*.svg; PowerPoint renders that same SVG with its
// built-in engine — preview == export.
//
// Icon defs are fetched asynchronously (local library/CDN/editor preload), so buildPptx
// preloads every matched icon through loadIconDefs() (ctx.iconDefs) and slide assembly stays
// synchronous. Misses (invalid name / not in registry / SVG unavailable) aggregate into
// onIconSkipped (mirroring onFontSkipped) and the element is skipped.
// ============================================================================

import { el, escAttr } from "./xml.js";
import { encodeUtf8 } from "../model/bytes.js";
import { buildXfrm } from "./drawing.js";
import { walkElements } from "../model/walk.js";
import { loadIconRegistry, resolveIconName, fetchIconSvg, loadIconSvgNode, normalizeIconSvg } from "../model/icon-fa.js";
import { iconToSvg, normalizeIconFill } from "../model/icon-svg.js";

/** Official ext uri for the SVG image extension (MS-OI29500 SVG extension). */
const SVG_EXT_URI = "{96DAC541-7B7A-43D3-8B79-37D633B846F1}";

/** The actual drawn rectangle for preserveAspectRatio "meet": the icon centered in bounds at its own aspect ratio. */
function fitRect([bx, by, bw, bh], vbw, vbh) {
  const scale = Math.min(bw / vbw, bh / vbh);
  const dw = vbw * scale;
  const dh = vbh * scale;
  return [bx + (bw - dw) / 2, by + (bh - dh) / 2, dw, dh];
}

/**
 * Preload every icon used by the deck (called by buildPptx before assembling pages).
 * @param {object} deck unified data model
 * @param {object} [options]
 *   - iconRegistry: an already-loaded registry (auto-loaded by default; Node needs iconDir+fs, browser uses fetch)
 *   - iconDefs: { [rawIconName]: {inner,w,h} } editor preload cache (a hit avoids a round-trip)
 *   - loadIconSvg: (hit, registry) → svgText | null custom resolver (tests inject a local bundle)
 *   - iconDir + fs: direct local-library read on Node (missing files fall back to CDN)
 * @returns {Promise<{defs: Map, skipped: Array}>}
 */
export async function loadIconDefs(deck, options = {}) {
  // A registry load failure (missing file / browser 404) does not block export: every icon is
  // skipped as unavailable (same semantics as the font registry-unavailable)
  let registry = null;
  try {
    registry = options.iconRegistry || (await loadIconRegistry(options));
  } catch (err) {
    console.warn(`[writer] 图标注册表不可用（${err.message}），图标全部跳过`);
  }
  const names = new Set();
  walkElements(deck?.pages, (elm) => {
    if (elm.elementType === "icon" && elm.iconName) names.add(elm.iconName);
  });
  const defs = new Map();
  const skipped = [];
  if (!registry) {
    for (const raw of names) skipped.push({ iconName: raw, reason: "registry-unavailable" });
    return { defs, skipped };
  }
  for (const raw of names) {
    const hit = resolveIconName(raw, registry);
    if (!hit) {
      skipped.push({ iconName: raw, reason: "unknown-name" });
      continue;
    }
    if (options.iconDefs?.[raw]?.inner) {
      defs.set(raw, options.iconDefs[raw]);
      continue;
    }
    let text = null;
    if (typeof options.loadIconSvg === "function") {
      text = await options.loadIconSvg(hit, registry);
    } else if (options.iconDir && options.fs?.readFileSync) {
      text = await loadIconSvgNode(hit, registry, options);
    } else {
      text = await fetchIconSvg(hit, registry);
    }
    const def = text ? normalizeIconSvg(text, hit) : null;
    if (!def) {
      skipped.push({ iconName: raw, reason: "svg-unavailable" });
      continue;
    }
    defs.set(raw, def);
  }
  return { defs, skipped };
}

/** Icon element → p:pic XML (SVG image). A miss (should have been preloaded by loadIconDefs) returns "". */
export function iconXml(theme, element, ctx) {
  const def = ctx.iconDefs?.get(element.iconName);
  if (!def) {
    console.warn(`[writer] 图标未预载或未知 ${element.iconName}（${element.elementId}），已跳过`);
    return "";
  }
  const fill = normalizeIconFill(theme, element.fill);
  const svg = iconToSvg(def, fill);
  const mediaRef = ctx.addMedia(encodeUtf8(svg), "svg");

  const blipFill = el("p:blipFill", {}, [
    el("a:blip", {}, [
      // Element-level transparency (official: image transparency = a:alphaModFix inside a:blip, amt in thousandths)
      element.opacity != null && element.opacity < 1
        ? el("a:alphaModFix", { amt: Math.round(element.opacity * 100000) })
        : "",
      el("a:extLst", {}, [
        el("a:ext", { uri: SVG_EXT_URI }, [
          el("asvg:svgBlip", {
            "xmlns:asvg": "http://schemas.microsoft.com/office/drawing/2016/SVG/main",
            "r:embed": mediaRef.id,
          }),
        ]),
      ]),
    ]),
    el("a:stretch", {}, el("a:fillRect", {})),
  ].join(""));

  const spPr = el("p:spPr", {}, [
    // Key: the xfrm uses the "meet"-fitted rectangle (the area the icon actually draws, centered
    // in bounds at its own aspect ratio) rather than the whole bounds. PowerPoint stretches SVGs
    // with no explicit size non-uniformly to fill the picture frame (browsers letterbox via
    // preserveAspectRatio) — baking the ratio into the frame is correct on every PPT version.
    // Rotation/flip still pivot around the bounds center (the fit rectangle is centered, same center).
    buildXfrm(fitRect(element.bounds, def.w, def.h), element.rotation, element.flip),
    el("a:prstGeom", { prst: "rect" }),
  ].join(""));

  return (
    el("p:pic", {}, [
      el("p:nvPicPr", {}, [
        el("p:cNvPr", { id: ctx.nextId(), name: escAttr(element.elementId) }),
        el("p:cNvPicPr", {}, el("a:picLocks", { noChangeAspect: "1" })),
        el("p:nvPr"),
      ]),
      blipFill,
      spPr,
    ].join(""))
  );
}
