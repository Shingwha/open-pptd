// ============================================================================
// drawing.js — 通用 OOXML 绘制片段（xfrm / fill / border / shadow）
// ----------------------------------------------------------------------------
// 形状、文本边框、图片边框、表格填充共用；统一来自 core 的 fill 模型。
// ============================================================================

import { el, hexToRgbVal } from "./xml.js";
import { resolveColor } from "../core/theme.js";

/** 颜色 → OOXML 填充元素。主题 token 优先 schemeClr（可换主题），其余 srgbClr。
 * opacity（0~1，可选）：文字/元素透明度——a:alpha 修饰符加在颜色元素内部
 * （PowerPoint 官方存储结构，见 tests/reference/test-text.pptx 透明文字）。 */
const TOKEN_SLOT = { text: "dk2", bg: "lt2", primary: "accent1", accent: "accent2" };

const TOKEN_ALPHA_RE = /^\$([a-zA-Z-]+)([0-9a-fA-F]{2})$/;

/** 合并 hex 自带 alpha 与元素 opacity（0~1）→ a:alpha val（1/1000 %）。 */
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
    // 派生色（$primary-deep/soft/tint）与令牌透明度（$primary20）：
    // PowerPoint 对背景中 schemeClr 的 tint/shade 渲染不稳定，导出直接用解析后的具体色值（= 预览所见）
    if (color === "$primary-deep" || color === "$primary-soft" || color === "$primary-tint" || TOKEN_ALPHA_RE.test(color)) {
      return solidRgb(resolveColor(theme, color), opacity);
    }
    const key = color.slice(1);
    if (TOKEN_SLOT[key]) return el("a:schemeClr", { val: TOKEN_SLOT[key] }, alphaVal(null, opacity));
    return solidRgb(resolveColor(theme, color), opacity);
  }
  if (typeof color === "string" && color.startsWith("#")) {
    return solidRgb(color, opacity);
  }
  return "";
}

/** 颜色 → 完整 a:solidFill 元素（rPr / a:ln / a:outerShdw 等填充位置必须包裹）。
 * 无显式色但需要透明度时，用默认文字色槽 tx1 + a:alpha（PowerPoint 官方结构）。 */
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

/** 位置与尺寸（bounds=[x,y,w,h]，pt → EMU）。rotation 为度；flip=[水平, 垂直]。 */
export function buildXfrm(bounds, rotation, flip) {
  const [x, y, w, h] = bounds;
  const off = el("a:off", { x: Math.round(x * 12700), y: Math.round(y * 12700) });
  const ext = el("a:ext", { cx: Math.round(w * 12700), cy: Math.round(h * 12700) });
  const attrs = {};
  if (rotation) attrs.rot = Math.round(rotation * 60000);
  if (Array.isArray(flip)) {
    if (flip[0]) attrs.flipH = "1";
    if (flip[1]) attrs.flipV = "1";
  }
  return el("a:xfrm", attrs, off + ext);
}

/** 阴影 → a:effectLst（文字/形状阴影共用；offset [x,y] 向下为正 → dist/dir 顺时针）。 */
export function shadowElement(theme, shadow) {
  if (!shadow) return "";
  const [dx = 0, dy = 0] = shadow.offset || [];
  const attrs = {};
  if (shadow.blur) attrs.blurRad = Math.round(shadow.blur * 12700);
  if (dx || dy) {
    attrs.dist = Math.round(Math.hypot(dx, dy) * 12700);
    attrs.dir = Math.round((Math.atan2(dy, dx) * 180) / Math.PI * 60000);
  }
  return el("a:effectLst", {}, el("a:outerShdw", attrs, colorElement(theme, shadow.color)));
}

/**
 * 填充 → OOXML。支持：
 *  - string（hex / $token）→ solid
 *  - { type:"solid", color }
 *  - { type:"gradient", gradientType, stops, angle }
 *  - { type:"image", src, fit, crop, opacity }（媒体由调用方注册）
 */
