// ============================================================================
// model/chart/tree.js — treemap/sunburst parent-child table -> tree parsing (single implementation)
// ----------------------------------------------------------------------------
// The ECharts preview (nesting projection in option/matrix.js) and the chartEx export
// (leaf path/row projection in writer/chart/chartex.js) share the same node parsing,
// subtree summation and levels trimming semantics.
// ============================================================================

/**
 * Parse a parent-child table into a forest.
 * @returns {{nodes, childrenOf, roots, subtreeSum}} nodes: name -> {name,value,parent};
 *   childrenOf: name -> child array; roots: nodes whose parent is missing/empty (in
 *   appearance order); subtreeSum(node): a leaf is its numeric value (invalid counts as
 *   0), an intermediate node is the sum of its children.
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

/** series.levels -> displayed-level cap (non-numeric/non-positive = unlimited, null). */
export function resolveTreeLevels(s) {
  return Number.isFinite(s.levels) && s.levels > 0 ? Math.floor(s.levels) : null;
}
