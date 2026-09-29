// ============================================================================
// tests/regression/line.mjs — line export regression (multi-point curve xfrm + smooth last anchor)
// ----------------------------------------------------------------------------
// Covers:
//   1. smoothSegments pure function (n=3..8, including the n ≡ 2 (mod 3) lone last-anchor case)
//   2. Multi-point curves (smooth/sharp/round) must emit a:xfrm (off/ext = bounds);
//      a missing xfrm makes the line invisible / breaks the whole page in PowerPoint
//   3. smooth curve at n=5 must not drop the last anchor (it used to be silently dropped,
//      leaving the curve headless)
//   4. 2-point straight lines still use straightConnector1 + rotation (no regression)
// Usage: node tests/regression/line.mjs
// ============================================================================

import { smoothSegments } from "../../packages/model/geometry.js";
import { lineXml } from "../../packages/writer/line.js";

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
  // Horizontal: off must equal P0's absolute coordinate (a relative-coordinate bug drew to the top-left)
  const xml = lineXml(theme, line("0,1 420,1", "round", [60, 240, 420, 2], [420, 2]), ctx);
  ok(xml.includes('prst="straightConnector1"'), "2 点直线：仍走 straightConnector1");
  ok(xml.includes('<a:off x="762000" y="3060700"/>'), "水平线：off = P0 绝对坐标 (60,241) EMU（不再画到左上角）");
  ok(xml.includes('<a:ext cx="5334000" cy="0"/>'), "水平线：ext = 线长 (420,0) EMU");
  ok(xml.includes('rot="0"'), "水平线：rot=0");
  endpointCheck(xml, [60, 241], [480, 241], "水平线");
}
{
  // Vertical: 90° rotation, off shifts up by half the length
  const xml = lineXml(theme, line("1,0 1,160", "round", [60, 300, 2, 160], [2, 160]), ctx);
  ok(xml.includes('<a:off x="-241300" y="4826000"/>'), "垂直线：off = (−19, 380) EMU（精确反推）");
  ok(xml.includes('rot="5400000"'), "垂直线：rot=90°");
  endpointCheck(xml, [61, 300], [61, 460], "垂直线");
}
{
  // Diagonal (down-right)
  const xml = lineXml(theme, line("0,0 180,60", "round", [112, 160, 180, 60], [180, 60]), ctx);
  endpointCheck(xml, [112, 160], [292, 220], "斜线右下");
}
{
  // Up-left diagonal (formerly the flipH branch; angles are normalized now, no flipH)
  const xml = lineXml(theme, line("200,0 0,120", "round", [500, 100, 200, 120], [200, 120]), ctx);
  ok(!xml.includes("flipH"), "左上斜线：不再输出 flipH");
  endpointCheck(xml, [700, 100], [500, 220], "斜线左上");
}
{
  // Arrow end must survive, endpoints still correct
  const xml = lineXml(theme, line("0,1 420,1", "round", [60, 240, 420, 2], [420, 2], { arrow: [null, "arrow"] }), ctx);
  ok(xml.includes("<a:tailEnd"), "2 点直线：箭头 tailEnd 保留");
  ok(!xml.includes("flipH"), "带箭头直线：无 flipH");
  endpointCheck(xml, [60, 241], [480, 241], "带箭头水平线");
}

console.log(`\n结果: ${pass}/${pass + fail} 通过`);
process.exit(fail ? 1 : 0);
