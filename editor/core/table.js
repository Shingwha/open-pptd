// ============================================================================
// core/table.js — 表格布局（内容高度自适应，预览与导出共享）
// ----------------------------------------------------------------------------
// 表格高度 = 内容高度（表头/行内边距 + 文字行数），不再按比例撑满 bounds：
// 这样表格紧凑好看，且「预览所见 = PPT 里所得」。
// ============================================================================

import { richTextPlainText } from "./richtext.js";

export const TABLE_FONT_SIZE = 13; // pt/px
export const TABLE_CELL_PAD = 5; // 垂直内边距（pt/px）
export const TABLE_CELL_PAD_X = 9; // 水平内边距
export const TABLE_MIN_ROW = 26; // 最小行高（pt/px）

/** 估算一段富文本在指定列宽（pt）下的行数（中文字符≈fontSize，半角≈0.55×fontSize）。 */
export function estimateLines(text, colWidthPt, fontSize = TABLE_FONT_SIZE) {
  const plain = richTextPlainText(text);
  if (!plain) return 1;
  let lines = 1;
  let w = 0;
  for (const ch of plain) {
    const cw = ch.charCodeAt(0) > 255 ? fontSize : fontSize * 0.55;
    if (w + cw > colWidthPt) {
      lines += 1;
      w = cw;
    } else {
      w += cw;
    }
  }
  return lines;
}

/**
 * 计算表格内容布局。
 * @param {object} el 表格元素（bounds/rows/columnWidths）
 * @returns {{ rowHeights: number[], totalH: number, columnWidths: number[] }}
 *  rowHeights / columnWidths 单位为 pt/px。
 */
export function estimateTableLayout(el) {
  const rows = Array.isArray(el.rows) ? el.rows : [];
  const cols = rows[0]?.length || 1;
  const boundsW = Array.isArray(el.bounds) ? el.bounds[2] : 400;
  const colWs =
    Array.isArray(el.columnWidths) && el.columnWidths.length === cols
      ? el.columnWidths
      : Array.from({ length: cols }, () => 1 / cols);

  const rowHeights = rows.map((row, r) => {
    let maxH = TABLE_MIN_ROW;
    const isHeader = r === 0;
    row.forEach((cell, c) => {
      const colW = Math.max(40, boundsW * colWs[c]) - TABLE_CELL_PAD_X * 2;
      const lines = estimateLines(cell?.text || "", colW);
      const h = TABLE_CELL_PAD * 2 + lines * TABLE_FONT_SIZE * 1.25;
      maxH = Math.max(maxH, Math.round(isHeader ? Math.max(h, 30) : h));
    });
    return maxH;
  });

  const totalH = rowHeights.reduce((a, b) => a + b, 0);
  return { rowHeights, totalH, columnWidths: colWs };
}
