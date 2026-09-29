// ============================================================================
// preset-geometry.js — ECMA-376 preset shape geometry evaluator (render side: SVG path)
// ----------------------------------------------------------------------------
// The data (preset-geometry.data.js) shares its origin with PowerPoint prstGeom (ECMA-376
// appendix): the preview is the path evaluated by the spec formulas, the export is the
// same-named prstGeom preset. Both geometries agree.
//
// Supported formula ops: val */ +- +/ ?: abs at2 cat2 cos max min mod pin sat2 sin sqrt tan
// Supported path commands: moveTo(M) / lnTo(L) / cubicBezTo(C) / quadBezTo(Q) / arcTo(A) / close(Z)
// Supports multiple paths: main fill outline + lighten/darken shading faces + fill="none" stroke detail.
// ============================================================================

import { PRESET_SHAPES } from "./preset-geometry.data.js";

/** Angle unit: 60000 = 1°. */
const DEG = 60000;

function baseGuides(w, h) {
  const g = { l: 0, t: 0, r: w, b: h, w, h };
  g.hc = w / 2;
  g.vc = h / 2;
  for (const n of [2, 3, 4, 5, 6, 8, 10, 12, 32]) {
    g[`wd${n}`] = w / n;
    g[`hd${n}`] = h / n;
  }
  g.ls = Math.max(w, h);
  g.ss = Math.min(w, h);
  for (const n of [2, 4, 6, 8, 16, 32]) g[`ssd${n}`] = g.ss / n;
  // Angle constants (used by arcTo etc.)
  g.cd2 = 10800000; // 180°
  g.cd4 = 5400000; // 90°
  g.cd8 = 2700000; // 45°
  g._3cd4 = 16200000; // 270°
  g._3cd8 = 8100000; // 135°
  g._5cd8 = 13500000; // 225°
  g._7cd8 = 18900000; // 315°
  return g;
}

function ref(g, name) {
  const v = g[name];
  if (typeof v === "number") return v;
  // Built-in angle constants: cd4=90°, 3cd4=270° (parseFloat would mis-parse the numeric prefix)
  const m = /^(\d+)cd(\d+)$/.exec(name);
  if (m) return (Number(m[1]) * 21600000) / Number(m[2]);
  const n = parseFloat(name);
  return Number.isFinite(n) ? n : 0;
}

/** Angle (60000ths of a degree) -> radians. */
function rad(angle60000) {
  return (angle60000 / DEG) * (Math.PI / 180);
}

/** Evaluate a single formula per ECMA-376 semantics. Ops are listed in the file header; angles are always 60000ths of a degree. */
function evalFormula(op, args, g) {
  const x = ref(g, args[0]);
  const y = args[1] != null ? ref(g, args[1]) : 0;
  const z = args[2] != null ? ref(g, args[2]) : 0;
  switch (op) {
    case "val": return x;
    case "*/": return (x * y) / z; // */ a b c = a*b/c
    case "+-": return x + y - z;
    case "+/": return (x + y) / z;
    case "?:": return x > 0 ? y : z;
    case "abs": return Math.abs(x);
    case "at2": return Math.atan2(y, x) * (180 / Math.PI) * DEG; // at2 a b = angle atan2(b, a) (OOXML argument order x,y; ECMA-376 defines at2(x,y)=atan2(y,x))
    case "atan2": return Math.atan2(y, x) * (180 / Math.PI) * DEG; // alias
    case "cat2": return x * Math.cos(Math.atan2(z, y)); // cat2 x y z = x·cos(atan2(z,y))
    case "cos": return x * Math.cos(rad(y));
    case "max": return Math.max(x, y);
    case "min": return Math.min(x, y);
    case "mod": return Math.sqrt(x * x + y * y + z * z);
    case "pin": return y < x ? x : y > z ? z : y; // pin x y z = clamp y into [x, z]
    case "sat2": return x * Math.sin(Math.atan2(z, y)); // sat2 x y z = x·sin(atan2(z,y))
    case "sin": return x * Math.sin(rad(y));
    case "sqrt": return Math.sqrt(x);
    case "tan": return x * Math.tan(rad(y));
    default:
      console.warn(`[preset-geometry] 未知公式 op: ${op}`);
      return 0;
  }
}

