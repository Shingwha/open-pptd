// ============================================================================
// renderer/line.js — line → SVG (straight / polyline sharp·round / bezier smooth + arrowheads)
// ----------------------------------------------------------------------------
// Official semantics: the first and last of `points` are waypoints, the middle ones are
// bezier control points (smooth); sharp = straight-segment polyline, round = rounded-join
// polyline, smooth = bezier curve. With exactly 2 points all three are equivalent (a line).
// ============================================================================

import { colorOr } from "../model/theme.js";
import { dashSpec, ooxmlArrow } from "../model/style-spec.js";
import { parsePoints, smoothSegments } from "../model/geometry.js";
import { createElementShell } from "./shell.js";

const SVG_NS = "http://www.w3.org/2000/svg";

export function renderLine(theme, el) {
  const [bx, by] = el.bounds;
  const svg = createElementShell(el, { tag: "svg" });

  const pts = parsePoints(el.points, el.viewBox || [1, 1], el.bounds);
  if (!pts || pts.length < 2) return svg;
  // The SVG coordinate system uses the bounds origin as (0,0), so points must be made relative (otherwise they draw outside the viewport and stay invisible)
  const rel = pts.map(([px, py]) => [px - bx, py - by]);
  const [x1, y1] = rel[0];
  const [x2, y2] = rel[rel.length - 1];

  const color = colorOr(theme, el.border?.color, "#000000");
  const width = el.border?.width || 1;
  const dash = dashSpec(el.border?.style)?.css || null;
  const curve = el.curve || "round";

  // Curves (multiple points) use path; a straight line uses line
  let shape;
  if (rel.length > 2) {
    shape = document.createElementNS(SVG_NS, "path");
    if (curve === "smooth") {
      // Bezier: first/last are waypoints, middle ones are control points (segmentation is shared with the writer via smoothSegments; the last anchor is always reached)
      let d = `M ${x1} ${y1}`;
      for (const s of smoothSegments(rel)) {
        if (s.cmd === "Q") {
          d += ` Q ${s.pts[0][0]} ${s.pts[0][1]} ${s.pts[1][0]} ${s.pts[1][1]}`;
        } else if (s.cmd === "C") {
          d += ` C ${s.pts[0][0]} ${s.pts[0][1]} ${s.pts[1][0]} ${s.pts[1][1]} ${s.pts[2][0]} ${s.pts[2][1]}`;
        } else {
          d += ` L ${s.pts[0][0]} ${s.pts[0][1]}`;
        }
      }
      shape.setAttribute("d", d);
    } else {
      // sharp / round: a polyline through every point (only the join style differs)
      shape.setAttribute("d", `M ${x1} ${y1} L ${rel.slice(1).map(([px, py]) => `${px} ${py}`).join(" L ")}`);
      shape.setAttribute("stroke-linejoin", curve === "round" ? "round" : "miter");
    }
  } else {
    shape = document.createElementNS(SVG_NS, "line");
    shape.setAttribute("x1", x1);
    shape.setAttribute("y1", y1);
    shape.setAttribute("x2", x2);
    shape.setAttribute("y2", y2);
  }
  shape.setAttribute("stroke", color);
  shape.setAttribute("stroke-width", width);
  if (dash) shape.setAttribute("stroke-dasharray", dash);
  // SVG's default black fill implicitly closes and fills open paths (a "shadow area" in preview), so it must match the export's <a:noFill/>
  shape.setAttribute("fill", "none");
  svg.appendChild(shape);

  // Arrow direction = path endpoint tangent (last segment for both curves and polylines)
  const endAngle = Math.atan2(y2 - rel[rel.length - 2][1], x2 - rel[rel.length - 2][0]);
  const startAngle = Math.atan2(rel[1][1] - y1, rel[1][0] - x1);
  const endArrow = el.arrow?.[1];
  if (endArrow) {
    svg.appendChild(arrowHead(ooxmlArrow(endArrow), x2, y2, endAngle, color, Math.max(8, width * 5)));
  }
  const startArrow = el.arrow?.[0];
  if (startArrow) {
    svg.appendChild(arrowHead(ooxmlArrow(startArrow), x1, y1, startAngle, color, Math.max(8, width * 5)));
  }
  return svg;
}

/** Arrowhead SVG (triangle/stealth/diamond polygons + oval ellipse), named and oriented
 * the same as the export's a:headEnd/tailEnd four types (tip on the endpoint, along the
 * endpoint tangent). */
function arrowHead(kind, x, y, angle, color, size) {
  if (kind === "oval") {
    const node = document.createElementNS(SVG_NS, "ellipse");
    const cx = x - (size / 2) * Math.cos(angle);
    const cy = y - (size / 2) * Math.sin(angle);
    node.setAttribute("cx", cx);
    node.setAttribute("cy", cy);
    node.setAttribute("rx", size / 2);
    node.setAttribute("ry", size * 0.3);
    node.setAttribute("transform", `rotate(${(angle * 180) / Math.PI} ${cx} ${cy})`);
    node.setAttribute("fill", color);
    return node;
  }
  const p = document.createElementNS(SVG_NS, "polygon");
  const wing = (a) => [x - size * Math.cos(angle + a), y - size * Math.sin(angle + a)];
  let pts;
  if (kind === "stealth") {
    // Pointed triangle with a concave base (the notch retreats half-size along the centerline)
    pts = [[x, y], wing(-0.45), [x - (size / 2) * Math.cos(angle), y - (size / 2) * Math.sin(angle)], wing(0.45)];
  } else if (kind === "diamond") {
    // Diamond: tip, two side vertices (±0.35·size at mid-length), tail
    const midX = x - (size / 2) * Math.cos(angle);
    const midY = y - (size / 2) * Math.sin(angle);
    const perp = angle + Math.PI / 2;
    pts = [
      [x, y],
      [midX - 0.35 * size * Math.cos(perp), midY - 0.35 * size * Math.sin(perp)],
      [x - size * Math.cos(angle), y - size * Math.sin(angle)],
      [midX + 0.35 * size * Math.cos(perp), midY + 0.35 * size * Math.sin(perp)],
    ];
  } else {
    // triangle (default)
    pts = [[x, y], wing(-0.45), wing(0.45)];
  }
  p.setAttribute("points", pts.map(([px, py]) => `${px},${py}`).join(" "));
  p.setAttribute("fill", color);
  return p;
}
