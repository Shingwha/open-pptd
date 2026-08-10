// ============================================================================
// writer/line.js — 线条元素导出（p:cxnSp）
// ----------------------------------------------------------------------------
// 直线（2 点）：prstGeom straightConnector1 + xfrm 旋转（已验证零修复）；
// 曲线（多点）：a:custGeom（viewBox 坐标系，moveTo + lnTo/cubicBezTo），
//   与 PowerPoint 存储曲线连接符的结构一致（cxnSp + custGeom）。
// curve: sharp/round = 折线（lnTo 全部点），smooth = 贝塞尔（首尾锚点 + 中间控制点）。
// ============================================================================

import { el, escAttr, angleToOOXML } from "./xml.js";
import { buildFill } from "./drawing.js";
import { parsePoints } from "../core/geometry.js";
import { svgPathToOoxml } from "./custgeom.js";

/** 线条元素 → p:cxnSp XML。 */
export function lineXml(theme, element, ctx) {
  const b = element.bounds;
  const pts = parsePoints(element.points, element.viewBox || [1, 1], b);
  if (!pts || pts.length < 2) return "";
  // 相对 bounds 原点（custGeom 坐标系 = viewBox，随 bounds 拉伸）
  const rel = pts.map(([px, py]) => [px - b[0], py - b[1]]);
  const curve = element.curve || "round";

  let geom;
  if (rel.length > 2) {
    // 曲线：custGeom（viewBox 坐标系，随 bounds 拉伸）
    // smooth = 贝塞尔（首尾锚点 + 中间控制点）；sharp/round = 经过全部点的折线
    let d;
    if (curve === "smooth") {
      d = `M ${rel[0][0]},${rel[0][1]}`;
      let i = 1;
      while (i < rel.length - 1) {
        const rest = rel.length - 1 - i;
        if (rest === 1) {
          d += ` Q ${rel[i][0]},${rel[i][1]} ${rel[rel.length - 1][0]},${rel[rel.length - 1][1]}`;
          i += 2;
        } else {
          d += ` C ${rel[i][0]},${rel[i][1]} ${rel[i + 1][0]},${rel[i + 1][1]} ${rel[i + 2][0]},${rel[i + 2][1]}`;
          i += 3;
        }
      }
    } else {
      d = `M ${rel[0][0]},${rel[0][1]} L ${rel.slice(1).map(([px, py]) => `${px},${py}`).join(" L ")}`;
    }
    geom = el("a:custGeom", {}, [
      "<a:avLst/>",
      "<a:gdLst/>",
      "<a:ahLst/>",
      "<a:cxnLst/>",
      el("a:rect", { l: 0, t: 0, r: Math.round(element.viewBox[0]), b: Math.round(element.viewBox[1]) }),
      svgPathToOoxml(element.viewBox, d),
    ].join(""));
  } else {
    // 直线：straightConnector1 + 旋转（起点→终点）
    const [x1, y1] = rel[0];
    const [x2, y2] = rel[1];
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
    const xfrmAttrs = { rot: angleToOOXML(rot) };
    if (flipH) xfrmAttrs.flipH = "1";
    const off = el("a:off", { x: Math.round(x1 * 12700), y: Math.round(y1 * 12700) });
    const ext = el("a:ext", { cx: Math.round(len * 12700), cy: 0 });
    geom = [
      el("a:xfrm", xfrmAttrs, off + ext),
      el("a:prstGeom", { prst: "straightConnector1" }),
    ].join("");
  }

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
        geom,
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
