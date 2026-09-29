// ============================================================================
// writer/custgeom.js — custom path (SVG path) → a:custGeom (OOXML custom geometry)
// ----------------------------------------------------------------------------
// PPTD shapeName:"custom" + viewBox + path (M/L/H/V/C/S/Q/A/Z) → official PowerPoint
// storage: a:path uses the viewBox as its geometry coordinate system (w/h attributes) and
// a:rect bounds the whole geometry → PowerPoint stretches that coordinate system to the shape
// bounds (matching the preview).
//
// Arc conversion: SVG A (endpoint parameterization) → OOXML arcTo (center parameterization);
// with a zero rotation angle it emits arcTo directly, otherwise it degrades to a cubic bezier
// approximation (arcTo cannot express rotated ellipses).
// Holes: SVG's nonzero winding rule matches PowerPoint — opposite inner/outer ring directions
// produce a hole, passed through as-is.
// ============================================================================

import { el, angleToOOXML } from "./xml.js";

/** Number → integer (OOXML pt/angle rounding). */
const n = (v) => Math.round(v);

/**
 * SVG path command stream → OOXML pathLst fragment (including the a:path wrapper).
 * @param {Array<number>} viewBox [w, h]
 * @param {string} d SVG path d string
 * @returns {string} a:pathLst XML
 */
export function svgPathToOoxml(viewBox, d) {
  const [vw, vh] = viewBox || [21600, 21600];
  const cmds = parseSvgPath(d);
  if (!cmds.length) return "";

  let cx = 0; // current point
  let cy = 0;
  let sx = 0; // subpath start
  let sy = 0;
  let lastCmd = "";
  let lastCtrl = null; // reflection control point for the previous S/T [x, y]

  const kids = [];
  for (const [op, args] of cmds) {
    switch (op) {
      case "M": {
        cx = args[0];
        cy = args[1];
        sx = cx;
        sy = cy;
        lastCtrl = null;
        kids.push(ptCmd("moveTo", cx, cy));
        lastCmd = "M";
        break;
      }
      case "L": {
        cx = args[0];
        cy = args[1];
        lastCtrl = null;
        kids.push(ptCmd("lnTo", cx, cy));
        lastCmd = "L";
        break;
      }
      case "H": {
        cx = args[0];
        lastCtrl = null;
        kids.push(ptCmd("lnTo", cx, cy));
        lastCmd = "H";
        break;
      }
      case "V": {
        cy = args[0];
        lastCtrl = null;
        kids.push(ptCmd("lnTo", cx, cy));
        lastCmd = "V";
        break;
      }
      case "C": {
        const [c1x, c1y, c2x, c2y, x, y] = args;
        kids.push(
          el("a:cubicBezTo", {}, [
            el("a:pt", { x: n(c1x), y: n(c1y) }),
            el("a:pt", { x: n(c2x), y: n(c2y) }),
            el("a:pt", { x: n(x), y: n(y) }),
          ].join(""))
        );
        cx = x;
        cy = y;
        lastCtrl = [c2x, c2y];
        lastCmd = "C";
        break;
      }
      case "S": {
        // Reflect the second control point of the previous C; otherwise use the current point
        const [c2x, c2y, x, y] = args;
        const [r1x, r1y] = lastCmd === "C" || lastCmd === "S" ? reflect(lastCtrl, cx, cy) : [cx, cy];
        kids.push(
          el("a:cubicBezTo", {}, [
            el("a:pt", { x: n(r1x), y: n(r1y) }),
            el("a:pt", { x: n(c2x), y: n(c2y) }),
            el("a:pt", { x: n(x), y: n(y) }),
          ].join(""))
        );
        cx = x;
        cy = y;
        lastCtrl = [c2x, c2y];
        lastCmd = "S";
        break;
      }
      case "Q": {
        const [q1x, q1y, x, y] = args;
        kids.push(
          el("a:quadBezTo", {}, [
            el("a:pt", { x: n(q1x), y: n(q1y) }),
            el("a:pt", { x: n(x), y: n(y) }),
          ].join(""))
        );
        cx = x;
        cy = y;
        lastCtrl = [q1x, q1y];
        lastCmd = "Q";
        break;
      }
      case "T": {
        const [x, y] = args;
        const [q1x, q1y] = lastCmd === "Q" || lastCmd === "T" ? reflect(lastCtrl, cx, cy) : [cx, cy];
        kids.push(
          el("a:quadBezTo", {}, [
            el("a:pt", { x: n(q1x), y: n(q1y) }),
            el("a:pt", { x: n(x), y: n(y) }),
          ].join(""))
        );
        cx = x;
        cy = y;
        lastCtrl = [q1x, q1y];
        lastCmd = "T";
        break;
      }
      case "A": {
        const [rx, ry, rot, largeArc, sweep, x, y] = args;
        // Near-coincident endpoints = a full circle (official example M500,0 A500,500 0 1 1 499,0):
        // split into two 180° arcs. Non-zero rotation → cubic bezier approximation (arcTo cannot rotate ellipses)
        for (const sub of splitArc(cx, cy, rx, ry, rot, largeArc, sweep, x, y)) {
          if (sub.rot % 360 === 0) {
            const arc = svgArcToOoxml(sub.x0, sub.y0, sub.rx, sub.ry, 0, sub.largeArc, sub.sweep, sub.x1, sub.y1);
            if (arc) kids.push(el("a:arcTo", { wR: n(arc.wR), hR: n(arc.hR), stAng: n(arc.stAng), swAng: n(arc.swAng) }));
          } else {
            const segs = arcToBezier(sub.x0, sub.y0, sub.rx, sub.ry, sub.rot, sub.largeArc, sub.sweep, sub.x1, sub.y1);
            for (const s of segs || []) {
              kids.push(
                el("a:cubicBezTo", {}, [
                  el("a:pt", { x: n(s.c1[0]), y: n(s.c1[1]) }),
                  el("a:pt", { x: n(s.c2[0]), y: n(s.c2[1]) }),
                  el("a:pt", { x: n(s.p[0]), y: n(s.p[1]) }),
                ].join(""))
              );
            }
          }
        }
        cx = x;
        cy = y;
        lastCtrl = null;
        lastCmd = "A";
        break;
      }
      case "Z": {
        kids.push("<a:close/>");
        cx = sx;
        cy = sy;
        lastCtrl = null;
        lastCmd = "Z";
        break;
      }
      default:
        console.warn(`[custgeom] 未知路径命令 ${op}`);
    }
  }
  return el("a:pathLst", {}, el("a:path", { w: n(vw), h: n(vh) }, kids.join("")));
}

