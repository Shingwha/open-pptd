// ============================================================================
// writer/shape.js — 形状元素导出（p:sp，prstGeom + adjustments）
// ============================================================================

import { el, escAttr } from "./xml.js";
import { buildXfrm, buildFill, buildLn, buildShadow } from "./drawing.js";
import { SUPPORTED_SHAPES } from "../core/model.js";
import { PRESET_SHAPES } from "../core/preset-geometry.data.js";

/** 形状元素 → p:sp XML（prstGeom + adjustments）。 */
export function shapeXml(theme, element, ctx) {
  const b = element.bounds;
  const def = SUPPORTED_SHAPES[element.shapeName];
  if (!def) {
    console.warn(`[writer] 不支持形状 ${element.shapeName}（${element.elementId}），已跳过`);
    return "";
  }
  let geom;
  // 圆角等调整值优先取元素自身的 adjustments，缺省回退预设默认
  const adjustments =
    Array.isArray(element.adjustments) && element.adjustments.length
      ? element.adjustments
      : def.adjustments;
  if (adjustments) {
    // 调整名：预置几何有 adjNames（如 pentagon 的 hf/vf），否则按索引 adj/adj1/adj2…
    const names =
      (PRESET_SHAPES[element.shapeName]?.adjNames) ||
      adjustments.map((_, i) => (i === 0 ? "adj" : `adj${i}`));
    const gds = adjustments
      .map((adj, i) => el("a:gd", { name: names[i] ?? `adj${i}`, fmla: `val ${adj}` }))
      .join("");
    geom = el("a:prstGeom", { prst: def.preset }, el("a:avLst", {}, gds));
  } else {
    geom = el("a:prstGeom", { prst: def.preset });
  }
  const kids = [buildXfrm(b, element.rotation), geom];
  const fill = buildFill(theme, element.fill);
  if (fill) kids.push(fill);
  const ln = buildLn(theme, element.border);
  if (ln) kids.push(ln);
  const sh = buildShadow(theme, element.shadow);
  if (sh) kids.push(sh);
  return (
    el("p:sp", {}, [
      el("p:nvSpPr", {}, [
        el("p:cNvPr", { id: ctx.nextId(), name: escAttr(element.elementId) }),
        el("p:cNvSpPr"),
        el("p:nvPr"),
      ]),
      el("p:spPr", {}, kids.join("")),
    ].join(""))
  );
}