/**
 * Shape -> list of SVG d strings for all its paths (coordinates relative to 0,0 - w,h).
 * Returns [{ d, fill, stroke }]: fill is the shape fill color ('none' means no fill);
 * lighten/darken shading faces are colored by the caller; stroke says whether the path
 * takes part in the stroke.
 * @param {string} shapeName prstGeom name (must exist in PRESET_SHAPES)
 * @param {number} w shape width (px)
 * @param {number} h shape height (px)
 * @param {Array<number>} [adjustments] adjustment values (in adjNames order; defaults to the spec default)
 * @returns {Array<{d: string, fill: string|null, stroke: boolean}>|null}
 */
export function shapePaths(shapeName, w, h, adjustments) {
  const def = PRESET_SHAPES[shapeName];
  if (!def) return null;
  const g = baseGuides(w, h);
  const adj = Array.isArray(adjustments) && adjustments.length ? adjustments : def.adjDefault;
  def.adjNames.forEach((name, i) => {
    const v = adj[i];
    g[name] = typeof v === "number" ? v : def.adjDefault[i];
  });
  for (const [name, op, args] of def.guides) g[name] = evalFormula(op, args, g);
  const out = [];
  for (const [fillFlag, stroke, viewBox, cmds] of def.paths) {
    const d = buildPathD(cmds, g, viewBox, w, h);
    if (d) out.push({ d, fill: fillFlag, stroke });
  }
  return out;
}

function buildPathD(cmds, g, viewBox, w, h) {
  const sx = viewBox ? w / viewBox[0] : 1;
  const sy = viewBox ? h / viewBox[1] : 1;
  const px = (v) => Math.round(ref(g, v) * sx * 100) / 100;
  const py = (v) => Math.round(ref(g, v) * sy * 100) / 100;
  let d = "";
  let cx = 0;
  let cy = 0;
  for (const cmd of cmds) {
    switch (cmd[0]) {
      case "M":
      case "L": {
        cx = px(cmd[1]);
        cy = py(cmd[2]);
        d += `${cmd[0]}${cx},${cy}`;
        break;
      }
      case "C": {
        const pts = [];
        for (let i = 1; i < cmd.length; i += 2) {
          pts.push(`${px(cmd[i])},${py(cmd[i + 1])}`);
        }
        const last = pts[pts.length - 1].split(",");
        cx = Number(last[0]);
        cy = Number(last[1]);
        d += `C${pts.join(" ")}`;
        break;
      }
      case "Q": {
        const pts = [];
        for (let i = 1; i < cmd.length; i += 2) {
          pts.push(`${px(cmd[i])},${py(cmd[i + 1])}`);
        }
        const last = pts[pts.length - 1].split(",");
        cx = Number(last[0]);
        cy = Number(last[1]);
        d += `Q${pts.join(" ")}`;
        break;
      }
      case "A": {
        // arcTo wR hR stAng swAng: the current point is the arc start; the center is start - (wR·cos(st), hR·sin(st))
        const wR = Math.abs(px(cmd[1]));
        const hR = Math.abs(py(cmd[2]));
        const st = ref(g, cmd[3]);
        const sw = ref(g, cmd[4]);
        const centerX = cx - wR * Math.cos(rad(st));
        const centerY = cy - hR * Math.sin(rad(st));
        const end = st + sw;
        const ex = centerX + wR * Math.cos(rad(end));
        const ey = centerY + hR * Math.sin(rad(end));
        const largeArc = Math.abs(sw) > 10800000 ? 1 : 0;
        const sweep = sw >= 0 ? 1 : 0;
        cx = Math.round(ex * 100) / 100;
        cy = Math.round(ey * 100) / 100;
        d += `A${Math.round(wR * 100) / 100},${Math.round(hR * 100) / 100} 0 ${largeArc} ${sweep} ${cx},${cy}`;
        break;
      }
      case "Z":
        d += "Z";
        break;
      default:
        console.warn(`[preset-geometry] 未知路径命令: ${cmd[0]}`);
    }
  }
  return d;
}

/** Menu/panel thumbnail icon: evaluated at 24×24 with default adjustments (stroke style). */
export function shapeMenuIcon(shapeName, { size = 24, pad = 2 } = {}) {
  const paths = shapePaths(shapeName, size, size);
  if (!paths) return "";
  const body = paths
    .map((p) => {
      const fill = p.fill === "none" ? 'fill="none"' : 'fill="currentColor" fill-opacity="0.18"';
      return `<path d="${p.d}" ${fill}/>`;
    })
    .join("");
  return `<svg viewBox="${-pad} ${-pad} ${size + pad * 2} ${size + pad * 2}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}
