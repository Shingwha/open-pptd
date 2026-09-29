// ============================================================================
// renderer/table.js — table preview (content-height adaptive + official inheritance chain, same source as writer)
// ----------------------------------------------------------------------------
// Style priority matches writer/table.js:
//   cell inline fields > Cell.textStyle ref > position class > bodyStyles > cellStyle > default
// ============================================================================

import { resolveColor, colorOr, resolveFont, resolveTableStyle, resolveTableCellStyle, resolveTextStyle, cellTextStyle } from "../model/theme.js";
import { estimateTableLayout, tableGrid, TABLE_FONT_SIZE, TABLE_CELL_PAD, TABLE_CELL_PAD_X } from "../model/table.js";
import { parseRichText } from "../model/richtext.js";
import { normalizeFill, dashSpec, borderSides, cssTextAlign, cssTextAlignLast } from "../model/style-spec.js";
import { runSpan, applyParaStyle } from "./text.js";
import { gradientCss } from "./gradient.js";
import { createElementShell, boxShadowCss } from "./shell.js";

/** Single-side CSS (null = no border; $ color refs are resolved by resolveColor at the consumer). */
function sideCss(theme, v) {
  if (!v) return "none";
  const color = colorOr(theme, v.color ?? "#000000", "#000000");
  const style = dashSpec(v.style)?.cssBorder || "solid";
  return `${v.width ?? 1}px ${style} ${color}`;
}

/** Expanded grid → final cell style (text-style merge comes from the model single source; a covered slot returns {covered:true}). */
export function cellFinal(theme, ts, r, c, rowCount, colCount, cell, tableFill) {
  const s = resolveTableCellStyle(ts, r, c, rowCount, colCount);
  const fill = cell?.fill ?? s.fill ?? tableFill ?? null;
  const align = cell?.align ?? s.align ?? ["center", "middle"];
  return {
    s,
    ref: resolveTextStyle(theme, cell?.textStyle),
    fill,
    align,
    borders: borderSides(cell?.border ?? s.border),
    ...cellTextStyle(theme, ts, r, c, rowCount, colCount, cell),
  };
}

