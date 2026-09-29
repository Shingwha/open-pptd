// ============================================================================
// interaction/arrange.js — 排列算法（对齐 / 分布 / 组展开位移）
// ----------------------------------------------------------------------------
// 属性面板（U1 对齐语义二义化）与右键菜单「对齐到选区 ▸ / 水平分布 / 垂直分布」
// 共用同一份算法，避免两处漂移：
//   单选 → 相对页面（PAGE_WIDTH/HEIGHT）
//   多选 → 相对选区包围盒
// 组元素（elementType:"group"）随 children 一起位移。
// ============================================================================

import { PAGE_HEIGHT, PAGE_WIDTH } from "../../packages/model/index.js";

/** 组元素组成员（非组返回空）。list = 当前页元素数组。 */
function groupMembers(el, list) {
  if (el?.elementType !== "group" || !Array.isArray(el.children)) return [];
  return el.children.map((id) => list.find((e) => e.elementId === id)).filter(Boolean);
}

/** 位移元素（含组成员）。 */
export function translate(el, dx, dy, list) {
  el.bounds[0] += dx;
  el.bounds[1] += dy;
  for (const m of groupMembers(el, list)) translate(m, dx, dy, list);
}

/** 选中集合的包围盒 [x, y, w, h]。 */
function unionBounds(els) {
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const el of els) {
    const b = el.bounds;
    x1 = Math.min(x1, b[0]);
    y1 = Math.min(y1, b[1]);
    x2 = Math.max(x2, b[0] + b[2]);
    y2 = Math.max(y2, b[1] + b[3]);
  }
  return [x1, y1, x2 - x1, y2 - y1];
}

/** 六向对齐（mode: left/hcenter/right/top/vcenter/bottom）。 */
export function alignSelection(els, mode, list) {
  const ref = els.length > 1 ? unionBounds(els) : [0, 0, PAGE_WIDTH, PAGE_HEIGHT];
  for (const el of els) {
    const [bx, by, bw, bh] = el.bounds;
    let dx = 0;
    let dy = 0;
    if (mode === "left") dx = ref[0] - bx;
    else if (mode === "hcenter") dx = Math.round(ref[0] + (ref[2] - bw) / 2) - bx;
    else if (mode === "right") dx = ref[0] + ref[2] - bw - bx;
    else if (mode === "top") dy = ref[1] - by;
    else if (mode === "vcenter") dy = Math.round(ref[1] + (ref[3] - bh) / 2) - by;
    else if (mode === "bottom") dy = ref[1] + ref[3] - bh - by;
    translate(el, dx, dy, list);
  }
}

/** 分布（多选 ≥3）：axis "h" 水平 / "v" 垂直，两端元素不动。 */
export function distribute(els, axis, list) {
  if (els.length < 3) return;
  const size = axis === "h" ? 2 : 3;
  const start = axis === "h" ? 0 : 1;
  const sorted = [...els].sort((a, b) => a.bounds[start] + a.bounds[size] / 2 - (b.bounds[start] + b.bounds[size] / 2));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const spanStart = first.bounds[start];
  const spanEnd = last.bounds[start] + last.bounds[size];
  const totalSize = sorted.reduce((s, e) => s + e.bounds[size], 0);
  const gap = (spanEnd - spanStart - totalSize) / (sorted.length - 1);
  // 元素总宽超过两端跨度（gap 为负）时不动：继续按负间距重排会把元素叠在一起，
  // 视觉上是破坏性结果（PowerPoint 也会拒绝这种分布）
  if (gap < 0) return;
  let cursor = spanStart + first.bounds[size];
  for (let i = 1; i < sorted.length - 1; i += 1) {
    const el = sorted[i];
    const target = Math.round(cursor + gap);
    const d = target - el.bounds[start];
    if (axis === "h") translate(el, d, 0, list);
    else translate(el, 0, d, list);
    cursor = target + el.bounds[size];
  }
}

/** 对齐模式（右键菜单二级菜单用；glyph 与属性面板按钮一致）。 */
export const ALIGN_MODES = [
  ["left", "←", "左对齐"],
  ["hcenter", "↔", "水平居中"],
  ["right", "→", "右对齐"],
  ["top", "↑", "顶对齐"],
  ["vcenter", "↕", "垂直居中"],
  ["bottom", "↓", "底对齐"],
];
