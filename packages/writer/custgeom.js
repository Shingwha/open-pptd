// ============================================================================
// writer/custgeom.js — 自定义路径（SVG path）→ a:custGeom（OOXML 自定义几何）
// ----------------------------------------------------------------------------
// PPTD shapeName:"custom" + viewBox + path（M/L/H/V/C/S/Q/A/Z）→ PowerPoint
// 官方存储结构：a:path 用 viewBox 作为几何坐标系（w/h 属性），a:rect 框住
// 整个几何 → PowerPoint 把该坐标系拉伸到形状 bounds（与预览一致）。
//
// 圆弧转换：SVG A（端点参数化）→ OOXML arcTo（圆心参数化），旋转角为 0 时
// 直接输出 arcTo；旋转角非 0 时降级为三次贝塞尔近似（arcTo 不支持旋转椭圆）。
// 镂空：SVG 非零环绕规则与 PowerPoint 一致，内外环方向相反即镂空，原样透传。
// ============================================================================

import { el } from "./xml.js";

const DEG = 60000; // OOXML 角度单位：60000 = 1°

/** 数值 → 整数（OOXML pt/角度取整）。 */
const n = (v) => Math.round(v);

/**
 * SVG path 命令流 → OOXML pathLst 片段（含 a:path 包裹）。
 * @param {Array<number>} viewBox [w, h]
 * @param {string} d SVG path d 字符串
 * @returns {string} a:pathLst XML
 */
export function svgPathToOoxml(viewBox, d) {
  const [vw, vh] = viewBox || [21600, 21600];
  const cmds = parseSvgPath(d);
  if (!cmds.length) return "";

  let cx = 0; // 当前点
  let cy = 0;
  let sx = 0; // 子路径起点
  let sy = 0;
  let lastCmd = "";
  let lastCtrl = null; // 上一个 S/T 反射控制点 [x, y]

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
        // 反射上一个 C 的第二控制点；无则用当前点
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
        // 近重合端点 = 整圆（官方示例 M500,0 A500,500 0 1 1 499,0）：拆两段 180° 弧
        // 旋转角非 0 → 三次贝塞尔近似（arcTo 不支持旋转椭圆）
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

/** 完整 a:custGeom（自定义形状几何；无调整值/手柄/连接点）。 */
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

/** 反射控制点：p' = 2·当前点 − 控制点。 */
function reflect(ctrl, cx, cy) {
  return [2 * cx - ctrl[0], 2 * cy - ctrl[1]];
}

function ptCmd(tag, x, y) {
  return el(`a:${tag}`, {}, el("a:pt", { x: n(x), y: n(y) }));
}

/**
 * 弧 → 子弧列表：近重合端点（整圆，官方镂空示例用法）拆成两段 180° 弧；
 * 其余原样返回。整圆的 stAng 取 0（当前点即角度 0 位置），方向随 sweep 保持
 * （外环顺时针 / 内环逆时针 → PowerPoint 非零环绕镂空）。
 */
export function splitArc(x0, y0, rx, ry, rotDeg, largeArc, sweep, x1, y1) {
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  if (rx === 0 || ry === 0) return [];
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const nearFull = dist < Math.max(rx, ry) * 0.005; // 端点重合/近重合
  if (!nearFull) {
    return [{ x0, y0, rx, ry, rot: rotDeg, largeArc, sweep, x1, y1 }];
  }
  if (!largeArc) return []; // 近重合 + 非大弧 = 微小弧（SVG 语义：近省略），不输出
  // 整圆拆两段半弧：段1 st=0→±180°，段2 st=±180°→±360°（端点在椭圆上）
  const dir = sweep ? 1 : -1;
  const midX = x0 - 2 * rx * Math.cos((rotDeg * Math.PI) / 180);
  const midY = y0 - 2 * rx * Math.sin((rotDeg * Math.PI) / 180);
  return [
    { x0, y0, rx, ry, rot: rotDeg, largeArc: 0, sweep, x1: midX, y1: midY },
    { x0: midX, y0: midY, rx, ry, rot: rotDeg, largeArc: 0, sweep, x1: x0, y1: y0 },
  ];
}

/**
 * SVG A 命令（端点参数化）→ OOXML arcTo（圆心参数化）。
 * 旋转角为 0 时精确转换（W3C SVG 附录 F.6.5）；非 0 时返回 null（调用方降级贝塞尔）。
 */
export function svgArcToOoxml(x0, y0, rx, ry, rotDeg, largeArc, sweep, x1, y1) {
  const c = svgArcCenter(x0, y0, rx, ry, rotDeg, largeArc, sweep, x1, y1);
  if (!c || rotDeg % 360 !== 0) return null;
  return {
    wR: c.rx,
    hR: c.ry,
    stAng: c.theta1 * (180 / Math.PI) * DEG,
    swAng: c.dTheta * (180 / Math.PI) * DEG,
  };
}

/**
 * 圆心参数化（W3C SVG 附录 F.6.5，含半径修正），对任意旋转角有效。
 * 返回 { cx, cy, rx, ry, theta1, dTheta }；退化（半径 0 / 端点重合且非整圆）返回 null。
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

/** 旋转椭圆上的点（θ 弧度，含旋转 φ）。 */
function arcPoint(c, theta, phiDeg) {
  const phi = ((phiDeg % 360) * Math.PI) / 180;
  const ct = Math.cos(theta);
  const st = Math.sin(theta);
  return [
    c.cx + c.rx * ct * Math.cos(phi) - c.ry * st * Math.sin(phi),
    c.cy + c.rx * ct * Math.sin(phi) + c.ry * st * Math.cos(phi),
  ];
}

/** 弧（旋转非 0 时）→ 三次贝塞尔近似段列表 [{c1, c2, p}]。 */
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
    // 椭圆弧切线方向（局部坐标系求导后旋转回原系）
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
// SVG path 解析（支持 M/L/H/V/C/S/Q/T/A/Z，绝对/相对，含隐式重复命令）
// ---------------------------------------------------------------------------
const CMD_RE = /[MmLlHhVvCcSsQqTtAaZz]/;

/**
 * 解析 SVG path d → 命令流 [[op, args], …]（op 大写绝对命令，坐标已换算为绝对）。
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
      cmd = lastCmd; // 隐式重复上一命令（坐标沿用上一段的参数个数）
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
    if (consumed < argCount) break; // 参数不足，截断
    if (op === "Z") {
      cmds.push(["Z", []]);
      cur = start;
      lastCmd = "";
      ctrl = null;
      continue;
    }
    // 展开为绝对坐标（A 的 rx/ry/rot/largeArc/sweep 不动，xy 需换算）
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
        lastCmd = "L"; // M 后隐式命令为 L
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
