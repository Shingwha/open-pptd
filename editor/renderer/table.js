// ============================================================================
// renderer/table.js — 表格预览（内容高度自适应 + 官方继承链，与 writer 同源）
// ----------------------------------------------------------------------------
// 样式优先级与 writer/table.js 一致：
//   Cell 内联字段 > Cell.textStyle 引用 > 位置分类 > bodyStyles > cellStyle > 默认
// ============================================================================

import { resolveColor, resolveFont, resolveTableStyle, resolveTableCellStyle, resolveTextStyle } from "../core/theme.js";
import { estimateTableLayout, tableGrid, TABLE_FONT_SIZE, TABLE_CELL_PAD, TABLE_CELL_PAD_X } from "../core/table.js";
import { parseRichText } from "../core/richtext.js";
import { runSpan, applyParaStyle } from "./text.js";
import { createElementShell } from "./shell.js";

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
  const { rowHeights, columnWidths } = estimateTableLayout(el);
  // 高度不预设：由内容决定（含边框线），避免底部边框被 overflow:hidden 裁剪
  const box = createElementShell(el, { height: false });

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
    // 行高：min-height 语义（最小行高 = rowHeights 比例×bounds 或可读性底线），
    // 内容排版超出时行自动增高（与 PowerPoint a:tr 行为一致）
    const rh = rowHeights[r] != null ? rowHeights[r] : 26;
    if (rh != null) tr.style.height = `${rh}px`;
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
      // 富文本 + 公式：parseRichText + runSpan 与文本框同管线（\(...\) → KaTeX MathML）
      td.appendChild(renderCellContent(theme, cell?.text ?? "", f));
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
/**
 * 单元格富文本 → DOM（与 renderer/text.js 同管线：parseRichText + runSpan）。
 * 公式 \(...\) 由 runSpan → formulaSpan 走 KaTeX MathML 原生渲染；此前
 * richTextToHtml 只做 $key 替换，公式源码会原样显示。
 * 文字高亮（官方 CellStyle.backgroundColor，a:highlight 语义）：每段包
 * inline span 渲染在文字上，背景紧贴文字行。
 */
function renderCellContent(theme, text, f) {
  const tree = parseRichText(text || "");
  const base = {
    color: f.color,
    fontSize: f.fontSize,
    bold: f.bold,
    italic: f.italic,
    gradient: null,
  };
  const root = document.createElement("div");
  // 高度不预设：由内容决定，td 的 vertical-align（f.align[1]）负责垂直居中；
  // 若设 height:100% 会撑满单元格使 td 的 vertical-align 失效
  const css = ["width:100%;box-sizing:border-box;overflow:hidden"];
  css.push(`font-size:${f.fontSize}px`);
  const color = resolveColor(theme, f.color);
  if (color) css.push(`color:${color}`);
  if (f.bold) css.push("font-weight:bold");
  if (f.italic) css.push("font-style:italic");
  css.push(`line-height:${f.lineHeight ?? 1}`);
  if (f.letterSpacing != null) css.push(`letter-spacing:${f.letterSpacing}px`);
  const font = resolveFont(theme, f.fontFamily);
  css.push(`font-family:"${font.latin}","${font.ea}",sans-serif`);
  const hAlign = H_ALIGN[Array.isArray(f.align) ? f.align[0] : null] || "center";
  css.push(`text-align:${hAlign}`);
  root.style.cssText = css.join(";");

  const hl = resolveColor(theme, f.backgroundColor);
  for (const para of tree.paragraphs) {
    const p = document.createElement("div");
    applyParaStyle(p, para);
    if (hl) {
      const inner = document.createElement("span");
      inner.style.background = hl;
      for (const run of para.runs) inner.appendChild(runSpan(theme, run, base));
      p.appendChild(inner);
    } else {
      for (const run of para.runs) p.appendChild(runSpan(theme, run, base));
    }
    root.appendChild(p);
  }
  return root;
}
