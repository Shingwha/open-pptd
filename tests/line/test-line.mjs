// ============================================================================
// tests/line/test-line.mjs — 线条导出回归（多点曲线 xfrm + smooth 末锚点）
// ----------------------------------------------------------------------------
// 覆盖：
//   1. smoothSegments 分段纯函数（n=3..8，含 n ≡ 2 (mod 3) 的孤立末锚点场景）
//   2. 多点曲线（smooth/sharp/round）导出必须带 a:xfrm（off/ext = bounds），
//      此前缺失 xfrm 导致 PowerPoint 中线条不可见/整页异常
//   3. smooth 曲线在 n=5 时末锚点不得丢失（此前被静默丢弃，曲线断头）
//   4. 2 点直线仍走 straightConnector1 + 旋转（不回归）
// 运行：node tests/line/test-line.mjs
// ============================================================================

import { smoothSegments } from "../../editor/core/geometry.js";
import { lineXml } from "../../editor/writer/line.js";

let pass = 0, fail = 0;
const ok = (cond, msg) => {
  if (cond) { pass++; console.log(`  ✓ ${msg}`); }
  else { fail++; console.error(`  ✗ ${msg}`); }
};

const theme = { colors: {} };
let id = 100;
const ctx = { nextId: () => ++id };

const line = (points, curve = "smooth", bounds = [60, 80, 420, 120], viewBox = [420, 120], extra = {}) => ({
  elementId: "l-test",
  elementType: "line",
  bounds,
  viewBox,
  points,
  curve,
  border: { style: "solid", width: 2, color: "#4C9A63" },
  ...extra,
});

console.log("== 1. smoothSegments 分段纯函数（n=3..8）==");
const segExpect = {
  3: ["Q"], 4: ["C"], 5: ["C", "L"], 6: ["C", "Q"], 7: ["C", "C"], 8: ["C", "C", "L"],
};
for (const [nStr, expect] of Object.entries(segExpect)) {
  const n = +nStr;
  const rel = Array.from({ length: n }, (_, k) => [k * 10, k * 5]);
  const segs = smoothSegments(rel);
  ok(
    JSON.stringify(segs.map((s) => s.cmd)) === JSON.stringify(expect),
    `n=${n} 分段 ${segs.map((s) => s.cmd).join("+")}（期望 ${expect.join("+")}）`
  );
  const lastSeg = segs[segs.length - 1];
  const lastPt = lastSeg.pts[lastSeg.pts.length - 1];
  ok(
    lastPt[0] === rel[n - 1][0] && lastPt[1] === rel[n - 1][1],
    `n=${n} 末段以 ${lastSeg.cmd} 收于末锚点 (${lastPt[0]},${lastPt[1]})`
  );
}

console.log("== 2. 多点曲线导出：a:xfrm 必须存在（off/ext = bounds）==");
for (const curve of ["smooth", "sharp", "round"]) {
  const xml = lineXml(theme, line("0,120 90,20 190,100 300,20 420,90", curve), ctx);
  ok(xml.includes("<a:xfrm>"), `${curve} 折线/曲线：包含 a:xfrm`);
  ok(xml.includes('<a:off x="762000" y="1016000"/>'), `${curve}：off = bounds 左上角 (60,80) EMU`);
  ok(xml.includes('<a:ext cx="5334000" cy="1524000"/>'), `${curve}：ext = bounds 尺寸 (420,120) EMU`);
}

console.log("== 3. smooth 曲线末锚点（回归：n=5 此前断头）==");
{
  const xml = lineXml(theme, line("0,120 90,20 190,100 300,20 420,90", "smooth"), ctx);
  ok(xml.includes("<a:cubicBezTo>"), "n=5：含 C 段");
  ok(xml.includes("<a:lnTo>"), "n=5：孤立末锚点以 lnTo 直线收尾");
  const lnIdx = xml.indexOf("<a:lnTo>");
  const lastPtIdx = xml.indexOf('<a:pt x="420" y="90"/>');
  ok(lnIdx !== -1 && lastPtIdx !== -1 && lnIdx < lastPtIdx, "n=5：末锚点 (420,90) 由 lnTo 收尾（不再丢失）");
}
{
  const xml = lineXml(theme, line("0,100 190,0 380,100", "smooth"), ctx);
  ok(xml.includes("<a:quadBezTo>"), "n=3：二次贝塞尔（Q 段）");
  const qIdx = xml.indexOf("<a:quadBezTo>");
  const lastPtIdx = xml.indexOf('<a:pt x="380" y="100"/>');
  ok(qIdx !== -1 && lastPtIdx !== -1 && qIdx < lastPtIdx, "n=3：末锚点 (380,100) 由 Q 段收尾");
}

