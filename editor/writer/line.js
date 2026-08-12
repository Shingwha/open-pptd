// ============================================================================
// writer/line.js — 线条元素导出
// ----------------------------------------------------------------------------
// 直线（2 点）：p:cxnSp + prstGeom straightConnector1 + xfrm 旋转（已验证零修复）；
// 曲线（多点）：p:sp + a:custGeom（viewBox 坐标系，moveTo + lnTo/cubicBezTo）。
//   ⚠ 不能用 cxnSp + custGeom：PowerPoint 直接判定文件损坏拒开（实测 0x80070570）；
//   PowerPoint 自身的自由曲线/曲线连接符也是 p:sp + custGeom。
// curve: sharp/round = 折线（lnTo 全部点），smooth = 贝塞尔（首尾锚点 + 中间控制点）。
// ============================================================================

import { el, escAttr, angleToOOXML } from "./xml.js";
import { buildFill, buildXfrm } from "./drawing.js";
import { parsePoints, smoothSegments } from "../core/geometry.js";
import { svgPathToOoxml } from "./custgeom.js";

/** 线条元素 → XML（多点曲线为 p:sp+custGeom，2 点直线为 p:cxnSp）。 */
export function lineXml(theme, element, ctx) {
  const b = element.bounds;
  const pts = parsePoints(element.points, element.viewBox || [1, 1], b);
  if (!pts || pts.length < 2) return "";
  // 相对 bounds 原点（custGeom 坐标系 = viewBox，随 bounds 拉伸）
  const rel = pts.map(([px, py]) => [px - b[0], py - b[1]]);
  const curve = element.curve || "round";
  const [vw, vh] = element.viewBox || [1, 1];
  // 曲线路径点换算到 viewBox 坐标系（xfrm ext = bounds 尺寸，viewBox 空间拉伸到 bounds）
  const toVb = ([px, py]) => [(px / b[2]) * vw, (py / b[3]) * vh];

  let geom;
  if (rel.length > 2) {
    // 曲线：custGeom（viewBox 坐标系，随 bounds 拉伸）
    // smooth = 贝塞尔（首尾锚点 + 中间控制点）；sharp/round = 经过全部点的折线
    const relVb = rel.map(toVb);
    let d;
    if (curve === "smooth") {
      d = `M ${relVb[0][0]},${relVb[0][1]}`;
      for (const s of smoothSegments(relVb)) {
        if (s.cmd === "Q") {
          d += ` Q ${s.pts[0][0]},${s.pts[0][1]} ${s.pts[1][0]},${s.pts[1][1]}`;
        } else if (s.cmd === "C") {
          d += ` C ${s.pts[0][0]},${s.pts[0][1]} ${s.pts[1][0]},${s.pts[1][1]} ${s.pts[2][0]},${s.pts[2][1]}`;
        } else {
          d += ` L ${s.pts[0][0]},${s.pts[0][1]}`;
        }
      }
    } else {
      d = `M ${relVb[0][0]},${relVb[0][1]} L ${relVb.slice(1).map(([px, py]) => `${px},${py}`).join(" L ")}`;
    }
    geom = [
      // 多点线条必须有 xfrm（off/ext = bounds），否则 PowerPoint 视为 0×0 不可见
      buildXfrm(element.bounds, element.rotation, element.flip),
      el("a:custGeom", {}, [
        "<a:avLst/>",
        "<a:gdLst/>",
        "<a:ahLst/>",
        "<a:cxnLst/>",
        el("a:rect", { l: 0, t: 0, r: Math.round(vw), b: Math.round(vh) }),
        svgPathToOoxml(element.viewBox, d),
      ].join("")),
      // 曲线形状无填充（PowerPoint 自由曲线默认无线条色外填充）
      "<a:noFill/>",
    ].join("");
  } else {
    // 直线：straightConnector1 + 旋转（起点→终点）
    // off 用绝对坐标反推：旋转中心 = off + (len/2, 0)，线段端点必须精确落在 P0/P1。
    // 旋转中心 c = (off.x + len/2, off.y)，端点 = c ± (len/2·cosθ, len/2·sinθ)（顺时针，y 向下）
    // → off = (P0.x − len/2·(1−cosθ), P0.y + len/2·sinθ)
    const [x1, y1] = rel[0];
    const [x2, y2] = rel[1];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    let angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (angleDeg < 0) angleDeg += 360; // ST_Angle 有效域 [0, 360)
    const rad = (angleDeg * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);
    const p0x = x1 + b[0]; // P0 页面绝对坐标
    const p0y = y1 + b[1];
    const off = el("a:off", {
      x: Math.round((p0x - (len / 2) * (1 - cosA)) * 12700),
      y: Math.round((p0y + (len / 2) * sinA) * 12700),
    });
    const ext = el("a:ext", { cx: Math.round(len * 12700), cy: 0 });
    geom = [
      el("a:xfrm", { rot: angleToOOXML(angleDeg) }, off + ext),
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
  const ln = el("a:ln", { w: Math.round((border.width ?? 1) * 12700), cap: "flat", cmpd: "sng", algn: "ctr" }, lnKids.join(""));
  if (rel.length > 2) {
    // 多点曲线 → p:sp + custGeom（cxnSp + custGeom 会被 PowerPoint 判定为损坏拒开）
    return el("p:sp", {}, [
      el("p:nvSpPr", {}, [
        el("p:cNvPr", { id: ctx.nextId(), name: escAttr(element.elementId) }),
        el("p:cNvSpPr"),
        el("p:nvPr"),
      ]),
      el("p:spPr", {}, [geom, ln].join("")),
      // 空正文（与 PowerPoint 自由曲线一致；p:sp 需要 txBody）
      el("p:txBody", {}, '<a:bodyPr/><a:lstStyle/><a:p><a:pPr algn="ctr"/></a:p>'),
    ].join(""));
  }
  return (
    el("p:cxnSp", {}, [
      el("p:nvCxnSpPr", {}, [
        el("p:cNvPr", { id: ctx.nextId(), name: escAttr(element.elementId) }),
        el("p:cNvCxnSpPr"),
        el("p:nvPr"),
      ]),
      el("p:spPr", {}, [geom, ln].join("")),
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