export function renderTable(theme, el) {
  // Geometry source: when LayoutTree facts exist (el.layout.table injected by paintPage)
  // use the layout's exact row heights / column widths / total height (the same tree used
  // by validation and export); otherwise fall back to the model's minimum row-height
  // estimate (legacy callers that invoke renderTable directly, e.g. editor toolchain).
  const lt = el.layout?.table;
  const { rowHeights, columnWidths } = lt
    ? { rowHeights: lt.rowHeights, columnWidths: lt.columnWidths }
    : estimateTableLayout(el);
  // Total height known (exact layout value) → preset the outer container height and
  // release overflow: with border-collapse the outer border sits on the table edge
  // (about 1px outside the box), so height alone + the default overflow:hidden would
  // clip the last row's bottom border (measured: tests/projects/table#9, second table).
  const box = createElementShell(el, { height: false });
  if (lt) {
    box.style.height = `${lt.totalHeight}px`;
    box.style.overflow = "visible";
  }
  // Official Table.shadow → exported a:tblPr > a:effectLst; preview projects the same source as box-shadow
  const shadow = boxShadowCss(theme, el.shadow);
  if (shadow) box.style.boxShadow = shadow;

  const ts = resolveTableStyle(theme, el.style);
  const rows = el.rows || [];
  const colWs = columnWidths;
  const rowCount = rows.length;
  const colCount = colWs.length;
  // Omitted-style rows → full grid (covered slots emit an empty td placeholder to keep row/col alignment)
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
    // Row height: min-height semantics (minimum row height = rowHeights ratio × bounds or
    // a readability floor); rows grow automatically when content exceeds it (matches PowerPoint a:tr)
    const rh = rowHeights[r] != null ? rowHeights[r] : 26;
    if (rh != null) tr.style.height = `${rh}px`;
    gRow.forEach((g, c) => {
      const cell = g.cell;
      // Merge-covered slot: emit an empty td (keeps the row/col structure; style via the class chain)
      if (g.covered) {
        const f = cellFinal(theme, ts, r, c, rowCount, colCount, null, el.fill);
        const td = document.createElement("td");
        td.style.cssText = tdCss(theme, f, true);
        tr.appendChild(td);
        return;
      }
      const f = cellFinal(theme, ts, r, c, rowCount, colCount, cell, el.fill);
      const td = document.createElement("td");
      // Rich text + formulas: parseRichText + runSpan share the text-box pipeline (\(...\) → KaTeX MathML)
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

/** td inline style (preview; covered slots have no text and skip text styles). */
export function tdCss(theme, f, covered) {
  // Fill: FillSpec normalization (string color / solid / gradient, same source as writer buildFill)
  const fillSpec = normalizeFill(f.fill);
  const fillCss = fillSpec
    ? fillSpec.type === "solid"
      ? resolveColor(theme, fillSpec.color)
      : fillSpec.type === "gradient"
        ? gradientCss(theme, fillSpec)
        : null
    : null;
  const hAlign = cssTextAlign(f.align[0]) || "center";
  const vAlign = f.align[1] || "middle";
  const parts = [
    // Per-side borders (BorderSpec array, four independent sides; preview and writer share source and order)
    `border-top:${sideCss(theme, f.borders.top)}`,
    `border-right:${sideCss(theme, f.borders.right)}`,
    `border-bottom:${sideCss(theme, f.borders.bottom)}`,
    `border-left:${sideCss(theme, f.borders.left)}`,
    `padding:${TABLE_CELL_PAD}px ${TABLE_CELL_PAD_X}px`,
    `text-align:${hAlign}`,
    `vertical-align:${vAlign}`,
  ];
  // distributed → justify + last-line stretch (same as the text box's textAlignCss)
  const alignLast = cssTextAlignLast(f.align[0]);
  if (alignLast) parts.push(`text-align-last:${alignLast}`);
  if (!covered) {
    parts.push(
      // Bold matches the exported b="1" (700) value (600 was used before, one step lighter than export)
      `font-weight:${f.bold ? "bold" : "400"}`,
      f.italic ? "font-style:italic" : "",
      `color:${colorOr(theme, f.color, "#000000")}`,
      `font-size:${f.fontSize}px`,
      f.fontFamily ? `font-family:"${f.fontFamily}",sans-serif` : "",
      `line-height:${f.lineHeightPx ? `${f.lineHeightPx}px` : f.lineHeight}`,
      f.letterSpacing ? `letter-spacing:${f.letterSpacing}px` : "",
      f.marginTop ? `padding-top:${TABLE_CELL_PAD + f.marginTop}px` : "",
    "overflow:hidden",
    "text-overflow:ellipsis",
    // \n/<br> hard breaks (same semantics as the exported <a:br/>); normal would collapse them to spaces
    "white-space:pre-line",
  );
  }
  parts.push(`background:${fillCss || "transparent"}`);
  return parts.filter(Boolean).join(";");
}
/**
 * Cell rich text → DOM (same pipeline as renderer/text.js: parseRichText + runSpan).
 * Formulas \(...\) go through runSpan → formulaSpan for native KaTeX MathML rendering.
 * Text highlight (official CellStyle.backgroundColor, a:highlight semantics): each
 * paragraph wraps its runs in an inline span so the background hugs the text line.
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
  // Height is not preset: content decides it, and the td's vertical-align (f.align[1])
  // centers vertically; height:100% would fill the cell and defeat that alignment
  const css = ["width:100%;box-sizing:border-box;overflow:hidden"];
  css.push(`font-size:${f.fontSize}px`);
  const color = resolveColor(theme, f.color);
  if (color) css.push(`color:${color}`);
  if (f.bold) css.push("font-weight:bold");
  if (f.italic) css.push("font-style:italic");
  css.push(`line-height:${f.lineHeightPx ? `${f.lineHeightPx}px` : f.lineHeight ?? 1}`);
  if (f.letterSpacing != null) css.push(`letter-spacing:${f.letterSpacing}px`);
  const font = resolveFont(theme, f.fontFamily);
  css.push(`font-family:"${font.latin}","${font.ea}",sans-serif`);
  const align0 = Array.isArray(f.align) ? f.align[0] : null;
  css.push(`text-align:${cssTextAlign(align0) || "center"}`);
  const alignLast = cssTextAlignLast(align0);
  if (alignLast) css.push(`text-align-last:${alignLast}`); // distributed → last-line stretch (same as text boxes)
  root.style.cssText = css.join(";");

  const hl = resolveColor(theme, f.backgroundColor);
  for (const para of tree.paragraphs) {
    const p = document.createElement("div");
    applyParaStyle(p, para);
    if (hl) {
      const inner = document.createElement("span");
      inner.style.background = hl;
      for (const run of para.runs) inner.appendChild(runSpan(theme, run, base, para.style));
      p.appendChild(inner);
    } else {
      for (const run of para.runs) p.appendChild(runSpan(theme, run, base, para.style));
    }
    root.appendChild(p);
  }
  return root;
}
