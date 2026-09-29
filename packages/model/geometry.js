// ============================================================================
// geometry.js — coordinates and geometry conversion (shared by renderer and writer, single implementation)
// ============================================================================

/**
 * Parse PPTD line points (viewBox coordinates -> real coordinates inside bounds).
 * Shared by the renderer (SVG) and the writer (OOXML rotation math) so the two
 * cannot drift apart.
 * @param {string} pointsStr "0,1 816,1" format
 * @param {Array<number>} viewBox [vw, vh]
 * @param {Array<number>} bounds [x, y, w, h]
 * @returns {Array<[number, number]> | null}
 */
export function parsePoints(pointsStr, viewBox, bounds) {
  if (!pointsStr) return null;
  const [vw, vh] = viewBox;
  const [bx, by, bw, bh] = bounds;
  const list = String(pointsStr)
    .trim()
    .split(/\s+/)
    .map((pair) => pair.split(",").map(Number));
  return list.map(([px, py]) => [bx + (px / vw) * bw, by + (py / vh) * bh]);
}

/**
 * smooth Bezier segments: first/last points are on-curve, the ones between are
 * control points (shared by renderer and writer, single implementation).
 * Split into cubic Beziers as consecutive "4-point chunks"; when 1 control point
 * plus the final anchor remains, close with a quadratic Bezier; if the split
 * leaves exactly one stray final anchor (point count n ≡ 2 mod 3, e.g. 5/8/11…),
 * close with a straight line so the final anchor is always drawn (previously that
 * point was silently dropped and the curve ended abruptly).
 * @param {Array<[number, number]>} rel point sequence (first/last on-curve, length ≥ 2)
 * @returns {Array<{cmd: "Q"|"C"|"L", pts: Array<[number, number]>}>}
 */
export function smoothSegments(rel) {
  const segs = [];
  const last = rel.length - 1;
  let i = 1;
  while (i < last) {
    const rest = last - i;
    if (rest === 1) {
      // Exactly one control point left + final anchor -> close with a quadratic Bezier
      segs.push({ cmd: "Q", pts: [rel[i], rel[last]] });
      i += 2;
    } else {
      // 4-point chunk: 2 control points + 1 on-curve point
      segs.push({ cmd: "C", pts: [rel[i], rel[i + 1], rel[i + 2]] });
      i += 3;
    }
  }
  if (i === last) {
    // Stray final anchor: close with a straight line so it gets consumed
    segs.push({ cmd: "L", pts: [rel[last]] });
  }
  return segs;
}