/** Full a:custGeom (custom shape geometry; no adjustments/handles/connection sites). */
export function custGeomXml(viewBox, d) {
  const [vw, vh] = viewBox || [21600, 21600];
  return el("a:custGeom", {}, [
    "<a:avLst/>",
    "<a:gdLst/>",
    "<a:ahLst/>",
    "<a:cxnLst/>",
    el("a:rect", { l: 0, t: 0, r: n(vw), b: n(vh) }),
    svgPathToOoxml(viewBox, d),
  ].join(""));
}

/** Reflect a control point: p' = 2·current − control. */
function reflect(ctrl, cx, cy) {
  return [2 * cx - ctrl[0], 2 * cy - ctrl[1]];
}

function ptCmd(tag, x, y) {
  return el(`a:${tag}`, {}, el("a:pt", { x: n(x), y: n(y) }));
}

/**
 * Arc → sub-arc list: near-coincident endpoints (a full circle, as in the official hole example)
 * split into two 180° arcs; everything else is returned as-is. A full circle's stAng is 0 (the
 * current point is at angle 0) and the direction follows sweep (outer clockwise / inner
 * counter-clockwise → PowerPoint nonzero-winding holes).
 */
export function splitArc(x0, y0, rx, ry, rotDeg, largeArc, sweep, x1, y1) {
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  if (rx === 0 || ry === 0) return [];
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const nearFull = dist < Math.max(rx, ry) * 0.005; // endpoints coincident / near-coincident
  if (!nearFull) {
    return [{ x0, y0, rx, ry, rot: rotDeg, largeArc, sweep, x1, y1 }];
  }
  if (!largeArc) return []; // near-coincident + not a large arc = tiny arc (SVG: omitted), emit nothing
  // Split a full circle into two half arcs: seg1 st=0→±180°, seg2 st=±180°→±360° (endpoints on the ellipse)
  const dir = sweep ? 1 : -1;
  const midX = x0 - 2 * rx * Math.cos((rotDeg * Math.PI) / 180);
  const midY = y0 - 2 * rx * Math.sin((rotDeg * Math.PI) / 180);
  return [
    { x0, y0, rx, ry, rot: rotDeg, largeArc: 0, sweep, x1: midX, y1: midY },
    { x0: midX, y0: midY, rx, ry, rot: rotDeg, largeArc: 0, sweep, x1: x0, y1: y0 },
  ];
}

