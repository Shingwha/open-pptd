// ============================================================================
// model/table.js — table model (grid expansion / merge & split / size validation / layout)
// ----------------------------------------------------------------------------
// Official Cell rules (pptd.md Table/Cell):
//   - rows is a 2-D Cell array; merges declare rowSpan/colSpan and the covered
//     positions are simply omitted (no null placeholders), so expanding the grid
//     must consume cells row by row
//   - every entry of columnWidths/rowHeights is in [0,1] and the entries sum to 1
// Row height semantics (matching PowerPoint a:tr min-height behavior):
//   - row height = minimum row height: with no rowHeights -> readability floor
//     (header 30 / row 26); with rowHeights -> ratio × bounds height (never below
//     the floor)
//   - when content is taller than the minimum, the row grows automatically
//     (both preview tr and PowerPoint are min-height)
//   - no content estimation: formula/multi-line text height comes from each layout
//     engine (both sides use Cambria Math metrics)
// Shared by preview (renderer) and export (writer).
// ============================================================================

export const TABLE_FONT_SIZE = 13; // pt/px
export const TABLE_CELL_PAD = 5; // vertical padding (pt/px)
export const TABLE_CELL_PAD_X = 9; // horizontal padding
export const TABLE_MIN_ROW = 26; // row-height readability floor (pt/px)
export const TABLE_MIN_HEADER = 30; // header row-height floor (pt/px)

// ----------------------------------------------------------------------------
// Grid expansion and merging
// ----------------------------------------------------------------------------

/**
 * Expand rows (merge-omitting form) into a complete grid.
 * @param {Array} rows 2-D Cell array (positions covered by a merge are omitted)
 * @param {number|null} colCount grid column count (from columnWidths.length); when
 *   null it is inferred from the accumulated colSpan per row (if a merged row is
 *   shorter, the value comes from non-merged rows).
 * @returns {{ grid: Array<Array<{cell: object|null, covered: boolean, r: number, c: number, owner: object|null}>>,
 *             colCount: number }}
 *   cell=null and covered=true: covered by a merge (placeholder, not editable);
 *   cell=null and covered=false: empty slot because the row has too few cells (editable).
 */
export function tableGrid(rows, colCount) {
  const list = Array.isArray(rows) ? rows : [];
  const cols = colCount || inferColCount(list);
  const grid = [];
  for (let r = 0; r < list.length; r++) {
    const row = Array.isArray(list[r]) ? list[r] : [];
    const g = [];
    let idx = 0; // cells already consumed in this row (covered slots are not consumed)
    for (let c = 0; c < cols; c++) {
      // If (r,c) is already covered by a merge from an earlier row -> placeholder
      // (the current row is not pushed into grid yet, so pass g along)
      const cover = findCover(grid.concat([g]), r, c);
      if (cover) {
        g.push({ cell: null, covered: true, r, c, owner: cover });
        continue;
      }
      const cell = row[idx] || null;
      idx++;
      g.push({ cell, covered: false, r, c, owner: null });
    }
    grid.push(g);
  }
  return { grid, colCount: cols };
}

/** Infer the grid column count from the accumulated colSpan per row (covered slots occupy no array element). */
function inferColCount(rows) {
  let max = 1;
  for (const row of rows) {
    let acc = 0;
    for (const cell of row) acc += cell?.colSpan || 1;
    max = Math.max(max, acc);
  }
  return max;
}

/** Find the merge owner covering (r,c) in the already built grid (excluding the position itself). */
function findCover(grid, r, c) {
  for (let rr = Math.max(0, r - 8); rr <= r; rr++) {
    const row = grid[rr];
    if (!row) continue;
    for (const g of row) {
      if (!g.cell || g.covered) continue;
      const rs = g.cell.rowSpan || 1;
      const cs = g.cell.colSpan || 1;
      if (g.r + rs > r && g.c <= c && c < g.c + cs) {
        if (g.r === r && g.c === c) continue; // the position itself is not a cover
        return { cell: g.cell, r: g.r, c: g.c };
      }
    }
  }
  return null;
}

/**
 * Merge a region (r1..r2 × c1..c2, inclusive).
 * @param {number} colCount grid column count (columnWidths.length)
 * @returns {null | string} null on success, otherwise the failure reason.
 */
export function tryMerge(rows, r1, c1, r2, c2, colCount) {
  const { grid, colCount: cols } = tableGrid(rows, colCount);
  const list = Array.isArray(rows) ? rows : [];
  if (r1 < 0 || c1 < 0 || r2 >= grid.length || c2 >= cols || r1 > r2 || c1 > c2) {
    return "合并区域超出表格范围";
  }
  if (r1 === r2 && c1 === c2) return "至少选择两个单元格";
  // The region must not contain covered slots (cannot overlap an existing merge)
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const g = grid[r]?.[c];
      if (!g) return "合并区域超出表格范围";
      if (g.covered) return "区域内包含已合并的单元格，请先拆分";
      if ((g.cell?.rowSpan || 1) > 1 || (g.cell?.colSpan || 1) > 1) return "区域内包含已合并的单元格，请先拆分";
    }
  }
  // Owner = top-left of the region; (r,c) indices into rows[r] must be mapped via the grid
  const main = grid[r1][c1].cell;
  main.rowSpan = r2 - r1 + 1;
  main.colSpan = c2 - c1 + 1;
  // Remove the covered cells from each row array (skipping the owner itself)
  for (let r = r1; r <= r2; r++) {
    const row = list[r];
    if (!row) continue;
    // collect this row's cells inside the region (except the owner)
    const remove = [];
    for (let c = c1; c <= c2; c++) {
      if (r === r1 && c === c1) continue;
      const g = grid[r][c];
      if (!g.covered && g.cell) remove.push(g.cell);
    }
    for (const cell of remove) {
      const i = row.indexOf(cell);
      if (i >= 0) row.splice(i, 1);
    }
  }
  return null;
}

