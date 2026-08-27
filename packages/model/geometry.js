// ============================================================================
// geometry.js — 坐标与几何换算（渲染器与 writer 共享，唯一实现）
// ============================================================================

/**
 * 解析 PPTD line points（viewBox 坐标 → bounds 内实际坐标）。
 * 渲染器（SVG）与 writer（OOXML 旋转计算）共用，避免两份实现漂移。
 * @param {string} pointsStr "0,1 816,1" 格式
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
 * smooth 贝塞尔分段：points 首尾为经过点，中间为控制点（渲染器与 writer 共享，唯一实现）。
 * 按「4 点一段」连续切分为三次贝塞尔；剩 1 控制点 + 末锚点时用二次贝塞尔收尾；
 * 若切分后恰余一个孤立末锚点（点数 n ≡ 2 mod 3，如 5/8/11…），以直线段收尾，
 * 保证末锚点必然被画到（此前该点会被静默丢弃，曲线断头）。
 * @param {Array<[number, number]>} rel 点序列（首尾为经过点，长度 ≥ 2）
 * @returns {Array<{cmd: "Q"|"C"|"L", pts: Array<[number, number]>}>}
 */
export function smoothSegments(rel) {
  const segs = [];
  const last = rel.length - 1;
  let i = 1;
  while (i < last) {
    const rest = last - i;
    if (rest === 1) {
      // 剩 1 个控制点 + 末锚点 → 二次贝塞尔收尾
      segs.push({ cmd: "Q", pts: [rel[i], rel[last]] });
      i += 2;
    } else {
      // 4 点一段：2 控制点 + 1 经过点
      segs.push({ cmd: "C", pts: [rel[i], rel[i + 1], rel[i + 2]] });
      i += 3;
    }
  }
  if (i === last) {
    // 孤立末锚点：直线段收尾，保证末锚点被消费
    segs.push({ cmd: "L", pts: [rel[last]] });
  }
  return segs;
}
