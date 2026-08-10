// ============================================================================
// renderer/table.js — 表格预览（内容高度自适应 + 主题化表头/斑马纹）
// ============================================================================

import { resolveColor, resolveTableStyle } from "../core/theme.js";
import { estimateTableLayout, TABLE_FONT_SIZE, TABLE_CELL_PAD, TABLE_CELL_PAD_X } from "../core/table.js";

export function renderTable(theme, el) {
  const [x, y, w] = el.bounds;
  const { rowHeights, totalH } = estimateTableLayout(el);
  const box = document.createElement("div");
  box.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${totalH}px;overflow:hidden;`;
  box.dataset.elementId = el.elementId;
  box.dataset.elementType = "table";
  if (el.opacity != null) box.style.opacity = el.opacity;

  const ts = resolveTableStyle(theme);
  const rows = el.rows || [];
  const colWs = estimateTableLayout(el).columnWidths;
  const borderColor = ts.borderColor || "#d8dce1";

  const table = document.createElement("table");
  table.style.cssText =
    "width:100%;height:100%;border-collapse:collapse;table-layout:fixed;" +
    `font-size:${TABLE_FONT_SIZE}px;` +
    (ts.fontFamily ? `font-family:"${ts.fontFamily}",sans-serif;` : "");

  const colgroup = document.createElement("colgroup");
  colWs.forEach((cw) => {
    const col = document.createElement("col");
    col.style.width = `${(cw * 100).toFixed(3)}%`;
    colgroup.appendChild(col);
  });
  table.appendChild(colgroup);

  rows.forEach((row, r) => {
    const tr = document.createElement("tr");
    tr.style.height = `${rowHeights[r] ?? TABLE_MIN_ROW}px`;
    const isHeader = r === 0;
    row.forEach((cell, c) => {
      const td = document.createElement(isHeader ? "th" : "td");
      td.innerHTML = richTextToHtml(theme, cell?.text ?? "");
      const bg = isHeader
        ? ts.headerFill
        : r % 2 === 1
          ? ts.zebraFill || "#ffffff"
          : "#ffffff";
      td.style.cssText = [
        `border:1px solid ${borderColor}`,
        `padding:${TABLE_CELL_PAD}px ${TABLE_CELL_PAD_X}px`,
        "text-align:left",
        "vertical-align:middle",
        `font-weight:${isHeader && ts.headerBold ? "600" : "400"}`,
        `color:${isHeader ? ts.headerColor : resolveColor(theme, "#374151")}`,
        `background:${bg}`,
        isHeader ? "font-size:13.5px" : "",
        "overflow:hidden",
        "text-overflow:ellipsis",
        "white-space:normal",
        "line-height:1.35",
      ].filter(Boolean).join(";");
      if (cell?.rowSpan > 1) td.rowSpan = cell.rowSpan;
      if (cell?.colSpan > 1) td.colSpan = cell.colSpan;
      tr.appendChild(td);
    });
    table.appendChild(tr);
  });

  box.appendChild(table);
  return box;
}

/** 把富文本 DSL 转为可显示 HTML（替换 $xxx 主题颜色）。 */
export function richTextToHtml(theme, text) {
  if (!text) return "";
  const src = String(text);
  return src.replace(/\$([a-zA-Z][\w-]*)/g, (_, key) => resolveColor(theme, `$${key}`) || "#000000");
}
