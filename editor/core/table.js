// ============================================================================
// core/table.js — 表格模型（网格展开 / 合并拆分 / 尺寸校验 / 布局计算）
// ----------------------------------------------------------------------------
// 官方 Cell 规则（pptd.md Table/Cell）：
//   - rows 为 2-D Cell 数组；合并用 rowSpan/colSpan 声明，被覆盖位置直接省略
//     （无 null 占位），所以展开网格需要逐行消费单元格
//   - columnWidths/rowHeights 每项 ∈ [0,1] 且各项和 = 1
// 行高语义（与 PowerPoint a:tr min-height 行为一致）：
//   - 行高 = 最小行高：未指定 rowHeights → 可读性底线（表头 30 / 行 26）；
//     指定 rowHeights → 比例 × bounds 高度（不低于底线）
//   - 内容排版超出最小行高时，行自动增高（预览 tr / PowerPoint 均为 min-height）
//   - 不做内容估算：公式/多行文本高度由各自排版引擎给出（两端同 Cambria Math 度量）
// 预览（renderer）与导出（writer）共享本模块。
// ============================================================================

export const TABLE_FONT_SIZE = 13; // pt/px
export const TABLE_CELL_PAD = 5; // 垂直内边距（pt/px）
export const TABLE_CELL_PAD_X = 9; // 水平内边距
export const TABLE_MIN_ROW = 26; // 行高可读性底线（pt/px）
export const TABLE_MIN_HEADER = 30; // 表头行高底线（pt/px）

// ----------------------------------------------------------------------------
// 网格展开与合并
// ----------------------------------------------------------------------------

/**
 * 把 rows（合并省略式）展开为完整网格。
 * @param {Array} rows 2-D Cell 数组（被合并覆盖的位置省略）
 * @param {number|null} colCount 网格列数（来自 columnWidths.length）；null 时按
 *   各行的 colSpan 累计跨度推断（合并后某行变短时取未合并行的值）。
 * @returns {{ grid: Array<Array<{cell: object|null, covered: boolean, r: number, c: number, owner: object|null}>>,
 *             colCount: number }}
 *   cell=null 且 covered=true：被合并覆盖（占位不可编辑）；
 *   cell=null 且 covered=false：行数据不足的空位（可编辑）。
 */
