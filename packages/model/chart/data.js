// ============================================================================
// model/chart/data.js — ChartData table utilities (shared by xlsx embed and the data editor)
// ============================================================================

/** Chart data -> xlsx table layout (rows: header + data). */
export function chartDataTable(el) {
  const data = el.data || { cols: [], rows: [] };
  const cols = data.cols || [];
  const table = [cols.slice()];
  for (const row of data.rows || []) {
    table.push(cols.map((_, i) => row[i] ?? null));
  }
  return table;
}

/** Test whether a column is numeric (used by the data editor and export). */
export function isNumericColumn(table, colIdx) {
  for (let r = 1; r < table.length; r++) {
    const v = table[r][colIdx];
    if (v != null && v !== "") return typeof v === "number" || !isNaN(Number(v));
  }
  return true;
}

/** 0-based column index -> Excel column letter (A B … Z AA AB; shared by xlsx references and the chart editor grid). */
export function colLetter(n) {
  let s = "";
  n += 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
