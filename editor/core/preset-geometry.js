// ============================================================================
// preset-geometry.js — ECMA-376 预置形状几何求值器（渲染侧：SVG path）
// ----------------------------------------------------------------------------
// 数据（preset-geometry.data.js）与 PowerPoint 的 prstGeom 同源（ECMA-376 附录），
// 预览 = 按规范公式求值出的路径；导出 = prstGeom 同名预设。二者几何一致。
//
// 支持公式 op：val */ +- +/ ?: abs atan2 cat2 cos max min mod pin sat2 sin sqrt tan
// 支持路径命令：moveTo / lnTo / cubicBezTo / close（arcTo/quadBezTo 暂未收录）
// ============================================================================

import { PRESET_SHAPES } from "./preset-geometry.data.js";

/** 角度单位：60000 = 1°。 */
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
  // 角度常量（arcTo 等使用）
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
  const n = parseFloat(name);
  return Number.isFinite(n) ? n : 0;
}

/** 按 ECMA-376 语义求单个公式。op 见文件头注释；角度一律 60000 分/度。 */
export function evalFormula(op, args, g) {
  const x = ref(g, args[0]);
  const y = args[1] != null ? ref(g, args[1]) : 0;
  const z = args[2] != null ? ref(g, args[2]) : 0;
  switch (op) {
    case "val": return x;
    case "*": // 兼容误写
    case "*/": return (x * y) / z; // */ a b c = a*b/c
    case "+-": return x + y - z;
    case "+/": return (x + y) / z;
    case "?:": return x > 0 ? y : z;
    case "abs": return Math.abs(x);
    case "atan2": return (Math.atan2(y, x) * 180) / Math.PI * DEG;
    case "cat2": return x * Math.cos((Math.atan2(y, z) * 180) / Math.PI / 180);
    case "cos": return x * Math.cos((y / DEG) * (Math.PI / 180));
    case "max": return Math.max(x, y);
    case "min": return Math.min(x, y);
    case "mod": return Math.sqrt(x * x + y * y + z * z);
    case "pin": return y < x ? x : y > z ? z : y; // pin x y z = y 夹在 [x, z]
    case "sat2": return x * Math.sin((Math.atan2(y, z) * 180) / Math.PI / 180);
    case "sin": return x * Math.sin((y / DEG) * (Math.PI / 180));
    case "sqrt": return Math.sqrt(x);
    case "tan": return x * Math.tan((y / DEG) * (Math.PI / 180));
    default:
      console.warn(`[preset-geometry] 未知公式 op: ${op}`);
      return 0;
  }
}

/**
 * 形状 → SVG path d 字符串（坐标基于 0,0 - w,h）。
 * @param {string} shapeName prstGeom 名（须在 PRESET_SHAPES 中）
 * @param {number} w 形状宽（px）
 * @param {number} h 形状高（px）
 * @param {Array<number>} [adjustments] 调整值（按 adjNames 顺序；缺省用规范默认）
 * @returns {string|null} SVG path d；未知形状返回 null
 */
export function shapePathD(shapeName, w, h, adjustments) {
  const def = PRESET_SHAPES[shapeName];
  if (!def) return null;
  const g = baseGuides(w, h);
  const adj = Array.isArray(adjustments) && adjustments.length ? adjustments : def.adjDefault;
  def.adjNames.forEach((name, i) => {
    const v = adj[i];
    g[name] = typeof v === "number" ? v : def.adjDefault[i];
  });
  for (const [name, op, args] of def.guides) g[name] = evalFormula(op, args, g);
  return buildPathD(def.path, g, def.pathViewBox, w, h);
}

function buildPathD(path, g, pathViewBox, w, h) {
  const sx = pathViewBox ? w / pathViewBox[0] : 1;
  const sy = pathViewBox ? h / pathViewBox[1] : 1;
  const px = (v) => Math.round(ref(g, v) * sx * 100) / 100;
  const py = (v) => Math.round(ref(g, v) * sy * 100) / 100;
  let d = "";
  for (const cmd of path) {
    switch (cmd[0]) {
      case "M":
      case "L": {
        d += `${cmd[0]}${px(cmd[1])},${py(cmd[2])}`;
        break;
      }
      case "C": {
        const pts = [];
        for (let i = 1; i < cmd.length; i += 2) {
          pts.push(`${px(cmd[i])},${py(cmd[i + 1])}`);
        }
        d += `C${pts.join(" ")}`;
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

/** 菜单/面板缩略图标：按 24×24 + 默认调整值求值。 */
export function shapeMenuIcon(shapeName, { size = 24, pad = 2 } = {}) {
  const d = shapePathD(shapeName, size, size);
  if (!d) return "";
  return `<svg viewBox="${-pad} ${-pad} ${size + pad * 2} ${size + pad * 2}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
}
