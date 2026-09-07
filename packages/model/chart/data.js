// ============================================================================
// model/chart/data.js — ChartData 表格工具（xlsx 嵌入与数据编辑器共用）
// ============================================================================

/** 图表数据 → xlsx 表格布局（行：表头 + 数据）。 */
export function chartDataTable(el) {
  const data = el.data || { cols: [], rows: [] };
  const cols = data.cols || [];
  const table = [cols.slice()];
  for (const row of data.rows || []) {
    table.push(cols.map((_, i) => row[i] ?? null));
  }
  return table;
}

/** 判断某列是否为数值列（供数据编辑器与导出用）。 */
export function isNumericColumn(table, colIdx) {
  for (let r = 1; r < table.length; r++) {
    const v = table[r][colIdx];
    if (v != null && v !== "") return typeof v === "number" || !isNaN(Number(v));
  }
  return true;
}
