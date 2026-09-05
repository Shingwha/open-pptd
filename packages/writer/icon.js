// ============================================================================
// writer/icon.js — 图标元素导出（SVG 图片嵌入，PowerPoint 原生图标格式）
// ----------------------------------------------------------------------------
// 与 PowerPoint「插入 → 图标」的原生存储格式一致（实测官方文件验证）：
//   <p:pic><p:blipFill><a:blip><a:extLst><a:ext uri="{96DAC541-...}">
//     <asvg:svgBlip ... r:embed="rIdN"/>…<a:stretch><a:fillRect/></a:stretch>
//   </p:blipFill><p:spPr>…</p:spPr></p:pic>
// SVG 文件写入 ppt/media/*.svg；PowerPoint 用内置 SVG 引擎渲染同一份 SVG
// —— 预览 = 导出。
//
// 图标 def 为异步获取（本地库/CDN/编辑器预读），故 buildPptx 先经
// loadIconDefs() 预载全部命中图标（ctx.iconDefs），slide 装配保持同步。
// 未命中（名字不合法/注册表未收录/SVG 拿不到）→ onIconSkipped 聚合告警
// （对齐字体的 onFontSkipped），元素跳过。
// ============================================================================

import { el, escAttr } from "./xml.js";
import { encodeUtf8 } from "./zip.js";
import { buildXfrm } from "./drawing.js";
import { walkElements } from "../model/walk.js";
import { loadIconRegistry, resolveIconName, fetchIconSvg, loadIconSvgNode, normalizeIconSvg } from "../model/icon-fa.js";
import { iconToSvg, normalizeIconFill } from "../model/icon-svg.js";

/** SVG 图片扩展的官方 ext uri（MS-OI29500 SVG 扩展）。 */
const SVG_EXT_URI = "{96DAC541-7B7A-43D3-8B79-37D633B846F1}";

/** preserveAspectRatio "meet" 的实绘矩形：图标按自身宽高比在 bounds 内居中。 */
function fitRect([bx, by, bw, bh], vbw, vbh) {
  const scale = Math.min(bw / vbw, bh / vbh);
  const dw = vbw * scale;
  const dh = vbh * scale;
  return [bx + (bw - dw) / 2, by + (bh - dh) / 2, dw, dh];
}

/**
 * 预载 deck 用到的全部图标（buildPptx 在装配页面前调用）。
 * @param {object} deck 统一数据模型
 * @param {object} [options]
 *   - iconRegistry：已加载的注册表（缺省自动加载；Node 需 iconDir+fs，浏览器 fetch）
 *   - iconDefs：{ [rawIconName]: {inner,w,h} } 编辑器预读缓存（命中则不再回源）
 *   - loadIconSvg：(hit, registry) → svgText | null 自定义解析（测试注入本地包）
 *   - iconDir + fs：Node 端本地库直读（缺文件走 CDN 兜底）
 * @returns {Promise<{defs: Map, skipped: Array}>}
 */
export async function loadIconDefs(deck, options = {}) {
  // 注册表加载失败（文件缺失/浏览器 404）不阻断导出：全部图标按 unavailable 跳过
  // （语义同字体的 registry-unavailable）
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

/** 图标元素 → p:pic XML（SVG 图片）。未命中（应已由 loadIconDefs 预载）返回 ""。 */
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
      // 元素级透明度（官方：图片透明度 = a:blip 内 a:alphaModFix，amt 千分比）
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
    // 关键：xfrm 用 "meet" 适配后的矩形（图标按自身宽高比在 bounds 内居中的实绘区域），
    // 而非整个 bounds。PowerPoint 对无显式尺寸的 SVG 会非等比拉伸铺满图片框
    // （浏览器是 preserveAspectRatio letterbox）——把比例烙进框本身，任何
    // PPT 版本都确定正确。旧 bs: 库全是 16×16 方形 viewBox，拉伸不可见，
    // FA 宽高比各异后此问题显形。旋转/翻转仍围绕 bounds 中心（fit 矩形居中，中心一致）。
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
