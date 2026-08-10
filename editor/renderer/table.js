// ============================================================================
// renderer/table.js — 表格预览（内容高度自适应 + 官方继承链，与 writer 同源）
// ----------------------------------------------------------------------------
// 样式优先级与 writer/table.js 一致：
//   Cell 内联字段 > Cell.textStyle 引用 > 位置分类 > bodyStyles > cellStyle > 默认
// ============================================================================

import { resolveColor, resolveTableStyle, resolveTableCellStyle, resolveTextStyle } from "../core/theme.js";
import { estimateTableLayout, tableGrid, TABLE_FONT_SIZE, TABLE_CELL_PAD, TABLE_CELL_PAD_X } from "../core/table.js";

const H_ALIGN = { left: "left", center: "center", right: "right", justify: "justify", distributed: "justify" };

/** 展开网格 → 单元格最终样式（与 writer 同源；covered 位返回 {covered:true}）。 */
function cellFinal(theme, ts, r, c, rowCount, colCount, cell, tableFill) {
  const s = resolveTableCellStyle(ts, r, c, rowCount, colCount);
  const ref = resolveTextStyle(theme, cell?.textStyle);
  const fill = cell?.fill ?? s.fill ?? tableFill ?? null;
  const align = cell?.align ?? s.align ?? ["center", "middle"];
  return {
    s, ref, fill, align,
    color: cell?.color ?? ref.color ?? s.color ?? "#000000",
    fontFamily: cell?.fontFamily ?? ref.fontFamily ?? s.fontFamily,
    fontSize: cell?.fontSize ?? ref.fontSize ?? s.fontSize ?? TABLE_FONT_SIZE,
    bold: cell?.bold ?? ref.bold ?? s.bold,
    italic: cell?.italic ?? ref.italic ?? s.italic,
    backgroundColor: cell?.backgroundColor ?? ref.backgroundColor ?? s.backgroundColor,
    lineHeight: cell?.lineHeightPx ?? ref.lineHeightPx ?? s.lineHeightPx
      ?? (cell?.lineHeight ?? ref.lineHeight ?? s.lineHeight) ?? 1,
    letterSpacing: cell?.letterSpacing ?? ref.letterSpacing ?? s.letterSpacing,
    marginTop: cell?.marginTop ?? ref.marginTop ?? s.marginTop,
    borderColor: cell?.border?.color ?? s.border?.color ?? "#000000",
    borderStyle: cell?.border?.style ?? s.border?.style ?? "solid",
    borderWidth: cell?.border?.width ?? s.border?.width ?? 1,
  };
}

export function renderTable(theme, el) {
  const [x, y, w] = el.bounds;
  const { rowHeights, totalH, columnWidths } = estimateTableLayout(el);
  const box = document.createElement("div");
  box.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${totalH}px;overflow:hidden;`;
  box.dataset.elementId = el.elementId;
  box.dataset.elementType = "table";
  if (el.opacity != null) box.style.opacity = el.opacity;

  const ts = resolveTableStyle(theme, el.style);
  const rows = el.rows || [];
  const colWs = columnWidths;
  const rowCount = rows.length;
  const colCount = colWs.length;
  // 省略式 rows → 完整网格（covered 位输出空 td 占位，保持行列对齐）
  const { grid } = tableGrid(rows, colCount);

  const table = document.createElement("table");
  table.style.cssText =
    "width:100%;height:100%;border-collapse:collapse;table-layout:fixed;" +
    `font-size:${TABLE_FONT_SIZE}px;`;

  const colgroup = document.createElement("colgroup");
  colWs.forEach((cw) => {
    const col = document.createElement("col");
    col.style.width = `${(cw * 100).toFixed(3)}%`;
    colgroup.appendChild(col);
  });
  table.appendChild(colgroup);

  grid.forEach((gRow, r) => {
    const tr = document.createElement("tr");
    tr.style.height = `${rowHeights[r] ?? 26}px`;
    gRow.forEach((g, c) => {
      const cell = g.cell;
      // 被合并覆盖位：输出空 td（保留行列结构，样式按分类链计算）
      if (g.covered) {
        const f = cellFinal(theme, ts, r, c, rowCount, colCount, null, el.fill);
        const td = document.createElement("td");
        td.style.cssText = tdCss(theme, f, true);
        tr.appendChild(td);
        return;
      }
      const f = cellFinal(theme, ts, r, c, rowCount, colCount, cell, el.fill);
      const td = document.createElement("td");
      td.innerHTML = richTextToHtml(theme, cell?.text ?? "");
      td.style.cssText = tdCss(theme, f, false);
      if (cell?.rowSpan > 1) td.rowSpan = cell.rowSpan;
      if (cell?.colSpan > 1) td.colSpan = cell.colSpan;
      tr.appendChild(td);
    });
    table.appendChild(tr);
  });

  box.appendChild(table);
  return box;
}

/** td 内联样式（预览；covered 位无文字不显示背景文字样式）。 */
function tdCss(theme, f, covered) {
  const fillColor = f.fill ? (typeof f.fill === "string" ? resolveColor(theme, f.fill) : resolveColor(theme, f.fill.color)) : null;
  const hAlign = H_ALIGN[f.align[0]] || "center";
  const vAlign = f.align[1] || "middle";
  const parts = [
    `border:${f.borderStyle === "solid" ? f.borderWidth + "px solid" : f.borderWidth + "px dashed"} ${f.borderColor}`,
    `padding:${TABLE_CELL_PAD}px ${TABLE_CELL_PAD_X}px`,
    `text-align:${hAlign}`,
    `vertical-align:${vAlign}`,
  ];
  if (!covered) {
    parts.push(
      `font-weight:${f.bold ? "600" : "400"}`,
      f.italic ? "font-style:italic" : "",
      `color:${resolveColor(theme, f.color) || "#000000"}`,
      `font-size:${f.fontSize}px`,
      f.fontFamily ? `font-family:"${f.fontFamily}",sans-serif` : "",
      f.backgroundColor ? `background-color:${resolveColor(theme, f.backgroundColor)}` : "",
      `line-height:${f.lineHeight}`,
      f.letterSpacing ? `letter-spacing:${f.letterSpacing}px` : "",
      f.marginTop ? `padding-top:${TABLE_CELL_PAD + f.marginTop}px` : "",
      "overflow:hidden",
      "text-overflow:ellipsis",
      "white-space:normal",
    );
  }
  parts.push(`background:${fillColor || "transparent"}`);
  return parts.filter(Boolean).join(";");
}
export function richTextToHtml(theme, text) {
  if (!text) return "";
  const src = String(text);
  return src.replace(/\$([a-zA-Z][\w-]*)/g, (_, key) => resolveColor(theme, `$${key}`) || "#000000");
}