console.log("== 4. 直线端点位置（off 反推：旋转后端点必须精确落在 P0/P1）==");
function parseXfrm(xml) {
  const off = xml.match(/<a:off x="(-?\d+)" y="(-?\d+)"/);
  const ext = xml.match(/<a:ext cx="(-?\d+)" cy="(-?\d+)"/);
  const rot = xml.match(/rot="(-?\d+)"/);
  return {
    ox: +off[1] / 12700,
    oy: +off[2] / 12700,
    len: +ext[1] / 12700,
    th: (+rot[1] / 60000) * (Math.PI / 180),
  };
}
function endpointCheck(xml, p0, p1, label) {
  const { ox, oy, len, th } = parseXfrm(xml);
  const cx = ox + len / 2;
  const cy = oy;
  const start = [cx - (len / 2) * Math.cos(th), cy - (len / 2) * Math.sin(th)];
  const end = [cx + (len / 2) * Math.cos(th), cy + (len / 2) * Math.sin(th)];
  const d1 = Math.hypot(start[0] - p0[0], start[1] - p0[1]);
  const d2 = Math.hypot(end[0] - p1[0], end[1] - p1[1]);
  ok(d1 < 1.5 && d2 < 1.5, `${label}：端点落在 P0/P1（偏差 ${d1.toFixed(2)} / ${d2.toFixed(2)} px）`);
  return d1 < 1.5 && d2 < 1.5;
}
{
  // 水平：off 必须等于 P0 绝对坐标（此前误用相对坐标导致画到左上角）
  const xml = lineXml(theme, line("0,1 420,1", "round", [60, 240, 420, 2], [420, 2]), ctx);
  ok(xml.includes('prst="straightConnector1"'), "2 点直线：仍走 straightConnector1");
  ok(xml.includes('<a:off x="762000" y="3060700"/>'), "水平线：off = P0 绝对坐标 (60,241) EMU（不再画到左上角）");
  ok(xml.includes('<a:ext cx="5334000" cy="0"/>'), "水平线：ext = 线长 (420,0) EMU");
  ok(xml.includes('rot="0"'), "水平线：rot=0");
  endpointCheck(xml, [60, 241], [480, 241], "水平线");
}
{
  // 垂直：90° 旋转，off 上移半长
  const xml = lineXml(theme, line("1,0 1,160", "round", [60, 300, 2, 160], [2, 160]), ctx);
  ok(xml.includes('<a:off x="-241300" y="4826000"/>'), "垂直线：off = (−19, 380) EMU（精确反推）");
  ok(xml.includes('rot="5400000"'), "垂直线：rot=90°");
  endpointCheck(xml, [61, 300], [61, 460], "垂直线");
}
{
  // 斜线（右下）
  const xml = lineXml(theme, line("0,0 180,60", "round", [112, 160, 180, 60], [180, 60]), ctx);
  endpointCheck(xml, [112, 160], [292, 220], "斜线右下");
}
{
  // 左上斜线（此前 flipH 分支；现归一化角度，无 flipH）
  const xml = lineXml(theme, line("200,0 0,120", "round", [500, 100, 200, 120], [200, 120]), ctx);
  ok(!xml.includes("flipH"), "左上斜线：不再输出 flipH");
  endpointCheck(xml, [700, 100], [500, 220], "斜线左上");
}
{
  // 箭头不回归 + 端点仍正确
  const xml = lineXml(theme, line("0,1 420,1", "round", [60, 240, 420, 2], [420, 2], { arrow: [null, "arrow"] }), ctx);
  ok(xml.includes("<a:tailEnd"), "2 点直线：箭头 tailEnd 保留");
  ok(!xml.includes("flipH"), "带箭头直线：无 flipH");
  endpointCheck(xml, [60, 241], [480, 241], "带箭头水平线");
}

console.log(`\n结果: ${pass}/${pass + fail} 通过`);
process.exit(fail ? 1 : 0);
