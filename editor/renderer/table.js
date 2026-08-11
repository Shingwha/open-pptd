// ============================================================================
// renderer/table.js — 表格预览（内容高度自适应 + 官方继承链，与 writer 同源）
// ----------------------------------------------------------------------------
// 样式优先级与 writer/table.js 一致：
//   Cell 内联字段 > Cell.textStyle 引用 > 位置分类 > bodyStyles > cellStyle > 默认
// ============================================================================

import { resolveColor, resolveTableStyle, resolveTableCellStyle, resolveTextStyle } from "../core/theme.js";
import { estimateTableLayout, tableGrid, TABLE_FONT_SIZE, TABLE_CELL_PAD, TABLE_CELL_PAD_X } from "../core/table.js";

const H_ALIGN = { left: "left", center: "center", right: "right", justify: "justify", distributed: "justify" };

const DEFAULT_BORDER = { style: "solid", width: 1, color: "#000000" };

/**
 * BorderSpec → 四边（与 writer/table.js parseBorderSpec 同规则）：
 *   undefined（全链未设置）→ 默认 1px 黑四边；null → 四边全无；
 *   两元素数组 [上下, 左右]；四元素数组 [上,右,下,左]；单 Border → 四边相同。
 */
function borderSides(b) {
  if (b === undefined) {
    return { top: DEFAULT_BORDER, right: DEFAULT_BORDER, bottom: DEFAULT_BORDER, left: DEFAULT_BORDER };
  }
  if (b === null) return { top: null, right: null, bottom: null, left: null };
  if (Array.isArray(b)) {
    if (b.length === 2) return { top: b[0], bottom: b[0], left: b[1], right: b[1] }; // [上下, 左右]
    if (b.length === 4) return { top: b[0], right: b[1], bottom: b[2], left: b[3] }; // [上,右,下,左]
  }
  return { top: b, right: b, bottom: b, left: b };
}

/** 单边 CSS（null = 无边框；$ 颜色引用在消费端 resolveColor）。 */
function sideCss(theme, v) {
  if (!v) return "none";
  const color = resolveColor(theme, v.color ?? "#000000") || "#000000";
  const style = v.style === "dash" ? "dashed" : v.style === "dot" ? "dotted" : "solid";
  return `${v.width ?? 1}px ${style} ${color}`;
}

/** 展开网格 → 单元格最终样式（与 writer 同源；covered 位返回 {covered:true}）。 */
export function cellFinal(theme, ts, r, c, rowCount, colCount, cell, tableFill) {
  const s = resolveTableCellStyle(ts, r, c, rowCount, colCount);
  const ref = resolveTextStyle(theme, cell?.textStyle);
  const fill = cell?.fill ?? s.fill ?? tableFill ?? null;
  const align = cell?.align ?? s.align ?? ["center", "middle"];
  const border = cell?.border ?? s.border;
  return {
    s, ref, fill, align, borders: borderSides(border),
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
      // 文字高亮（官方 CellStyle.backgroundColor，a:highlight 语义）：包 span 渲染在文字上
      const html = richTextToHtml(theme, cell?.text ?? "");
      const hl = resolveColor(theme, f.backgroundColor);
      td.innerHTML = hl ? `<span style="background:${hl}">${html}</span>` : html;
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
export function tdCss(theme, f, covered) {
  // 严格官方形态：fill 字符串色或 {type: "solid", color}（与 writer 同源）
  const fillColor = f.fill
    ? typeof f.fill === "string"
      ? resolveColor(theme, f.fill)
      : f.fill.type === "solid"
        ? resolveColor(theme, f.fill.color)
        : null
    : null;
  const hAlign = H_ALIGN[f.align[0]] || "center";
  const vAlign = f.align[1] || "middle";
  const parts = [
    // 逐边边框（BorderSpec 数组四边独立；预览与 writer 同源同序）
    `border-top:${sideCss(theme, f.borders.top)}`,
    `border-right:${sideCss(theme, f.borders.right)}`,
    `border-bottom:${sideCss(theme, f.borders.bottom)}`,
    `border-left:${sideCss(theme, f.borders.left)}`,
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