export function buildFill(theme, fill, mediaRef = null) {
  if (!fill) return "";
  if (typeof fill === "string") {
    return el("a:solidFill", {}, colorElement(theme, fill));
  }
  if (typeof fill !== "object") return "";
  if (fill.type === "gradient") {
    // a:gs pos 单位 = 千分之一百分比（100% = 100000），与 PowerPoint 官方输出一致
    const stops = (fill.stops || []).map((s) =>
      el("a:gs", { pos: Math.round((s.position ?? 0) * 100000) }, colorElement(theme, s.color))
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
    const crop = fill.crop;
    if (crop) {
      const sr = el("a:srcRect", {
        l: crop.left != null ? Math.round(crop.left * 100000) : undefined,
        t: crop.top != null ? Math.round(crop.top * 100000) : undefined,
        r: crop.right != null ? Math.round(crop.right * 100000) : undefined,
        b: crop.bottom != null ? Math.round(crop.bottom * 100000) : undefined,
      });
      kids.push(sr);
    }
    const mode = fill.fit?.mode || "cover";
    if (mode === "fill") {
      kids.push(el("a:stretch", {}, el("a:fillRect", {})));
    } else {
      // cover / contain（填充上下文无法表达 contain 留白，统一等比裁剪 = cover）：
      // 通过 srcRect 裁剪源图，使目标容器完全覆盖
      // （需要图片原始尺寸与容器尺寸；调用方可放在 fill.containerW/H 或 mediaRef.containerW/H）
      const size = mediaRef.size;
      const cw = mediaRef.containerW || fill.containerW || 960;
      const ch = mediaRef.containerH || fill.containerH || 540;
      if (size) {
        const rect = coverSrcRect(size[0], size[1], cw, ch);
        if (rect) kids.push(el("a:srcRect", rect));
      }
      kids.push(el("a:stretch", {}, el("a:fillRect", {})));
    }
    return el("a:blipFill", {}, kids.join(""));
  }
  // 兼容旧形态：直接对象（color 字段）
  if (fill.color) {
    return el("a:solidFill", {}, colorElement(theme, fill.color));
  }
  return "";
}

/**
 * cover：计算源矩形裁剪量（OOXML a:srcRect 语义）。
 * l/t/r/b = 从各边缘向内的裁剪比例（千分位），使目标容器完全覆盖。
 */
export function coverSrcRect(imgW, imgH, boxW, boxH) {
  if (!imgW || !imgH || !boxW || !boxH) return null;
  const scale = Math.max(boxW / imgW, boxH / imgH);
  const srcW = boxW / scale;
  const srcH = boxH / scale;
  const l = (imgW - srcW) / 2 / imgW; // 左裁 = 右裁（对称）
  const t = (imgH - srcH) / 2 / imgH; // 顶裁 = 底裁（对称）
  return {
    l: Math.round(l * 100000),
    t: Math.round(t * 100000),
    r: Math.round(l * 100000),
    b: Math.round(t * 100000),
  };
}

/** 边框 → a:ln。 */
export function buildLn(theme, border) {
  if (!border) return "";
  const w = Math.round((border.width ?? 1) * 12700);
  const kids = [solidFillElement(theme, border.color ?? "#000000")];
  if (border.style === "dash") kids.push(el("a:prstDash", { val: "dash" }));
  else if (border.style === "dot") kids.push(el("a:prstDash", { val: "dot" }));
  return el("a:ln", { w, cap: "flat", cmpd: "sng", algn: "ctr" }, kids.join(""));
}

/** 阴影 → a:effectLst。shadow: {blur, color, offset:[x,y]}。 */
export function buildShadow(theme, shadow) {
  if (!shadow) return "";
  const blur = Math.round((shadow.blur ?? 6) * 12700);
  const [dx = 0, dy = 0] = shadow.offset || [0, 0];
  const dist = Math.round(Math.hypot(dx, dy) * 12700);
  const dir = Math.round((Math.atan2(dx, -dy) * 180) / Math.PI * 60000);
  const fill = solidFillElement(theme, shadow.color || "#000000");
  const attrs = { blurRad: blur, dist, dir: dir % 36000000, rotWithShape: 0 };
  return el("a:effectLst", {}, el("a:outerShdw", attrs, fill));
}
