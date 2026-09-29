// ============================================================================
// writer/table.js — table export (p:graphicFrame + a:tbl, natively editable)
// ----------------------------------------------------------------------------
// Style consumption follows the official inheritance chain exactly (Style Priority, table cells):
//   rich-text tags > span inline > paragraph > cell inline fields > Cell.textStyle ref >
//   position class (rowOverColumn arbitration) > bodyStyles loop > cellStyle base > default
//
// Merged cells (PowerPoint native structure):
//   - rowSpan/colSpan are attributes of <a:tc> (not tcPr!)
//   - covered positions are NOT omitted: emit an empty placeholder <a:tc vMerge="1"> (covered by
//     a row merge) or hMerge="1" (covered by a column merge); diagonal covers write both
//   - each row's tc count must equal the gridCol count (full grid)
//   The PPTD YAML omission rules are expanded by tableGrid (packages/model/table.js)
//
// Border: CT_TableCellProperties' lnL/lnR/lnT/lnB carry CT_LineProperties directly
//   (the w/cap/cmpd/algn attributes live on lnL; a:ln cannot wrap it)
// Align: cell.align > class align > official default [center, middle]
// ============================================================================

import { el, escAttr } from "./xml.js";
import { buildParagraph } from "./text.js";
import { parseRichText } from "../model/richtext.js";
import { resolveTableStyle, resolveTableCellStyle, cellTextStyle } from "../model/theme.js";
import { tableGrid, TABLE_CELL_PAD, TABLE_CELL_PAD_X } from "../model/table.js";
import { measureTable } from "../measure/index.js";
import { borderSides, dashSpec, normalizeFill, ooxmlAnchor } from "../model/style-spec.js";
import { colorElement, buildFill, buildShadow } from "./drawing.js";

/**
 * Single-side border XML: <a:lnX w cap cmpd algn> (CT_LineProperties carried directly on the line element).
 * Child order (CT_LineProperties schema): fill group → prstDash → headEnd/tailEnd.
 * No border → an empty <a:lnX/> (matching PowerPoint re-save behavior).
 */
function lnSide(theme, side, b) {
  if (!b) return el(side);
  const w = Math.round((b.width ?? 1) * 12700);
  const kids = [el("a:solidFill", {}, colorElement(theme, b.color ?? "#000000"))];
  const dash = dashSpec(b.style)?.ooxml;
  if (dash) kids.push(el("a:prstDash", { val: dash }));
  return el(side, { w, cap: "flat", cmpd: "sng", algn: "ctr" }, kids.join(""));
}

export function tableXml(theme, tableEl, ctx) {
  const [x, y, w] = tableEl.bounds;
  const ts = resolveTableStyle(theme, tableEl.style);
  const rows = Array.isArray(tableEl.rows) ? tableEl.rows : [];
  // Row-height single source: consume measure's exact rowHeights — derived from the same metrics
  // table as the preview (layout→paint); no longer the model's min semantics (which let PowerPoint
  // auto-grow by content and drift from the preview by pixels). Column-width ratios match
  // (measure internally is estimateTableLayout).
  const { rowHeights, columnWidths } = measureTable(tableEl);
  const colWs = columnWidths;
  const rowCount = rows.length;
  const colCount = colWs.length;
  // PPTD omitted-style rows → full grid (covered slots emit vMerge/hMerge placeholders)
  const { grid } = tableGrid(rows, colCount);

  const gridCols = colWs
    .map((cw) => el("a:gridCol", { w: Math.round(Math.max(0.01, cw) * w * 12700) }))
    .join("");
  const trs = grid
    .map((gRow, r) => {
      // Row height: min-height semantics (minimum row height = rowHeights ratio × bounds or a
      // readability floor); PowerPoint grows it by content when exceeded (matching the preview's tr)
      const rh = rowHeights[r] != null ? rowHeights[r] : 26;
      const trAttrs = { h: Math.round(Math.max(0.01, rh) * 12700) };
      const tcs = gRow
        .map((g, c) => (g.covered ? mergePlaceholderTc(theme, g, r, c, ts, rowCount, colCount) : tcXml(theme, g.cell, r, c, ts, rowCount, colCount, tableEl.fill)))
        .join("");
      return el("a:tr", trAttrs, tcs);
    })
    .join("");

  const tbl = el("a:tbl", {}, [
    // Reference the blank table style defined in theme1.xml (no border/fill, does not override
    // hand-drawn content) so PowerPoint has a style to follow and cell-level ln borders render.
    // Official Table.shadow → a:tblPr > a:effectLst; ORDER: effectLst before tableStyleId
    // (writing them reversed triggers PowerPoint repair)
    el("a:tblPr", { firstRow: "0", bandRow: "0", horzBanding: "0" },
      (tableEl.shadow ? buildShadow(theme, tableEl.shadow) : "") +
      el("a:tableStyleId", {}, "{00000000-0000-0000-0000-000000000000}")),
    el("a:tblGrid", {}, gridCols),
    trs,
  ].join(""));

  return (
    el("p:graphicFrame", {}, [
      el("p:nvGraphicFramePr", {}, [
        el("p:cNvPr", { id: ctx.nextId(), name: escAttr(tableEl.elementId) }),
        el("p:cNvGraphicFramePr"),
        el("p:nvPr"),
      ]),
      el("p:xfrm", {}, [
        el("a:off", { x: Math.round(x * 12700), y: Math.round(y * 12700) }),
        // Graphic-frame height = bounds height (suggested box); the table's actual height comes from each row's laid-out height
        el("a:ext", { cx: Math.round(w * 12700), cy: Math.round((tableEl.bounds[3] ?? 0) * 12700) }),
      ]),
      el("a:graphic", {}, el("a:graphicData", { uri: "http://schemas.openxmlformats.org/drawingml/2006/table" }, tbl)),
    ].join(""))
  );
}

