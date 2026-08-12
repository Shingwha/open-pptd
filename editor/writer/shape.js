// ============================================================================
// writer/shape.js — 形状元素导出（p:sp，prstGeom + adjustments / custGeom）
// ----------------------------------------------------------------------------
// 预置几何：prstGeom 同名 + avLst（与 PRESET_SHAPES 数据同源）；
// 自定义路径（shapeName:"custom"）：a:custGeom（viewBox 坐标系 + SVG path 转写）。
// ============================================================================

import { el, escAttr } from "./xml.js";
import { buildXfrm, buildFill, buildLn, buildShadow, buildPresetGeom, buildShapeDefGeom } from "./drawing.js";
import { SUPPORTED_SHAPES } from "../core/model.js";

/**
 * 形状主题样式引用（PowerPoint 官方结构）：
 * 预设几何中的描边路径（标注引线/弧线/括号中线等 fill="none" 路径）
 * 用形状的线条样式绘制——spPr 无 a:ln 时回退到 p:style 的 lnRef（主题线条）。
 * 缺 p:style 时 PowerPoint 不画这些内部线条（引线消失）。
 */
const SHAPE_STYLE =
  "<p:style>" +
  '<a:lnRef idx="1"><a:schemeClr val="accent1"/></a:lnRef>' +
  '<a:fillRef idx="0"><a:schemeClr val="accent1"/></a:fillRef>' +
  '<a:effectRef idx="0"><a:schemeClr val="accent1"/></a:effectRef>' +
  '<a:fontRef idx="minor"><a:schemeClr val="tx1"/></a:fontRef>' +
  "</p:style>";

/** 形状元素 → p:sp XML（prstGeom + adjustments / custGeom）。 */
export function shapeXml(theme, element, ctx) {
  const b = element.bounds;
  const kids = [buildXfrm(b, element.rotation, element.flip)];

  if (element.shapeName === "custom") {
    // 自定义路径：viewBox + SVG path → a:custGeom
    if (!element.path || !Array.isArray(element.viewBox)) {
      console.warn(`[writer] custom 形状缺少 viewBox/path（${element.elementId}），已跳过`);
      return "";
    }
    kids.push(buildShapeDefGeom(element));
  } else {
    const def = SUPPORTED_SHAPES[element.shapeName];
    if (!def) {
      console.warn(`[writer] 不支持形状 ${element.shapeName}（${element.elementId}），已跳过`);
      return "";
    }
    kids.push(buildPresetGeom(element.shapeName, element.adjustments));
  }

  const fill = buildFill(theme, element.fill, null, element.opacity);
  if (fill) kids.push(fill);
  // 无 border（含显式 null）→ 写 <a:ln><a:noFill/></a:ln>：否则 spPr 缺 a:ln 时
  // PowerPoint 回退 p:style lnRef（主题线条 idx1 = 2pt accent1），所有形状都带描边
  const ln = buildLn(theme, element.border, element.opacity) || '<a:ln><a:noFill/></a:ln>';
  kids.push(ln);
  const sh = buildShadow(theme, element.shadow, element.opacity);
  if (sh) kids.push(sh);
  return (
    el("p:sp", {}, [
      el("p:nvSpPr", {}, [
        el("p:cNvPr", { id: ctx.nextId(), name: escAttr(element.elementId) }),
        el("p:cNvSpPr"),
        el("p:nvPr"),
      ]),
      el("p:spPr", {}, kids.join("")),
      SHAPE_STYLE,
    ].join(""))
  );
}
