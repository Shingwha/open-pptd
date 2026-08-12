// ============================================================================
// writer/image.js — 图片元素导出（p:pic，crop → fit → cropShape 全管线）
// ----------------------------------------------------------------------------
// 官方渲染顺序：crop（srcRect 裁源图）→ fit（cover/contain/fill）→ cropShape
// （spPr 几何轮廓裁剪）。crop 与 fit 的合成在源矩形上完成（a:srcRect），
// cropShape 通过 spPr 的 prstGeom/custGeom 表达（PowerPoint 官方存储结构）。
// ============================================================================

import { el, escAttr } from "./xml.js";
import { buildXfrm, buildFill, buildLn, buildShadow, buildShapeDefGeom } from "./drawing.js";

/**
 * crop（源矩形裁切，比例）→ 与 fit 合成后的最终 a:srcRect 属性。
 * 语义与官方一致：先按比例裁源图，再按 fit 模式适配到 bounds。
 * @param {object} crop {left,top,right,bottom} 比例（默认 0；可为负 = 外扩透明边）
 * @param {"cover"|"contain"|"fill"} fitMode
 * @param {[number,number]} imgSize 源图原始尺寸
 * @param {[number,number]} boxSize bounds 尺寸
 * @returns {object|null} a:srcRect 属性（l/t/r/b 千分位）或 null（不裁）
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
    // fill：裁切后直接拉伸铺满；无尺寸信息时同样只表达裁切
    if (!l && !t && !r && !b) return null;
    return {
      l: Math.round(l * 100000),
      t: Math.round(t * 100000),
      r: Math.round(r * 100000),
      b: Math.round(b * 100000),
    };
  }
  // cover / contain 在「裁切后源矩形」内居中取适配框（源图纵横比 = imgSize）
  const aEff = (effW * imgSize[0]) / (effH * imgSize[1]);
  const aBox = boxSize[0] / boxSize[1];
  let outL, outT, outW, outH;
  if (aEff >= aBox) {
    // 裁切后源图更宽 → 左右再裁（cover 语义；contain 时同样取居中适配框）
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

/** 图片元素 → p:pic XML。 */
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

  // p:pic 的 blipFill 属于 presentationml 命名空间（p:blipFill），
  // 而 buildFill 返回 a:blipFill（用于形状/背景填充）——此处必须替换前缀
  const toPicBlipFill = (aXml) =>
    aXml ? aXml.replace(/^<a:blipFill/, "<p:blipFill").replace(/<\/a:blipFill>$/, "</p:blipFill>") : "";

  let xfrm = buildXfrm(element.bounds, element.rotation, element.flip);
  let blipFill;
  if (fitMode === "contain" && loaded.size) {
    // contain：裁切后的源矩形等比缩放到 bounds 内居中（不变形不留裁切）
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
    // contain 无需裁剪源图（等比缩放即完整显示）
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
    // cover / fill：合成 crop + fit 的最终源矩形，拉伸铺满
    const sr = cropFitSrcRect(element.crop, fitMode, loaded.size, [bw, bh]);
    mediaRef.srcRect = sr;
    blipFill = toPicBlipFill(
      buildFill(theme, { type: "image", src, fit: { mode: "fill" }, opacity: element.opacity }, mediaRef)
    );
  }
  const spPr = el("p:spPr", {}, [
    xfrm,
    buildShapeDefGeom(element.cropShape), // 默认矩形（不裁剪）
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
