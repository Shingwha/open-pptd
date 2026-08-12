// ============================================================================
// drawing.js — 通用 OOXML 绘制片段（xfrm / fill / border / shadow）
// ----------------------------------------------------------------------------
// 形状、文本边框、图片边框、表格填充共用；统一来自 core 的 fill 模型。
// ============================================================================

import { el, hexToRgbVal } from "./xml.js";
import { resolveColor } from "../core/theme.js";
import { PRESET_SHAPES } from "../core/preset-geometry.data.js";
import { SUPPORTED_SHAPES } from "../core/model.js";
import { custGeomXml } from "./custgeom.js";

/**
 * 预置几何 → a:prstGeom。
 * 与 PowerPoint 存储一致：未显式设置 adjustments 时输出空 avLst（用预设内置默认），
 * 显式设置时按 adjNames 写 gd（仅当元素级 adjustments 非空）。
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
 * ShapeDef（shapeName/adjustments/viewBox/path，见官方 Image.cropShape）→ 几何元素。
 * custom 走 a:custGeom；缺省回退矩形。
 */
export function buildShapeDefGeom(shapeDef) {
  if (!shapeDef) return el("a:prstGeom", { prst: "rect" });
  if (shapeDef.shapeName === "custom") {
    if (!shapeDef.path || !Array.isArray(shapeDef.viewBox)) return el("a:prstGeom", { prst: "rect" });
    return custGeomXml(shapeDef.viewBox, shapeDef.path);
  }
  return buildPresetGeom(shapeDef.shapeName, shapeDef.adjustments);
}

/** 颜色 → OOXML 填充元素。主题 token 优先 schemeClr（可换主题），其余 srgbClr。
 * opacity（0~1，可选）：文字/元素透明度——a:alpha 修饰符加在颜色元素内部
 * （PowerPoint 官方存储结构，见 tests/projects/text/reference/test-text.pptx 透明文字）。 */
const TOKEN_SLOT = { text: "dk2", bg: "lt2", primary: "accent1", accent: "accent2" };

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
    const key = color.slice(1);
    if (TOKEN_SLOT[key]) return el("a:schemeClr", { val: TOKEN_SLOT[key] }, alphaVal(null, opacity));
    // 主题 colors 的其余键：PowerPoint 对背景中 schemeClr 的 tint/shade 渲染不稳定，
    // 派生色键（primarySoft 等）导出直接用解析后的具体色值（= 预览所见）
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
 * @param {number} [opacity] 元素级透明度（0~1）：solid/gradient 颜色内注入 a:alpha
 */
export function buildFill(theme, fill, mediaRef = null, opacity = null) {
  if (!fill) return "";
  if (typeof fill === "string") {
    return el("a:solidFill", {}, colorElement(theme, fill, opacity));
  }
  if (typeof fill !== "object") return "";
  if (fill.type === "solid") {
    // 官方 SolidFill（{type: "solid", color}）——此前依赖旧 fill.color 兼容分支，
    // 清理后一度丢失（表格填充/页面背景全空，2026-08-10 回归）
    return el("a:solidFill", {}, colorElement(theme, fill.color, opacity));
  }
  if (fill.type === "gradient") {
    // a:gs pos 单位 = 千分之一百分比（100% = 100000），与 PowerPoint 官方输出一致
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
    // 元素级透明度（官方：图片透明度 = a:blip 内 a:alphaModFix）
    if (fill.opacity != null && fill.opacity < 1) {
      kids.push(el("a:alphaModFix", { amt: Math.round(fill.opacity * 100000) }));
    }
    // 调用方已算好的最终 srcRect（元素级 crop+cover 合成）优先，否则按普通 cover 计算
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
        // cover / contain（填充上下文无法表达 contain 留白，统一等比裁剪 = cover）：
        // 通过 srcRect 裁剪源图，使目标容器完全覆盖
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
export function buildLn(theme, border, opacity = null) {
  if (!border) return "";
  const w = Math.round((border.width ?? 1) * 12700);
  const kids = [solidFillElement(theme, border.color ?? "#000000", opacity)];
  if (border.style === "dash") kids.push(el("a:prstDash", { val: "dash" }));
  else if (border.style === "dot") kids.push(el("a:prstDash", { val: "dot" }));
  return el("a:ln", { w, cap: "flat", cmpd: "sng", algn: "ctr" }, kids.join(""));
}

/** 阴影 → a:effectLst。shadow: {blur, color, offset:[x,y]}。
 * CT_OuterShadowEffect 子元素 = 颜色元素本身（包 solidFill 会判损修复）；
 * dir 为顺时针角度（向下 = 5400000），offset [x,y] 向下为正。 */
export function buildShadow(theme, shadow, opacity = null) {
  if (!shadow) return "";
  const [dx = 0, dy = 0] = shadow.offset || [0, 0];
  // algn="tl" 与 PowerPoint 官方输出一致（缺省 algn="b" 阴影方向不对）
  const attrs = { algn: "tl", rotWithShape: 0 };
  if (shadow.blur) attrs.blurRad = Math.round(shadow.blur * 12700);
  if (dx || dy) {
    attrs.dist = Math.round(Math.hypot(dx, dy) * 12700);
    attrs.dir = Math.round((Math.atan2(dy, dx) * 180) / Math.PI * 60000);
  }
  return el("a:effectLst", {}, el("a:outerShdw", attrs, colorElement(theme, shadow.color || "#000000", opacity)));
}