/** Shared cell tcPr parts (border + fill + align; rowSpan/colSpan are not in tcPr). */
function tcPrXml(theme, r, c, ts, rowCount, colCount, tableFill, cell, cellAlign) {
  const s = resolveTableCellStyle(ts, r, c, rowCount, colCount);
  const kids = [];
  // Strict OOXML order: lnL/lnR/lnT/lnB must precede the fill inside tcPr, or PowerPoint ignores
  // the borders. Border resolution (borderSides built-in defaults): the whole chain unset
  // (undefined) → document default 1px black; explicit null → all four sides cleared; an array
  // [top/bottom, left/right] or [top,right,bottom,left]; a single Border → all four sides alike
  const borders = borderSides(cell?.border ?? s.border);
  // XML side names map directly to named sides (array indices must not be wired straight to lnL/lnR/lnT/lnB, which rotated every border)
  for (const [side, b] of [["a:lnL", borders.left], ["a:lnR", borders.right], ["a:lnT", borders.top], ["a:lnB", borders.bottom]]) {
    kids.push(lnSide(theme, side, b));
  }
  // Fill: cell inline > class style > cellStyle > Table.fill > transparent (normalizeFill single source)
  const fill = normalizeFill(cell?.fill ?? s.fill ?? tableFill ?? null);
  if (fill) kids.push(buildFill(theme, fill));
  const align = cellAlign ?? s.align ?? ["center", "middle"];
  // Padding uses the same constants as the preview (model/table.js, pt → EMU); hardcoding 3.6pt/0 drifted from the preview's 9/5px
  const attrs = {
    marL: TABLE_CELL_PAD_X * 12700,
    marR: TABLE_CELL_PAD_X * 12700,
    marT: TABLE_CELL_PAD * 12700,
    marB: TABLE_CELL_PAD * 12700,
    anchor: ooxmlAnchor(align[1]) || "ctr",
  };
  return { xml: el("a:tcPr", attrs, kids.join("")), align, s };
}

function tcXml(theme, cell, r, c, ts, rowCount, colCount, tableFill) {
  // Cell text-style merge → model single source cellTextStyle (same implementation as the preview's cellFinal)
  const s = resolveTableCellStyle(ts, r, c, rowCount, colCount);
  const text = cell?.text ?? "";
  const tree = parseRichText(text);

  // Text base (align: cell.align > class align > official default [center, middle])
  const base = cellTextStyle(theme, ts, r, c, rowCount, colCount, cell);
  const align = cell?.align ?? s.align ?? ["center", "middle"];
  base.textAlign = align[0];
  const paras = tree.paragraphs
    .map((p) => buildParagraph(theme, p, base, () => null))
    .join("");
  const body =
    `<a:txBody><a:bodyPr anchor="${ooxmlAnchor(align[1]) || "ctr"}"><a:noAutofit/></a:bodyPr>` +
    `<a:lstStyle/>${paras}</a:txBody>`;

  const tcPr = tcPrXml(theme, r, c, ts, rowCount, colCount, tableFill, cell, align).xml;
  // rowSpan/gridSpan are attributes of <a:tc> (PowerPoint native structure; the horizontal span is
  // gridSpan, not colSpan — colSpan is ignored by PowerPoint and only rowSpan takes effect)
  const tcAttrs = {};
  if (cell?.rowSpan > 1) tcAttrs.rowSpan = cell.rowSpan;
  if (cell?.colSpan > 1) tcAttrs.gridSpan = cell.colSpan;
  return el("a:tc", tcAttrs, body + tcPr);
}

/**
 * Placeholder cell covered by a merge:
 *   - same row to the right of the owner: rowSpan=owner.rowSpan + hMerge="1" (keeps covering rows below)
 *   - first cell of a row below the owner: gridSpan=owner.colSpan + vMerge="1" (keeps covering columns)
 *   - remaining cells below the owner: hMerge="1" vMerge="1" (double subordinate, 1×1 span)
 * Body is an empty txBody; tcPr is computed by class style (keeping border/fill visually continuous).
 */
function mergePlaceholderTc(theme, g, r, c, ts, rowCount, colCount, tableFill) {
  const attrs = {};
  const owner = g.owner; // {cell, r, c}: the merge owner cell
  const ownerCell = owner?.cell;
  const rs = ownerCell?.rowSpan || 1;
  const cs = ownerCell?.colSpan || 1;
  if (owner && owner.r === r && c > owner.c) {
    // Same row to the right of the owner: still covered vertically → inherit rowSpan
    if (rs > 1) attrs.rowSpan = rs;
    attrs.hMerge = "1";
  } else if (owner && r > owner.r && c === owner.c) {
    // First cell of a row below the owner: still covered horizontally → inherit gridSpan
    if (cs > 1) attrs.gridSpan = cs;
    attrs.vMerge = "1";
  } else if (owner && r > owner.r && c > owner.c) {
    // Diagonal placeholder: double subordinate, 1×1 span
    attrs.hMerge = "1";
    attrs.vMerge = "1";
  }
  const body = `<a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr/></a:p></a:txBody>`;
  const tcPr = tcPrXml(theme, r, c, ts, rowCount, colCount, tableFill, null, null).xml;
  return el("a:tc", attrs, body + tcPr);
}
