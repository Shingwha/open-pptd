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