export function tableGrid(rows, colCount) {
  const list = Array.isArray(rows) ? rows : [];
  const cols = colCount || inferColCount(list);
  const grid = [];
  for (let r = 0; r < list.length; r++) {
    const row = Array.isArray(list[r]) ? list[r] : [];
    const g = [];
    let idx = 0; // 该行已消费的单元格数（被覆盖位不消费）
    for (let c = 0; c < cols; c++) {
      // 若 (r,c) 已被前面行的合并覆盖 → 占位（当前行尚未 push 进 grid，需带上 g）
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

/** 按各行的 colSpan 累计跨度推断网格列数（合并覆盖位不占数组元素）。 */
function inferColCount(rows) {
  let max = 1;
  for (const row of rows) {
    let acc = 0;
    for (const cell of row) acc += cell?.colSpan || 1;
    max = Math.max(max, acc);
  }
  return max;
}

/** 在已构建的 grid 中查找覆盖 (r,c) 的合并主格（不含自身位置）。 */
function findCover(grid, r, c) {
  for (let rr = Math.max(0, r - 8); rr <= r; rr++) {
    const row = grid[rr];
    if (!row) continue;
    for (const g of row) {
      if (!g.cell || g.covered) continue;
      const rs = g.cell.rowSpan || 1;
      const cs = g.cell.colSpan || 1;
      if (g.r + rs > r && g.c <= c && c < g.c + cs) {
        if (g.r === r && g.c === c) continue; // 自身位置不是覆盖
        return { cell: g.cell, r: g.r, c: g.c };
      }
    }
  }
  return null;
}

/**
 * 合并区域（r1..r2 × c1..c2，含端点）。
 * @param {number} colCount 网格列数（columnWidths.length）
 * @returns {null | string} 成功返回 null，失败返回原因。
 */
export function tryMerge(rows, r1, c1, r2, c2, colCount) {
  const { grid, colCount: cols } = tableGrid(rows, colCount);
  const list = Array.isArray(rows) ? rows : [];
  if (r1 < 0 || c1 < 0 || r2 >= grid.length || c2 >= cols || r1 > r2 || c1 > c2) {
    return "合并区域超出表格范围";
  }
  if (r1 === r2 && c1 === c2) return "至少选择两个单元格";
  // 区域内不得包含被覆盖位（不能与既有合并重叠）
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const g = grid[r]?.[c];
      if (!g) return "合并区域超出表格范围";
      if (g.covered) return "区域内包含已合并的单元格，请先拆分";
      if ((g.cell?.rowSpan || 1) > 1 || (g.cell?.colSpan || 1) > 1) return "区域内包含已合并的单元格，请先拆分";
    }
  }
  // 主格 = 区域左上角；(r,c) 在 rows[r] 中的索引需要按 grid 映射
  const main = grid[r1][c1].cell;
  main.rowSpan = r2 - r1 + 1;
  main.colSpan = c2 - c1 + 1;
  // 从每行数组中删除被覆盖的单元格（跳过主格所在行与列之外的其余格）
  for (let r = r1; r <= r2; r++) {
    const row = list[r];
    if (!row) continue;
    // 收集该行在区域内的格（除主格外）
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
 * 拆分 (r,c) 处的合并单元格（恢复被覆盖位为空 Cell）。
 * @param {number} colCount 网格列数（columnWidths.length）
 * @returns {null | string} 成功返回 null，失败返回原因。
 */
export function trySplit(rows, r, c, colCount) {
  const { grid } = tableGrid(rows, colCount);
  const g = grid[r]?.[c];
  if (!g || g.covered) return "该位置不是合并单元格";
  const cell = g.cell;
  const rowSpan = cell.rowSpan || 1;
  const colSpan = cell.colSpan || 1;
  if (rowSpan === 1 && colSpan === 1) return "该位置不是合并单元格";
  // 恢复主格行内被 colSpan 覆盖的位置（在 (g.r, g.c) 之后）
  const mainRow = rows[g.r];
  const mainIdx = mainRow ? mainRow.indexOf(cell) : -1;
  if (mainIdx >= 0 && colSpan > 1) {
    for (let k = 1; k < colSpan; k++) mainRow.splice(mainIdx + k, 0, { text: "" });
  }
  // 恢复下方各行被 rowSpan 覆盖的位置（每行 colSpan 个空位）
  for (let rr = g.r + 1; rr < g.r + rowSpan; rr++) {
    const row = rows[rr];
    if (!row) continue;
    // 插入位置：该行在 (rr, c) 之前的可见格数
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

/** 裸值（string/number）→ {text} 规范化；返回新数组（不突变）。 */
export function normalizeCells(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) =>
    (Array.isArray(row) ? row : []).map((cell) =>
      cell && typeof cell === "object" && !Array.isArray(cell) ? cell : { text: cell == null ? "" : String(cell) }
    )
  );
}

/** 尺寸比例校验（官方约束：每项 ∈ [0,1]，和 = 1）。返回 null 或提示。 */
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
// 布局计算：列宽比例 + 最小行高（不做内容估算，行随内容自动增高）
// ----------------------------------------------------------------------------

/**
 * 表格布局：列宽比例（相对 bounds 宽度）；行高 = 最小行高（见下），内容排版超出时
 * 由排版引擎自动增高（预览 tr / PowerPoint a:tr 均为 min-height 语义）。
 * 最小行高取值：
 *   - 指定 rowHeights → max(比例 × bounds 高度, 可读性底线)
 *   - 未指定 → 可读性底线（表头 30 / 普通行 26，避免小字号下行高贴字）
 * 不做内容估算：公式/多行文本的实际高度由各自排版引擎（浏览器 MathML 与 PowerPoint
 * OMML，同为 Cambria Math 度量）给出，两端行为一致。
 * @param {object} el 表格元素（bounds/rows/columnWidths/rowHeights）
 * @returns {{ rowHeights: number[], columnWidths: number[] }}
 *  rowHeights 单位为 pt/px。
 */
export function estimateTableLayout(el) {
  const rows = Array.isArray(el.rows) ? el.rows : [];
  // 列数优先用 columnWidths（合并后 rows[0] 可能变短，行长度不可靠）
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
