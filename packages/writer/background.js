// ============================================================================
// writer/background.js — page background export (p:bg: solid/gradient/image)
// ----------------------------------------------------------------------------

import { el } from "./xml.js";
import { buildFill, colorElement } from "./drawing.js";
import { imageXml } from "./image.js";
import { PAGE_WIDTH, PAGE_HEIGHT } from "../model/model.js";

/**
 * Page background → { bg, underlay }:
 *   - bg: p:bg XML (solid / gradient / image-cover / white base for image-contain)
 *   - underlay: spTree bottom-most element XML (image-contain only)
 * `contain` is the canonical semantic (fully visible, centered letterbox), but an OOXML page
 * background can only stretch/tile and cannot express letterboxing — so the background drops
 * to a white base while the image goes through the image-element pipeline (contain, centered,
 * fully visible) layered at the bottom (reusing imageXml's contain centering math).
 */
export function backgroundXml(theme, bg, ctx) {
  if (!bg) return { bg: "", underlay: "" };
  let fill = "";
  let underlay = "";
  if (bg.type === "image" && bg.src) {
    const [cw, ch] = ctx.pageSize || [PAGE_WIDTH, PAGE_HEIGHT];
    if (bg.fit?.mode === "contain") {
      fill = el("a:solidFill", {}, colorElement(theme, "#ffffff"));
      underlay = imageXml(theme, {
        elementId: "背景图",
        src: bg.src,
        bounds: [0, 0, cw, ch],
        fit: { mode: "contain" },
        crop: bg.crop,
        opacity: bg.opacity,
      }, ctx);
    } else {
      // cover: register the background image as media + pass the actual page size (deck.size, default 960×540)
      const loaded = ctx.loadImage(bg.src);
      if (loaded) {
        const mediaRef = ctx.addMedia(loaded.bytes, loaded.ext);
        mediaRef.size = loaded.size;
        fill = buildFill(theme, bg, { ...mediaRef, containerW: cw, containerH: ch });
      }
    }
  } else {
    fill = buildFill(theme, bg);
  }
  if (!fill) return { bg: "", underlay: "" };
  return { bg: el("p:bg", {}, el("p:bgPr", {}, fill + el("a:effectLst"))), underlay };
}
