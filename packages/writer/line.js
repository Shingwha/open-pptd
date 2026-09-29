// ============================================================================
// writer/line.js — line element export
// ----------------------------------------------------------------------------
// Straight line (2 points): p:cxnSp + prstGeom straightConnector1 + xfrm rotation.
// Curve (multiple points): p:sp + a:custGeom (viewBox coordinate system, moveTo + lnTo/cubicBezTo).
//   WARNING: do not use cxnSp + custGeom — PowerPoint declares the file corrupt and refuses to
//   open it (error 0x80070570); PowerPoint's own freeform/curved connectors are p:sp + custGeom.
// curve: sharp/round = polyline (lnTo every point), smooth = bezier (endpoint anchors + middle control points).
// ============================================================================

import { el, escAttr, angleToOOXML } from "./xml.js";
import { buildFill, buildXfrm } from "./drawing.js";
import { parsePoints, smoothSegments } from "../model/geometry.js";
import { dashSpec, ooxmlArrow } from "../model/style-spec.js";
import { svgPathToOoxml } from "./custgeom.js";

/** Line element → XML (multi-point curves are p:sp+custGeom; 2-point lines are p:cxnSp). */
export function lineXml(theme, element, ctx) {
  const b = element.bounds;
  const pts = parsePoints(element.points, element.viewBox || [1, 1], b);
  if (!pts || pts.length < 2) return "";
  // Relative to the bounds origin (the custGeom coordinate system is the viewBox, stretched to bounds)
  const rel = pts.map(([px, py]) => [px - b[0], py - b[1]]);
  const curve = element.curve || "round";
  const [vw, vh] = element.viewBox || [1, 1];
  // Map curve path points into the viewBox coordinate system (xfrm ext = bounds size; the viewBox space stretches to bounds)
  const toVb = ([px, py]) => [(px / b[2]) * vw, (py / b[3]) * vh];

  let geom;
  if (rel.length > 2) {
    // Curve: custGeom (viewBox coordinate system, stretched to bounds)
    // smooth = bezier (endpoint anchors + middle control points); sharp/round = polyline through every point
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
      // Multi-point lines must have an xfrm (off/ext = bounds), otherwise PowerPoint sees 0×0 and they are invisible
      buildXfrm(element.bounds, element.rotation, element.flip),
      el("a:custGeom", {}, [
        "<a:avLst/>",
        "<a:gdLst/>",
        "<a:ahLst/>",
        "<a:cxnLst/>",
        el("a:rect", { l: 0, t: 0, r: Math.round(vw), b: Math.round(vh) }),
        svgPathToOoxml(element.viewBox, d),
      ].join("")),
      // Curved shapes have no fill (PowerPoint freeform defaults to no fill beyond the line color)
      "<a:noFill/>",
    ].join("");
  } else {
    // Straight line: straightConnector1 + rotation (start→end)
    // off is derived backwards from absolute coordinates: rotation center = off + (len/2, 0) and
    // the segment endpoints must land exactly on P0/P1. Center c = (off.x + len/2, off.y),
    // endpoints = c ± (len/2·cosθ, len/2·sinθ) (clockwise, y down)
    // → off = (P0.x − len/2·(1−cosθ), P0.y + len/2·sinθ)
    const [x1, y1] = rel[0];
    const [x2, y2] = rel[1];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    let angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (angleDeg < 0) angleDeg += 360; // ST_Angle valid range [0, 360)
    const rad = (angleDeg * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);
    const p0x = x1 + b[0]; // P0 in absolute page coordinates
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
  const dash = dashSpec(border.style)?.ooxml;
  if (dash) lnKids.push(el("a:prstDash", { val: dash }));
  // Join matches the preview's stroke-linejoin (round = rounded, otherwise miter). The OOXML
  // default is round, so a multi-point sharp polyline without an explicit miter would be drawn
  // rounded by PowerPoint (preview ≠ export)
  if (rel.length > 2) lnKids.push(curve === "round" ? el("a:round") : el("a:miter"));
  if (element.arrow) {
    const [start, end] = element.arrow;
    if (start) lnKids.push(headEnd(start));
    if (end) lnKids.push(tailEnd(end));
  }
  const ln = el("a:ln", { w: Math.round((border.width ?? 1) * 12700), cap: "flat", cmpd: "sng", algn: "ctr" }, lnKids.join(""));
  if (rel.length > 2) {
    // Multi-point curve → p:sp + custGeom (cxnSp + custGeom would be declared corrupt and refused)
    return el("p:sp", {}, [
      el("p:nvSpPr", {}, [
        el("p:cNvPr", { id: ctx.nextId(), name: escAttr(element.elementId) }),
        el("p:cNvSpPr"),
        el("p:nvPr"),
      ]),
      el("p:spPr", {}, [geom, ln].join("")),
      // Empty body (matching PowerPoint freeform; p:sp requires a txBody)
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
  return el("a:headEnd", { type: ooxmlArrow(type), w: "med", len: "med" });
}
function tailEnd(type) {
  return el("a:tailEnd", { type: ooxmlArrow(type), w: "med", len: "med" });
}
