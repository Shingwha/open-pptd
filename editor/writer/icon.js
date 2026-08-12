// ============================================================================
// writer/icon.js — 图标元素导出（SVG 图片嵌入，PowerPoint 原生图标格式）
// ----------------------------------------------------------------------------
// 与 PowerPoint「插入 → 图标」的原生存储格式一致（实测官方文件验证）：
//   <p:pic>
//     <p:blipFill>
//       <a:blip><a:extLst><a:ext uri="{96DAC541-...}">
//         <asvg:svgBlip xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main" r:embed="rIdN"/>
//       </a:ext></a:extLst></a:blip>
//       <a:stretch><a:fillRect/></a:stretch>
//     </p:blipFill>
//     <p:spPr><a:xfrm/>...<a:prstGeom prst="rect"/></p:spPr>
//   </p:pic>
// SVG 文件写入 ppt/media/*.svg，[Content_Types].xml 声明 image/svg+xml。
// PowerPoint 用内置 SVG 引擎渲染，与浏览器渲染同一份 SVG —— 预览 = 导出。
// ============================================================================

import { el, escAttr } from "./xml.js";
import { encodeUtf8 } from "./zip.js";
import { buildXfrm } from "./drawing.js";
import { ICONS } from "../core/icon-library.js";
import { resolveIconName } from "../core/icon-name.js";
import { iconToSvg, normalizeIconFill } from "../core/icon-svg.js";

/** SVG 图片扩展的官方 ext uri（MS-OI29500 SVG 扩展）。 */
const SVG_EXT_URI = "{96DAC541-7B7A-43D3-8B79-37D633B846F1}";

/** 图标元素 → p:pic XML（SVG 图片）。未知图标返回 ""。 */
export function iconXml(theme, element, ctx) {
  const def = ICONS[resolveIconName(element.iconName)];
  if (!def) {
    console.warn(`[writer] 未知图标 ${element.iconName}（${element.elementId}），已跳过`);
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
    buildXfrm(element.bounds, element.rotation, element.flip),
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
