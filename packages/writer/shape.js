// ============================================================================
// writer/shape.js — shape element export (p:sp, prstGeom + adjustments / custGeom)
// ----------------------------------------------------------------------------
// Preset geometry: prstGeom by name + avLst (same source as the PRESET_SHAPES data);
// custom paths (shapeName:"custom"): a:custGeom (viewBox coordinate system + SVG path transcode).
// ============================================================================

import { el, escAttr } from "./xml.js";
import { buildXfrm, buildFill, buildLn, buildShadow, buildPresetGeom, buildShapeDefGeom } from "./drawing.js";
import { SUPPORTED_SHAPES } from "../model/model.js";

/**
 * Shape theme style reference (official PowerPoint structure):
 * stroke paths inside preset geometry (callout leaders / arcs / bracket centerlines, i.e.
 * fill="none" paths) are drawn with the shape's line style — with no a:ln in spPr, PowerPoint
 * falls back to p:style's lnRef (theme line). Without p:style, PowerPoint draws none of these
 * inner lines (leaders vanish).
 */
const SHAPE_STYLE =
  "<p:style>" +
  '<a:lnRef idx="1"><a:schemeClr val="accent1"/></a:lnRef>' +
  '<a:fillRef idx="0"><a:schemeClr val="accent1"/></a:fillRef>' +
  '<a:effectRef idx="0"><a:schemeClr val="accent1"/></a:effectRef>' +
  '<a:fontRef idx="minor"><a:schemeClr val="tx1"/></a:fontRef>' +
  "</p:style>";

/** Shape element → p:sp XML (prstGeom + adjustments / custGeom). */
export function shapeXml(theme, element, ctx) {
  const b = element.bounds;
  const kids = [buildXfrm(b, element.rotation, element.flip)];

  if (element.shapeName === "custom") {
    // Custom path: viewBox + SVG path → a:custGeom
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
  // No border (including an explicit null) → write <a:ln><a:noFill/></a:ln>: otherwise, with no
  // a:ln in spPr, PowerPoint falls back to p:style lnRef (theme line idx1 = 2pt accent1) and
  // every shape gets a stroke
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
