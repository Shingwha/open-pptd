// ============================================================================
// model/svg-path.js — SVG path lexing, shared by the renderer clip-path scaler and
// the writer a:custGeom parser (browser + Node, zero dependencies)
// ----------------------------------------------------------------------------
// Both consumers used to carry their own copy of the command token regex and the
// command-arity table. Those two pieces are byte-for-byte identical, and that is what
// this module single-sources; each consumer keeps its own segment loop because their
// jobs differ:
//   - parseSvgPath: absolute command stream consumed by writer/custgeom.js
//   - scaleSvgPath: coordinate scaling for a CSS clip-path (custom cropShape viewBox)
//
// The segment loops stay separate for the same reason. Historical note: scaleSvgPath's
// arity-0 (Z) branch used to re-emit the token after Z, swallowing the next command
// letter (leaving the following subpath unscaled) and appending the literal "undefined"
// for a trailing Z. Fixed to scale every subpath; at scale 1 the output is unchanged,
// which the golden render baseline pins.
// ============================================================================

/** SVG command arity: argument count per command letter (Z takes none). */
export const SVG_CMD_ARITY = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

/** Command letter or number (numbers may use scientific notation). */
const SVG_TOKEN_RE = /([MmLlHhVvCcSsQqTtAaZz])|(-?\d*\.?\d+(?:[eE][+-]?\d+)?)/g;

/**
 * Tokenize an SVG path `d`: a flat array with command letters as strings and numbers
 * as numbers, in source order. Non-string input yields an empty array.
 * @param {string} d
 * @returns {Array<string|number>}
 */
export function tokenizeSvgPath(d) {
  const tokens = [];
  if (typeof d !== "string") return tokens;
  const re = new RegExp(SVG_TOKEN_RE.source, "g");
  let m;
  while ((m = re.exec(d))) tokens.push(m[1] != null ? m[1] : parseFloat(m[2]));
  return tokens;
}

/**
 * Parse an SVG path `d` into a command stream `[[op, args], …]` (op is the uppercase
 * absolute command; coordinates are already converted to absolute).
 *
 * Contract kept from the previous writer-local implementation: implicit repeats reuse
 * the previous command, M is followed by implicit L, Z resets to the subpath start,
 * and a segment with fewer arguments than its arity ends parsing.
 * @returns {Array<[string, number[]]>}
 */
export function parseSvgPath(d) {
  if (typeof d !== "string" || !d.trim()) return [];
  const tokens = tokenizeSvgPath(d);
  const cmds = [];
  let i = 0;
  let cur = [0, 0];
  let start = [0, 0];
  let lastCmd = "";
  let ctrl = null;
  while (i < tokens.length) {
    let cmd;
    if (typeof tokens[i] === "string") {
      cmd = tokens[i];
      i++;
    } else if (lastCmd) {
      cmd = lastCmd; // implicitly repeat the previous command (arity taken from the previous segment)
    } else {
      break;
    }
    const rel = cmd !== cmd.toUpperCase();
    const op = cmd.toUpperCase();
    const args = [];
    const argCount = SVG_CMD_ARITY[op];
    let consumed = 0;
    while (consumed < argCount && i < tokens.length && typeof tokens[i] === "number") {
      args.push(tokens[i]);
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

/**
 * Scale an SVG path's coordinates (CSS clip-path use): scale each coordinate token by
 * command arity; for A only the endpoint xy is scaled (rx/ry/rot/largeArc/sweep are
 * geometry, not position). Relative deltas are scaled in place; absolute coordinates
 * are scaled directly. Values are rounded to 3 decimals.
 *
 * Keeps its original segment loop verbatim, including the arity-0/Z branch described
 * in the file header. Do not "fix" it against parseSvgPath without regenerating the
 * golden render baseline.
 * @param {string} d SVG path
 * @param {number} sx x scale
 * @param {number} sy y scale
 * @returns {string} the scaled path
 */
export function scaleSvgPath(d, sx, sy) {
  const tokens = tokenizeSvgPath(d);
  let out = "";
  let cur = [0, 0];
  let i = 0;
  let lastOp = "";
  while (i < tokens.length) {
    let op = "";
    if (typeof tokens[i] === "string") {
      op = tokens[i];
      lastOp = op.toUpperCase();
      out += op;
      i++;
    } else {
      op = lastOp || "L";
    }
    const arity = SVG_CMD_ARITY[op.toUpperCase()] || 0;
    if (!arity) {
      // Z: the letter itself was already emitted by the string branch. A following
      // command letter is handled by the string branch on the next pass; a trailing
      // Z (i out of range) or stray numbers directly after Z end the path.
      if (typeof tokens[i] !== "string") break;
      continue;
    }
    const seg = tokens.slice(i, i + arity).map(Number);
    if (seg.length < arity) break;
    const U = op.toUpperCase();
    const rel = op !== U;
    const coords = seg.map((v, k) => {
      let outV;
      if (U === "H") outV = v * sx;
      else if (U === "V") outV = v * sy;
      else if (U === "A") outV = k >= 5 ? (rel ? (k === 5 ? cur[0] + v * sx : cur[1] + v * sy) : k === 5 ? v * sx : v * sy) : v;
      else outV = k % 2 === 0 ? v * sx : v * sy;
      return Math.round(outV * 1000) / 1000;
    });
    out += " " + coords.join(" ");
    if (U === "H") cur = [coords[0], cur[1]];
    else if (U === "V") cur = [cur[0], coords[0]];
    else if (U === "C") cur = [coords[4], coords[5]];
    else if (U === "S" || U === "Q") cur = [coords[2], coords[3]];
    else if (U === "A") cur = [coords[5], coords[6]];
    else if (U === "M" || U === "L" || U === "T") cur = [coords[0], coords[1]];
    i += arity;
  }
  return out;
}
