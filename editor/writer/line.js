// ============================================================================
// writer/line.js — 线条元素导出（p:cxnSp，旋转 + 箭头）
// ============================================================================

import { el, escAttr, angleToOOXML } from "./xml.js";
import { buildFill } from "./drawing.js";
import { parsePoints } from "../core/geometry.js";

/** 线条元素 → p:cxnSp XML（直线 + 旋转 + 首尾箭头）。 */
export function lineXml(theme, element, ctx) {
  const b = element.bounds;
  const pts = parsePoints(element.points, element.viewBox || [1, 1], b);
  if (!pts || pts.length < 2) return "";
  const [x1, y1] = pts[0];
  const [x2, y2] = pts[pts.length - 1];
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;

  let rot;
  let flipH = false;
  if (angleDeg > 90) {
    rot = 180 - angleDeg;
    flipH = true;
  } else if (angleDeg < -90) {
    rot = -180 - angleDeg;
    flipH = true;
  } else {
    rot = angleDeg;
  }

  const xfrmAttrs = {};
  if (rot) xfrmAttrs.rot = angleToOOXML(rot);
  if (flipH) xfrmAttrs.flipH = "1";
  const off = el("a:off", { x: Math.round(x1 * 12700), y: Math.round(y1 * 12700) });
  const ext = el("a:ext", { cx: Math.round(len * 12700), cy: 0 });
  xfrmAttrs.rot = xfrmAttrs.rot || angleToOOXML(0);

  const border = element.border || { style: "solid", width: 1, color: "#000000" };
  const lnKids = [buildFill(theme, border.color ?? "#000000")];
  if (border.style === "dash") lnKids.push(el("a:prstDash", { val: "dash" }));
  else if (border.style === "dot") lnKids.push(el("a:prstDash", { val: "dot" }));
  if (element.arrow) {
    const [start, end] = element.arrow;
    if (start) lnKids.push(headEnd(start));
    if (end) lnKids.push(tailEnd(end));
  }
  return (
    el("p:cxnSp", {}, [
      el("p:nvCxnSpPr", {}, [
        el("p:cNvPr", { id: ctx.nextId(), name: escAttr(element.elementId) }),
        el("p:cNvCxnSpPr"),
        el("p:nvPr"),
      ]),
      el("p:spPr", {}, [
        el("a:xfrm", xfrmAttrs, off + ext),
        el("a:prstGeom", { prst: "straightConnector1" }),
        el("a:ln", { w: Math.round((border.width ?? 1) * 12700), cap: "flat", cmpd: "sng", algn: "ctr" }, lnKids.join("")),
      ]),
    ].join(""))
  );
}

function headEnd(type) {
  return el("a:headEnd", { type: arrowType(type), w: "med", len: "med" });
}
function tailEnd(type) {
  return el("a:tailEnd", { type: arrowType(type), w: "med", len: "med" });
}
function arrowType(type) {
  const map = { arrow: "triangle", stealth: "stealth", diamond: "diamond", oval: "oval" };
  return map[type] || "triangle";
}
