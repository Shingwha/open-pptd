// ============================================================================
// renderer/table.js — 表格预览（内容高度自适应 + 官方继承链，与 writer 同源）
// ----------------------------------------------------------------------------
// 样式优先级与 writer/table.js 一致：
//   Cell 内联字段 > Cell.textStyle 引用 > 位置分类 > bodyStyles > cellStyle > 默认
// ============================================================================

import { resolveColor, resolveTableStyle, resolveTableCellStyle, resolveTextStyle } from "../core/theme.js";
import { estimateTableLayout, TABLE_FONT_SIZE, TABLE_CELL_PAD, TABLE_CELL_PAD_X } from "../core/table.js";

const H_ALIGN = { left: "left", center: "center", right: "right", justify: "justify", distributed: "justify" };

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

  rows.forEach((row, r) => {
    const tr = document.createElement("tr");
    tr.style.height = `${rowHeights[r] ?? 26}px`;
    row.forEach((cell, c) => {
      const s = resolveTableCellStyle(ts, r, c, rowCount, colCount);
      const ref = resolveTextStyle(theme, cell?.textStyle);
      const td = document.createElement("td");
      td.innerHTML = richTextToHtml(theme, cell?.text ?? "");
      // 填充：单元格内联 > 分类样式 > cellStyle > Table.fill > 透明（官方默认）
      const fill = cell?.fill ?? s.fill ?? el.fill ?? null;
      const fillColor = fill ? (typeof fill === "string" ? resolveColor(theme, fill) : resolveColor(theme, fill.color)) : null;
      // 边框：单元格内联 > 分类样式 > 官方默认黑（四边）
      const borderColor = cell?.border?.color ?? s.border?.color ?? "#000000";
      const borderStyle = cell?.border?.style ?? s.border?.style ?? "solid";
      const borderWidth = (cell?.border?.width ?? s.border?.width ?? 1) + "px";
      // 对齐：cell.align > 分类 align > 官方默认 [center, middle]
      const align = cell?.align ?? s.align ?? ["center", "middle"];
      const hAlign = H_ALIGN[align[0]] || "center";
      const vAlign = align[1] || "middle";
      // 文字字段（低 → 高：分类 < textStyle < 内联）
      const color = cell?.color ?? ref.color ?? s.color ?? "#000000";
      const fontFamily = cell?.fontFamily ?? ref.fontFamily ?? s.fontFamily;
      const fontSize = cell?.fontSize ?? ref.fontSize ?? s.fontSize ?? TABLE_FONT_SIZE;
      const bold = cell?.bold ?? ref.bold ?? s.bold;
      const italic = cell?.italic ?? ref.italic ?? s.italic;
      const backgroundColor = cell?.backgroundColor ?? ref.backgroundColor ?? s.backgroundColor;
      const lineHeight = cell?.lineHeightPx ?? ref.lineHeightPx ?? s.lineHeightPx
        ?? (cell?.lineHeight ?? ref.lineHeight ?? s.lineHeight) ?? 1;
      const letterSpacing = cell?.letterSpacing ?? ref.letterSpacing ?? s.letterSpacing;
      const marginTop = cell?.marginTop ?? ref.marginTop ?? s.marginTop;
      td.style.cssText = [
        `border:${borderStyle === "solid" ? borderWidth + " solid" : borderWidth + " dashed"} ${borderColor}`,
        `padding:${TABLE_CELL_PAD}px ${TABLE_CELL_PAD_X}px`,
        `text-align:${hAlign}`,
        `vertical-align:${vAlign}`,
        `font-weight:${bold ? "600" : "400"}`,
        italic ? "font-style:italic" : "",
        `color:${resolveColor(theme, color) || "#000000"}`,
        `background:${fillColor || "transparent"}`,
        fontFamily ? `font-family:"${fontFamily}",sans-serif` : "",
        `font-size:${fontSize}px`,
        backgroundColor ? `background-color:${resolveColor(theme, backgroundColor)}` : "",
        `line-height:${lineHeight}`,
        letterSpacing ? `letter-spacing:${letterSpacing}px` : "",
        marginTop ? `padding-top:${TABLE_CELL_PAD + marginTop}px` : "",
        "overflow:hidden",
        "text-overflow:ellipsis",
        "white-space:normal",
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
