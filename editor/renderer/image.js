// ============================================================================
// renderer/image.js — 图片元素 → DOM（crop → fit → cropShape 全管线 + 边框/阴影）
// ----------------------------------------------------------------------------
// 官方渲染顺序：crop（object-view-box：裁源图后再 object-fit）→ fit
// （object-fit: cover/contain/fill）→ cropShape（clip-path 按形状轮廓裁剪）。
// object-view-box 为 Chrome 104+；不支持时降级 clip-path 近似（仅含 crop 场景）。
// ============================================================================

import { resolveColor } from "../core/theme.js";
import { shapePaths } from "../core/preset-geometry.js";
import { createElementShell } from "./shell.js";

/** 图片元素 → 定位 DOM。 */
export function renderImage(theme, el, ctx = {}) {
  const [, , w, h] = el.bounds;
  const box = createElementShell(el);

  const img = document.createElement("img");
  // 本地文件夹模式：src 相对路径 → 经 imageMap 解析为 dataURL（调用方传入，不再读全局）
  const map = ctx.imageMap || {};
  img.src = map[el.src] || el.src;
  img.style.cssText = `width:100%;height:100%;display:block;object-fit:${el.fit?.mode || "cover"};`;
  // crop：先裁源图再 fit（官方顺序）。object-view-box 百分比以源图为准
  const crop = el.crop;
  if (crop && (crop.left || crop.top || crop.right || crop.bottom)) {
    const inset = `inset(${(crop.top || 0) * 100}% ${(crop.right || 0) * 100}% ${(crop.bottom || 0) * 100}% ${(crop.left || 0) * 100}%)`;
    img.style.objectViewBox = inset;
    // 降级：不支持 object-view-box 时用 clip-path 近似（仅视觉近似，不影响导出）
    if (!("objectViewBox" in img.style)) img.style.clipPath = inset;
  }
  img.onerror = () => {
    img.style.display = "none";
    box.textContent = "[图片加载失败]";
    box.style.display = "flex";
    box.style.alignItems = "center";
    box.style.justifyContent = "center";
    box.style.color = "#999";
    box.style.fontSize = "12px";
  };
  box.appendChild(img);

  // cropShape：形状轮廓裁剪（clip-path 作用于整个 box，边框/阴影随之裁剪）
  const shapeDef = el.cropShape;
  if (shapeDef?.shapeName && shapeDef.shapeName !== "rect") {
    const clip = cropShapeClip(shapeDef, w, h);
    if (clip) box.style.clipPath = clip;
  }

  if (el.border) {
    box.style.border = `${el.border.width || 1}px ${el.border.style || "solid"} ${resolveColor(theme, el.border.color) || "#000"}`;
  }
  if (el.shadow) {
    const [dx = 0, dy = 0] = el.shadow.offset || [0, 0];
    box.style.boxShadow = `${dx}px ${dy}px ${el.shadow.blur ?? 6}px ${resolveColor(theme, el.shadow.color) || "rgba(0,0,0,0.3)"}`;
  }
  return box;
}

/** ShapeDef → CSS clip-path（预置几何按 bounds 求值；custom 直接用 SVG path）。 */
function cropShapeClip(shapeDef, w, h) {
  if (shapeDef.shapeName === "custom") {
    if (!shapeDef.path) return null;
    const [vw = w, vh = h] = shapeDef.viewBox || [w, h];
    // path() 坐标 = 元素本地坐标系（px），需把 viewBox 路径缩放到 w×h
    if (vw === w && vh === h) return `path('${shapeDef.path}')`;
    return `path('${scalePath(shapeDef.path, w / vw, h / vh)}')`;
  }
  const paths = shapePaths(shapeDef.shapeName, w, h, shapeDef.adjustments);
  if (!paths) return null;
  // 预置几何坐标已是 0..w × 0..h，直接可用（fill-rule 保持 nonzero，镂空语义一致）
  const d = paths.map((p) => p.d).join(" ");
  return `path('${d}')`;
}

/** 缩放 SVG path：按命令参数个数缩放坐标 token（A 命令只缩放终点 xy）。 */
function scalePath(d, sx, sy) {
  const ARITY = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?\d*\.?\d+(?:[eE][+-]?\d+)?/g) || [];
  let out = "";
  let cur = [0, 0];
  let i = 0;
  let lastOp = "";
  while (i < tokens.length) {
    let op = "";
    if (/[A-Za-z]/.test(tokens[i])) {
      op = tokens[i];
      lastOp = op.toUpperCase();
      out += op;
      i++;
    } else {
      op = lastOp || "L";
    }
    const arity = ARITY[op.toUpperCase()] || 0;
    if (!arity) {
      out += tokens[i];
      i++;
      continue;
    }
    const seg = tokens.slice(i, i + arity).map(Number);
    if (seg.length < arity) break;
    const U = op.toUpperCase();
    const rel = op !== U;
    const coords = seg.map((v, k) => {
      let outV;
      if (U === "H") outV = v * sx;
      else if (U === "V") outV = v * sy;
      else if (U === "A") outV = k >= 5 ? (rel ? (k === 5 ? cur[0] + v * sx : cur[1] + v * sy) : k === 5 ? v * sx : v * sy) : v;
      else outV = k % 2 === 0 ? v * sx : v * sy;
      return Math.round(outV * 1000) / 1000;
    });
    out += " " + coords.join(" ");
    if (U === "H") cur = [coords[0], cur[1]];
    else if (U === "V") cur = [cur[0], coords[0]];
    else if (U === "C") cur = [coords[4], coords[5]];
    else if (U === "S" || U === "Q") cur = [coords[2], coords[3]];
    else if (U === "A") cur = [coords[5], coords[6]];
    else if (U === "M" || U === "L" || U === "T") cur = [coords[0], coords[1]];
    i += arity;
  }
  return out;
}