/**
 * Split the merged cell at (r,c) (restoring covered positions as empty Cells).
 * @param {number} colCount grid column count (columnWidths.length)
 * @returns {null | string} null on success, otherwise the failure reason.
 */
export function trySplit(rows, r, c, colCount) {
  const { grid } = tableGrid(rows, colCount);
  const g = grid[r]?.[c];
  if (!g || g.covered) return "该位置不是合并单元格";
  const cell = g.cell;
  const rowSpan = cell.rowSpan || 1;
  const colSpan = cell.colSpan || 1;
  if (rowSpan === 1 && colSpan === 1) return "该位置不是合并单元格";
  // Restore the owner row's positions covered by colSpan (after (g.r, g.c))
  const mainRow = rows[g.r];
  const mainIdx = mainRow ? mainRow.indexOf(cell) : -1;
  if (mainIdx >= 0 && colSpan > 1) {
    for (let k = 1; k < colSpan; k++) mainRow.splice(mainIdx + k, 0, { text: "" });
  }
  // Restore the positions covered by rowSpan in each row below (colSpan empty slots per row)
  for (let rr = g.r + 1; rr < g.r + rowSpan; rr++) {
    const row = rows[rr];
    if (!row) continue;
    // Insert position: number of visible cells in this row before (rr, c)
    let before = 0;
    for (let cc = 0; cc < c; cc++) {
      const gg = grid[rr][cc];
      if (gg && !gg.covered && gg.cell) before++;
    }
    for (let k = 0; k < colSpan; k++) row.splice(before + k, 0, { text: "" });
  }
  delete cell.rowSpan;
  delete cell.colSpan;
  return null;
}

/** Normalize bare values (string/number) -> {text}; returns a new array (no mutation). */
export function normalizeCells(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) =>
    (Array.isArray(row) ? row : []).map((cell) =>
      cell && typeof cell === "object" && !Array.isArray(cell) ? cell : { text: cell == null ? "" : String(cell) }
    )
  );
}

/** Size-ratio validation (official constraint: each entry in [0,1], sum = 1). Returns null or a message. */
export function validateDims(dims, name) {
  if (dims == null) return null;
  if (!Array.isArray(dims) || !dims.length) return `${name} 应为非空数组`;
  if (dims.some((v) => typeof v !== "number" || v <= 0 || v > 1)) {
    return `${name} 每项应在 (0,1] 区间`;
  }
  const sum = dims.reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1) > 0.001) return `${name} 各项之和应为 1（当前 ${sum.toFixed(3)}）`;
  return null;
}

// ----------------------------------------------------------------------------
// Layout: column-width ratios + minimum row height (no content estimation; rows grow with content)
// ----------------------------------------------------------------------------

/**
 * Table layout: column-width ratios (relative to the bounds width); row height =
 * minimum row height (see below), grown automatically by the layout engine when
 * content is taller (both preview tr and PowerPoint a:tr are min-height).
 * Minimum row height:
 *   - rowHeights given -> max(ratio × bounds height, readability floor)
 *   - not given -> readability floor (header 30 / normal row 26, so short text does
 *     not crowd the row)
 * No content estimation: the real height of formulas/multi-line text comes from each
 * layout engine (browser MathML and PowerPoint OMML, both Cambria Math metrics), so
 * both sides behave identically.
 * @param {object} el table element (bounds/rows/columnWidths/rowHeights)
 * @returns {{ rowHeights: number[], columnWidths: number[] }}
 *  rowHeights is in pt/px.
 */
export function estimateTableLayout(el) {
  const rows = Array.isArray(el.rows) ? el.rows : [];
  // Prefer columnWidths for the column count (rows[0] may be shorter after a merge, row length is unreliable)
  const cols = Array.isArray(el.columnWidths) && el.columnWidths.length
    ? el.columnWidths.length
    : (rows[0]?.length || 1);
  const boundsW = Array.isArray(el.bounds) ? el.bounds[2] : 400;
  const boundsH = Array.isArray(el.bounds) ? el.bounds[3] : 400;
  const colWs =
    Array.isArray(el.columnWidths) && el.columnWidths.length === cols
      ? el.columnWidths
      : Array.from({ length: cols }, () => 1 / cols);

  const ratios =
    Array.isArray(el.rowHeights) && el.rowHeights.length === rows.length
      ? el.rowHeights
      : null;
  const rowHeights = rows.map((_, r) => {
    const minH = r === 0 ? TABLE_MIN_HEADER : TABLE_MIN_ROW;
    return ratios ? Math.max(boundsH * (ratios[r] ?? 1 / Math.max(1, rows.length)), minH) : minH;
  });
  return { rowHeights, columnWidths: colWs };
}
