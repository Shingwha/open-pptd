// ============================================================================
// model/chart/tree.js — treemap/sunburst 父子表 → 树解析（唯一实现）
// ----------------------------------------------------------------------------
// ECharts 预览（option/matrix.js 嵌套投影）与 chartEx 导出（writer/chart/
// chartex.js 叶子路径行投影）共用同一套节点解析 / 子树求和 / levels 裁剪语义。
// ============================================================================

/**
 * 解析父子表为森林。
 * @returns {{nodes, childrenOf, roots, subtreeSum}} nodes: 名 → {name,value,parent}；
 *   childrenOf: 名 → 子节点数组；roots: 父缺失/为空的节点（出现顺序）；
 *   subtreeSum(node): 叶子 = 数值化 value（非法计 0），中间节点 = 子节点和。
 */
export function parseHierarchy(el, s) {
  const rows = el.data?.rows || [];
  const catCol = s._cols.category;
  const valCol = s._cols.value;
  const parentCol = s._cols.parent;
  const nodes = new Map();
  const childrenOf = new Map();
  const roots = [];
  for (const r of rows) {
    const name = String(r[catCol] ?? "").trim();
    if (!name) continue;
    nodes.set(name, { name, value: r[valCol] ?? null, parent: parentCol != null ? r[parentCol] : null });
    if (!childrenOf.has(name)) childrenOf.set(name, []);
  }
  for (const node of nodes.values()) {
    const p = node.parent == null || node.parent === "" ? null : String(node.parent);
    if (p == null || !nodes.has(p)) roots.push(node);
    else childrenOf.get(p).push(node);
  }
  const sumCache = new Map();
  const subtreeSum = (node) => {
    if (sumCache.has(node.name)) return sumCache.get(node.name);
    const kids = childrenOf.get(node.name) || [];
    const v = kids.length === 0
      ? (Number.isFinite(Number(node.value)) ? Number(node.value) : 0)
      : kids.reduce((acc, k) => acc + subtreeSum(k), 0);
    sumCache.set(node.name, v);
    return v;
  };
  return { nodes, childrenOf, roots, subtreeSum };
}

/** series.levels → 显示层级数上限（非数值/非正 = 不限，null）。 */
export function resolveTreeLevels(s) {
  return Number.isFinite(s.levels) && s.levels > 0 ? Math.floor(s.levels) : null;
}
