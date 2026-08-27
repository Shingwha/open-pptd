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
    // 背景图片：注册媒体 + 传入页面实际尺寸（deck.size，缺省 960×540）
    const loaded = ctx.loadImage(bg.src);
    if (loaded) {
      const mediaRef = ctx.addMedia(loaded.bytes, loaded.ext);
      mediaRef.size = loaded.size;
      const [cw, ch] = ctx.pageSize || [960, 540];
      fill = buildFill(theme, bg, { ...mediaRef, containerW: cw, containerH: ch });
    }
  } else {
    fill = buildFill(theme, bg);
  }
  if (!fill) return "";
  return el("p:bg", {}, el("p:bgPr", {}, fill + el("a:effectLst")));
}
