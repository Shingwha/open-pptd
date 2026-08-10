// ============================================================================
// writer/table.js — 表格导出（p:graphicFrame + a:tbl，原生可编辑）
// ----------------------------------------------------------------------------
// 主题：表头（首行）= headerFill + 白字 + bold；偶数数据行 = zebraFill 斑马纹。
// 单元格富文本走统一 buildParagraph（与文字元素同一套样式逻辑）。
// ============================================================================

import { el, escAttr } from "./xml.js";
import { buildParagraph } from "./text.js";
import { parseRichText } from "../core/richtext.js";
import { resolveTableStyle } from "../core/theme.js";
import { estimateTableLayout, TABLE_FONT_SIZE } from "../core/table.js";
import { colorElement, buildFill, buildLn } from "./drawing.js";

export function tableXml(theme, tableEl, ctx) {
  const [x, y, w] = tableEl.bounds;
  const ts = resolveTableStyle(theme);
  const rows = Array.isArray(tableEl.rows) ? tableEl.rows : [];
  const { rowHeights, totalH, columnWidths } = estimateTableLayout(tableEl);
  const colWs = columnWidths;

  const gridCols = colWs
    .map((cw) => el("a:gridCol", { w: Math.round(Math.max(0.01, cw) * w * 12700) }))
    .join("");
  const trs = rows
    .map((row, r) => {
      const rh = rowHeights[r] != null ? rowHeights[r] : 26;
      const tcs = row
        .map((cell) => tcXml(theme, cell, r, ts))
        .join("");
      return el("a:tr", { h: Math.round(Math.max(0.01, rh) * 12700) }, tcs);
    })
    .join("");

  const tbl = el("a:tbl", {}, [
    // 引用 theme1.xml 中定义的空白表格样式（无边框/无填充，不覆盖手绘），
    // 让 PowerPoint 有样式可循，单元格级 ln 边框才会渲染
    el("a:tblPr", { firstRow: "0", bandRow: "0", horzBanding: "0" }, el("a:tableStyleId", {}, "{00000000-0000-0000-0000-000000000000}")),
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
        el("a:ext", { cx: Math.round(w * 12700), cy: Math.round(totalH * 12700) }),
      ]),
      el("a:graphic", {}, el("a:graphicData", { uri: "http://schemas.openxmlformats.org/drawingml/2006/table" }, tbl)),
    ].join(""))
  );
}

function tcXml(theme, cell, r, ts) {
  const isHeader = r === 0;
  const text = cell?.text ?? "";
  const tree = parseRichText(text);
  const base = isHeader
    ? { color: ts.headerColor, bold: ts.headerBold, fontSize: 13.5 }
    : { color: "#374151", fontSize: 13 };
  if (ts.fontFamily) base.fontFamily = ts.fontFamily; // 组件级字体（deck fonts.table）
  const paras = tree.paragraphs
    .map((p) => buildParagraph(theme, p, base, () => null))
    .join("");
  const body =
    `<a:txBody><a:bodyPr anchor="ctr" lIns="114300" tIns="0" rIns="114300" bIns="0"><a:noAutofit/></a:bodyPr>` +
    `<a:lstStyle/>${paras}</a:txBody>`;

  // OOXML 严格顺序：tcPr 内 lnL/lnR/lnT/lnB 必须先于填充，否则 PowerPoint 忽略边框
  const kids = [];
  const border = { width: 1, color: ts.borderColor || "#d8dce1" };
  kids.push(el("a:lnL", {}, buildLn(theme, border)));
  kids.push(el("a:lnR", {}, buildLn(theme, border)));
  kids.push(el("a:lnT", {}, buildLn(theme, border)));
  kids.push(el("a:lnB", {}, buildLn(theme, border)));
  // 填充：表头 = headerFill；偶数数据行 = zebraFill 斑马纹（与预览一致）
  if (isHeader) {
    kids.push(el("a:solidFill", {}, colorElement(theme, ts.headerFill)));
  } else if (r % 2 === 1) {
    kids.push(el("a:solidFill", {}, colorElement(theme, ts.zebraFill || "#ffffff")));
  } else if (cell?.fill) {
    kids.push(buildFill(theme, cell.fill));
  }

  const tcPrAttrs = { anchor: "ctr", marL: 45720, marR: 45720, marT: 0, marB: 0 };
  if (cell?.rowSpan > 1) tcPrAttrs.rowSpan = cell.rowSpan;
  if (cell?.colSpan > 1) tcPrAttrs.colSpan = cell.colSpan;
  const tcPr = el("a:tcPr", tcPrAttrs, kids.join(""));
  return el("a:tc", {}, body + tcPr);
}
