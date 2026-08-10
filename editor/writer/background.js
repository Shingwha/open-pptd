// ============================================================================
// writer/background.js — 页面背景导出（p:bg：solid/gradient/image）
// ============================================================================

import { el } from "./xml.js";
import { buildFill } from "./drawing.js";

/** 页面背景 → p:bg XML（solid / gradient / image）。 */
export function backgroundXml(theme, bg, ctx) {
  if (!bg) return "";
  let fill;
  if (bg.type === "image" && bg.src) {
    // 背景图片：注册媒体 + 传入页面尺寸（960×540）
    const loaded = ctx.loadImage(bg.src);
    if (loaded) {
      const mediaRef = ctx.addMedia(loaded.bytes, loaded.ext);
      mediaRef.size = loaded.size;
      fill = buildFill(theme, bg, { ...mediaRef, containerW: 960, containerH: 540 });
    }
  } else {
    fill = buildFill(theme, bg);
  }
  if (!fill) return "";
  return el("p:bg", {}, el("p:bgPr", {}, fill + el("a:effectLst")));
}