/**
 * SVG A command (endpoint parameterization) → OOXML arcTo (center parameterization).
 * Exact conversion when the rotation angle is 0 (W3C SVG appendix F.6.5); returns null
 * otherwise (the caller degrades to bezier).
 */
export function svgArcToOoxml(x0, y0, rx, ry, rotDeg, largeArc, sweep, x1, y1) {
  const c = svgArcCenter(x0, y0, rx, ry, rotDeg, largeArc, sweep, x1, y1);
  if (!c || rotDeg % 360 !== 0) return null;
  return {
    wR: c.rx,
    hR: c.ry,
    stAng: angleToOOXML(c.theta1 * (180 / Math.PI)),
    swAng: angleToOOXML(c.dTheta * (180 / Math.PI)),
  };
}

/**
 * Center parameterization (W3C SVG appendix F.6.5, with radius correction), valid for any
 * rotation angle. Returns { cx, cy, rx, ry, theta1, dTheta }; null on degeneracy (radius 0 /
 * coincident endpoints that are not a full circle).
 */
function svgArcCenter(x0, y0, rx, ry, rotDeg, largeArc, sweep, x1, y1) {
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  if (rx === 0 || ry === 0) return null;
  const phi = ((rotDeg % 360) * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const dx = (x0 - x1) / 2;
  const dy = (y0 - y1) / 2;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;
  const rx2 = rx * rx;
  const ry2 = ry * ry;
  const lambda = (x1p * x1p) / rx2 + (y1p * y1p) / ry2;
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx *= s;
    ry *= s;
  }
  const rx2s = rx * rx;
  const ry2s = ry * ry;
  const num = rx2s * ry2s - rx2s * y1p * y1p - ry2s * x1p * x1p;
  const den = rx2s * y1p * y1p + ry2s * x1p * x1p;
  const radicand = num / den;
  const coef = (largeArc === sweep ? -1 : 1) * Math.sqrt(Math.max(0, radicand));
  const cxp = (coef * (rx * y1p)) / ry;
  const cyp = (coef * (-ry * x1p)) / rx;
  const cx = cosPhi * cxp - sinPhi * cyp + (x0 + x1) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y0 + y1) / 2;
  const ux = (x1p - cxp) / rx;
  const uy = (y1p - cyp) / ry;
  const vx = (-x1p - cxp) / rx;
  const vy = (-y1p - cyp) / ry;
  const theta1 = Math.atan2(uy, ux);
  let dTheta = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  if (!sweep && dTheta > 0) dTheta -= 2 * Math.PI;
  else if (sweep && dTheta < 0) dTheta += 2 * Math.PI;
  return { cx, cy, rx, ry, theta1, dTheta };
}

/** A point on the rotated ellipse (θ radians, including rotation φ). */
function arcPoint(c, theta, phiDeg) {
  const phi = ((phiDeg % 360) * Math.PI) / 180;
  const ct = Math.cos(theta);
  const st = Math.sin(theta);
  return [
    c.cx + c.rx * ct * Math.cos(phi) - c.ry * st * Math.sin(phi),
    c.cy + c.rx * ct * Math.sin(phi) + c.ry * st * Math.cos(phi),
  ];
}

/** Arc (non-zero rotation) → cubic bezier approximation segments [{c1, c2, p}]. */
export function arcToBezier(x0, y0, rx, ry, rotDeg, largeArc, sweep, x1, y1) {
  const c = svgArcCenter(x0, y0, rx, ry, rotDeg, largeArc, sweep, x1, y1);
  if (!c) return null;
  const nSeg = Math.max(1, Math.ceil(Math.abs(c.dTheta) / (Math.PI / 2)));
  const out = [];
  for (let i = 0; i < nSeg; i++) {
    const a0 = c.theta1 + (c.dTheta * i) / nSeg;
    const a1 = c.theta1 + (c.dTheta * (i + 1)) / nSeg;
    const p0 = i === 0 ? [x0, y0] : arcPoint(c, a0, rotDeg);
    const p1 = arcPoint(c, a1, rotDeg);
    const alpha = (4 / 3) * Math.tan((a1 - a0) / 4);
    const phi = ((rotDeg % 360) * Math.PI) / 180;
    // Elliptical-arc tangent direction (differentiate in local coords, then rotate back)
    const d0x = -c.rx * Math.sin(a0) * Math.cos(phi) - c.ry * Math.cos(a0) * Math.sin(phi);
    const d0y = -c.rx * Math.sin(a0) * Math.sin(phi) + c.ry * Math.cos(a0) * Math.cos(phi);
    const d1x = -c.rx * Math.sin(a1) * Math.cos(phi) - c.ry * Math.cos(a1) * Math.sin(phi);
    const d1y = -c.rx * Math.sin(a1) * Math.sin(phi) + c.ry * Math.cos(a1) * Math.cos(phi);
    const c1 = [p0[0] + alpha * d0x, p0[1] + alpha * d0y];
    const c2 = [p1[0] - alpha * d1x, p1[1] - alpha * d1y];
    out.push({ c1, c2, p: p1 });
  }
  return out;
}

