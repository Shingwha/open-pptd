// ============================================================================
// writer/image.js — 图片元素导出（p:pic，fit: cover/contain/fill）
// ============================================================================

import { el, escAttr } from "./xml.js";
import { buildXfrm, buildFill, buildLn, buildShadow } from "./drawing.js";

/** 图片元素 → p:pic XML。fit 模式与预览 object-fit 语义一致。 */
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
  // p:pic 的 blipFill 属于 presentationml 命名空间（p:blipFill），
  // 而 buildFill 返回 a:blipFill（用于形状/背景填充）——此处必须替换前缀
  const toPicBlipFill = (aXml) =>
    aXml ? aXml.replace(/^<a:blipFill/, "<p:blipFill").replace(/<\/a:blipFill>$/, "</p:blipFill>") : "";
  // contain：图片完整居中（等比缩放 ext，不裁剪不变形）——与预览 object-fit: contain 一致
  let xfrm = buildXfrm(element.bounds, element.rotation);
  let blipFill;
  if (fitMode === "contain" && loaded.size) {
    const [iw, ih] = loaded.size;
    const [bw, bh] = [element.bounds[2], element.bounds[3]];
    const s = Math.min(bw / iw, bh / ih);
    const w = Math.round(iw * s);
    const h = Math.round(ih * s);
    const cx = Math.round((bw - w) / 2);
    const cy = Math.round((bh - h) / 2);
    xfrm = buildXfrm([element.bounds[0] + cx, element.bounds[1] + cy, w, h], element.rotation);
    blipFill = toPicBlipFill(
      el("a:blipFill", {}, [
        el("a:blip", { "r:embed": mediaRef.id }),
        el("a:stretch", {}, el("a:fillRect", {})),
      ].join(""))
    );
  } else {
    blipFill = toPicBlipFill(buildFill(theme, {
      type: "image",
      src,
      fit: element.fit || { mode: fitMode },
      crop: element.crop,
    }, { ...mediaRef, containerW: element.bounds[2], containerH: element.bounds[3] }));
  }
  const spPr = el("p:spPr", {}, [
    xfrm,
    el("a:prstGeom", { prst: "rect" }),
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
