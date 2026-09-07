// ============================================================================
// writer/background.js — 页面背景导出（p:bg：solid/gradient/image）
// ----------------------------------------------------------------------------

import { el } from "./xml.js";
import { buildFill, colorElement } from "./drawing.js";
import { imageXml } from "./image.js";
import { PAGE_WIDTH, PAGE_HEIGHT } from "../model/model.js";

/**
 * 页面背景 → { bg, underlay }：
 *   - bg：p:bg XML（solid / gradient / image-cover / image-contain 时为白底）
 *   - underlay：spTree 最底层元素 XML（仅 image-contain 有）
 * contain 是规范语义（完整显示、居中留白），而 OOXML 页面背景只有拉伸/平铺、
 * 表达不了留白——此时背景降为白色底，图片按 contain（居中完整显示）走图片
 * 元素管线垫在最底层（复用 imageXml 的 contain 居中矩形数学，零重复实现）。
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
      // cover：背景图片注册媒体 + 传入页面实际尺寸（deck.size，缺省 960×540）
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
