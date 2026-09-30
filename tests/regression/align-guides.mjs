// ============================================================================
// tests/regression/align-guides.mjs — smart alignment snap math (pure)
// ----------------------------------------------------------------------------
// The PowerPoint-style drag/resize guides must snap the nearest candidate within
// a threshold and report exactly the matched guide lines. Cases: page center/
// edge, other-element edges/centers, nearest-wins, beyond-threshold no-op,
// resize moving-edge semantics (e/w/s/n), empty target set.
// ============================================================================

import { snapMove, snapResize, SNAP_SCREEN_PX } from "../../editor/interaction/align-guides.js";

let ok = true;
function check(name, cond, detail = "") {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) ok = false;
}
function eq(a, b) { return Math.abs(a - b) < 1e-9; }

const page = { w: 960, h: 540 };
const TH = 5; // deck px threshold for these tests

// --- move: center snapped to the page center --------------------------------
{
  const r = snapMove({ x: 477, y: 100, w: 10, h: 10 }, [], page, TH);
  // center x = 482, two off from the page center 480 — nearest candidate wins over the 477→480 edge
  check("拖动吸页面水平中线", eq(r.dx, -2) && eq(r.dy, 0));
  check("中线参考线一条", r.guides.length === 1 && r.guides[0].axis === "x" && eq(r.guides[0].pos, 480));
}
// --- move: left edge snapped to another element's left edge -----------------
{
  const others = [{ x: 100, y: 300, w: 50, h: 40 }];
  // w=26 keeps the rect center/right clear of the other's center (125): only left-edge→100 is in range
  const r = snapMove({ x: 103, y: 100, w: 26, h: 20 }, others, page, TH);
  check("拖动吸其他元素左边", eq(r.dx, -3) && eq(r.dy, 0));
}
// --- move: right edge to other right edge, both axes at once ----------------
{
  const others = [{ x: 700, y: 200, w: 100, h: 80 }];
  // right edge 795 vs other right 800 (d=5, in); bottom 118 vs other bottom 280 — no
  const r = snapMove({ x: 775, y: 100, w: 20, h: 18 }, others, page, TH);
  check("右边缘吸其他右边缘（阈值边界含等号）", eq(r.dx, 5));
}
// --- move: nearest candidate wins --------------------------------------------
{
  const others = [{ x: 100, y: 0, w: 10, h: 10 }, { x: 104, y: 0, w: 10, h: 10 }];
  // left 198: candidates 100 (d=-98), 105 (d=-93), 110 (d=-88), 104 (d=-94), 109, 114, 200? none within TH
  // use a rect whose left is 3px from 105 and 7px from 100 — but both must be ≤ TH to test nearest
  const r = snapMove({ x: 102, y: 400, w: 30, h: 20 }, others, page, TH);
  // left 102: to 100 → -2 (|2|≤5), to 105 → +3 (|3|≤5), nearest is -2
  check("最近候选胜出", eq(r.dx, -2), JSON.stringify(r));
}
// --- move: beyond threshold → no snap, no guide ------------------------------
{
  const r = snapMove({ x: 120, y: 400, w: 20, h: 20 }, [{ x: 100, y: 0, w: 10, h: 10 }], page, TH);
  check("超阈值不吸", eq(r.dx, 0) && eq(r.dy, 0) && r.guides.length === 0);
}
// --- move: vertical center to other vertical center --------------------------
{
  const others = [{ x: 300, y: 208, w: 100, h: 60 }];
  // rect cy = 100+10=110? use cy near other cy=238: rect y=225 h=20 → cy=235, d=3
  const r = snapMove({ x: 600, y: 225, w: 20, h: 20 }, others, page, TH);
  check("垂直中线吸其他垂直中线", eq(r.dy, 3) && r.guides.some((g) => g.axis === "y" && eq(g.pos, 238)));
}
// --- resize: east edge snaps --------------------------------------------------
{
  const r = snapResize({ x: 100, y: 100, w: 377, h: 50 }, { x: "e", y: null }, [], page, TH);
  check("缩放宽 477→480 吸中线", eq(r.dx, 3) && r.guides.length === 1 && eq(r.guides[0].pos, 480));
}
// --- resize: west edge moves left/right with x compensation -------------------
{
  const r = snapResize({ x: 103, y: 100, w: 50, h: 50 }, { x: "w", y: null }, [{ x: 100, y: 0, w: 40, h: 10 }], page, TH);
  check("缩放西边吸 100：dx=-3", eq(r.dx, -3));
  // caller contract: nx += dx, nw -= dx → left lands on 100, right edge unchanged
  const nx = 103 + r.dx;
  const nw = 50 - r.dx;
  check("缩放西边补偿后右边不动", eq(nx, 100) && eq(nx + nw, 153));
}
// --- resize: only moving edges participate ------------------------------------
{
  // already-coincident edges emit a zero-delta guide (aligned), so offset the target out of range
  const others = [{ x: 300, y: 300, w: 50, h: 40 }];
  const r = snapResize({ x: 100, y: 100, w: 50, h: 50 }, { x: "e", y: "n" }, others, page, TH);
  check("非移动边/超阈值不参与", r.guides.length === 0 && eq(r.dx, 0) && eq(r.dy, 0));
  // coincident edge: zero delta but the guide shows (PowerPoint behavior)
  const r2 = snapResize({ x: 100, y: 100, w: 50, h: 50 }, { x: "e", y: null }, [{ x: 100, y: 300, w: 50, h: 40 }], page, TH);
  check("已对齐边显示零位移参考线", eq(r2.dx, 0) && r2.guides.length === 1 && eq(r2.guides[0].pos, 150));
}
// --- resize: north edge snaps to page top ------------------------------------
{
  const r = snapResize({ x: 100, y: 3, w: 50, h: 50 }, { x: null, y: "n" }, [], page, TH);
  check("缩放北边吸页面顶", eq(r.dy, -3) && r.guides.some((g) => g.axis === "y" && eq(g.pos, 0)));
}
// --- passive axis does not participate (zero-delta guide noise on a shared margin) ---
{
  const others = [{ x: 560, y: 200, w: 100, h: 40 }];
  // vertical-only drag (axes.x passive): the dragged left edge coincides with the other's
  // left edge (560) but must NOT draw a guide; y snaps to the page center
  const r = snapMove({ x: 560, y: 260, w: 20, h: 10 }, others, page, TH, { x: false, y: true });
  check("被动轴零位移不画线", r.guides.every((g) => g.axis === "y") && eq(r.dx, 0));
}
// --- exported screen threshold is a positive constant -------------------------
check("屏幕阈值常量", Number.isFinite(SNAP_SCREEN_PX) && SNAP_SCREEN_PX > 0);

process.exit(ok ? 0 : 1);