// ---------------------------------------------------------------------------
// SVG path parsing (supports M/L/H/V/C/S/Q/T/A/Z, absolute/relative, implicit repeats)
// ---------------------------------------------------------------------------
const CMD_RE = /[MmLlHhVvCcSsQqTtAaZz]/;

/**
 * Parse an SVG path d → command stream [[op, args], …] (op is the uppercase absolute command;
 * coordinates are already converted to absolute).
 * @returns {Array<[string, number[]]>}
 */
export function parseSvgPath(d) {
  if (typeof d !== "string" || !d.trim()) return [];
  const tokens = [];
  const re = /([MmLlHhVvCcSsQqTtAaZz])|(-?\d*\.?\d+(?:[eE][+-]?\d+)?)/g;
  let m;
  while ((m = re.exec(d))) {
    if (m[1]) tokens.push([m[1], null]);
    else tokens.push([null, parseFloat(m[2])]);
  }
  const cmds = [];
  let i = 0;
  let cur = [0, 0];
  let start = [0, 0];
  let lastCmd = "";
  let ctrl = null;
  while (i < tokens.length) {
    let cmd;
    if (tokens[i][0]) {
      cmd = tokens[i][0];
      i++;
    } else if (lastCmd) {
      cmd = lastCmd; // implicitly repeat the previous command (arity taken from the previous segment)
    } else {
      break;
    }
    const rel = cmd !== cmd.toUpperCase();
    const op = cmd.toUpperCase();
    const args = [];
    const argCount = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 }[op];
    let consumed = 0;
    while (consumed < argCount && i < tokens.length && !tokens[i][0]) {
      args.push(tokens[i][1]);
      i++;
      consumed++;
    }
    if (consumed < argCount) break; // truncated: not enough arguments
    if (op === "Z") {
      cmds.push(["Z", []]);
      cur = start;
      lastCmd = "";
      ctrl = null;
      continue;
    }
    // Expand to absolute coordinates (A's rx/ry/rot/largeArc/sweep are untouched; xy is converted)
    for (let k = 0; k < args.length; k += (op === "A" ? 7 : op === "C" ? 6 : op === "S" || op === "Q" ? 4 : op === "L" || op === "M" || op === "T" ? 2 : 1)) {
      const seg = args.slice(k, k + (op === "A" ? 7 : op === "C" ? 6 : op === "S" || op === "Q" ? 4 : op === "L" || op === "M" || op === "T" ? 2 : 1));
      if (seg.length < (op === "A" ? 7 : op === "C" ? 6 : op === "S" || op === "Q" ? 4 : op === "H" || op === "V" ? 1 : 2)) break;
      let abs;
      if (op === "A") {
        const [rx, ry, rot, la, sw, x, y] = seg;
        abs = [rx, ry, rot, la, sw, rel ? cur[0] + x : x, rel ? cur[1] + y : y];
      } else if (op === "H") {
        abs = [rel ? cur[0] + seg[0] : seg[0]];
      } else if (op === "V") {
        abs = [rel ? cur[1] + seg[0] : seg[0]];
      } else {
        abs = seg.map((v, idx) => (rel && idx % 2 === 0 ? cur[0] + v : rel && idx % 2 === 1 ? cur[1] + v : v));
      }
      cmds.push([op, abs]);
      if (op === "M") {
        start = [abs[0], abs[1]];
        cur = start;
        lastCmd = "L"; // the implicit command after M is L
        ctrl = null;
      } else {
        if (op === "H") cur = [abs[0], cur[1]];
        else if (op === "V") cur = [cur[0], abs[0]];
        else if (op === "C") cur = [abs[4], abs[5]];
        else if (op === "S") cur = [abs[2], abs[3]];
        else if (op === "Q") cur = [abs[2], abs[3]];
        else if (op === "T") cur = [abs[0], abs[1]];
        else if (op === "A") cur = [abs[5], abs[6]];
        else cur = [abs[0], abs[1]];
        lastCmd = op;
        ctrl = null;
      }
    }
  }
  return cmds;
}
