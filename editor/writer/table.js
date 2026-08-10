// ============================================================================
// writer/table.js — 表格导出（p:graphicFrame + a:tbl，原生可编辑）
// ----------------------------------------------------------------------------
// 样式消费严格按官方继承链（Style Priority §1.2 表格单元格）：
//   富文本标签 > span 内联 > 段落 > Cell 内联字段 > Cell.textStyle 引用 >
//   位置分类（rowOverColumn 仲裁）> bodyStyles 循环 > cellStyle 基底 > 默认
// 填充链：cell.fill > 分类 fill > cellStyle fill > Table.fill > 透明
// 边框：BorderSpec（四边独立，null=无）；CT_TableCellProperties 的 lnL/lnR/lnT/lnB
//   直接承载 CT_LineProperties（w/cap/cmpd/algn 属性在 lnL 上，不能包 a:ln）
// 对齐：cell.align > 分类 align > 官方默认 [center, middle]
// ============================================================================

import { el, escAttr } from "./xml.js";
import { buildParagraph } from "./text.js";
import { parseRichText } from "../core/richtext.js";
import { resolveTableStyle, resolveTableCellStyle, resolveTextStyle, resolveFont } from "../core/theme.js";
import { estimateTableLayout } from "../core/table.js";
import { colorElement, buildFill } from "./drawing.js";

const V_ANCHOR = { top: "t", middle: "ctr", bottom: "b" };

/** BorderSpec → [上, 右, 下, 左]（null = 无边框）。 */
function parseBorderSpec(spec) {
  if (spec == null) return [null, null, null, null]; // 顶层 null = 全部清除
  if (Array.isArray(spec)) {
    if (spec.length === 2) return [spec[0], spec[1], spec[0], spec[1]]; // [上下, 左右]
    if (spec.length === 4) return [spec[0], spec[1], spec[2], spec[3]]; // [上, 右, 下, 左]
  }
  return [spec, spec, spec, spec]; // 单 Border = 四边相同
}

/**
 * 单边边框 XML：<a:lnX w cap cmpd algn>（CT_LineProperties 直接承载在线元素上）。
 * 子元素顺序（CT_LineProperties schema）：fill 组 → prstDash → headEnd/tailEnd。
 * 无边框 → 空 <a:lnX/>（PowerPoint 重存行为一致）。
 */
function lnSide(theme, side, b) {
  if (!b) return el(side);
  const w = Math.round((b.width ?? 1) * 12700);
  const kids = [el("a:solidFill", {}, colorElement(theme, b.color ?? "#000000"))];
  if (b.style === "dash") kids.push(el("a:prstDash", { val: "dash" }));
  else if (b.style === "dot") kids.push(el("a:prstDash", { val: "dot" }));
  return el(side, { w, cap: "flat", cmpd: "sng", algn: "ctr" }, kids.join(""));
}

export function tableXml(theme, tableEl, ctx) {
  const [x, y, w] = tableEl.bounds;
  const ts = resolveTableStyle(theme, tableEl.style);
  const rows = Array.isArray(tableEl.rows) ? tableEl.rows : [];
  const { rowHeights, totalH, columnWidths } = estimateTableLayout(tableEl);
  const colWs = columnWidths;
  const rowCount = rows.length;
  const colCount = colWs.length;

  const gridCols = colWs
    .map((cw) => el("a:gridCol", { w: Math.round(Math.max(0.01, cw) * w * 12700) }))
    .join("");
  const trs = rows
    .map((row, r) => {
      const rh = rowHeights[r] != null ? rowHeights[r] : 26;
      const tcs = row
        .map((cell, c) => tcXml(theme, cell, r, c, ts, rowCount, colCount, tableEl.fill))
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

function tcXml(theme, cell, r, c, ts, rowCount, colCount, tableFill) {
  // 官方继承链合并 → 单元格最终样式（颜色保留 $ 引用）
  const s = resolveTableCellStyle(ts, r, c, rowCount, colCount);
  // Cell.textStyle 引用（theme.textStyles，只影响文字字段，不含 fill/border/align）
  const ref = resolveTextStyle(theme, cell?.textStyle);
  const text = cell?.text ?? "";
  const tree = parseRichText(text);

  // 文字基线（低 → 高：分类样式 < Cell.textStyle < Cell 内联）
  const base = {
    color: cell?.color ?? ref.color ?? s.color ?? "#000000",
    fontSize: cell?.fontSize ?? ref.fontSize ?? s.fontSize ?? 13,
    bold: !!(cell?.bold ?? ref.bold ?? s.bold),
    italic: !!(cell?.italic ?? ref.italic ?? s.italic),
    backgroundColor: cell?.backgroundColor ?? ref.backgroundColor ?? s.backgroundColor,
    lineHeight: cell?.lineHeight ?? ref.lineHeight ?? s.lineHeight ?? 1,
    lineHeightPx: cell?.lineHeightPx ?? ref.lineHeightPx ?? s.lineHeightPx,
    letterSpacing: cell?.letterSpacing ?? ref.letterSpacing ?? s.letterSpacing,
    marginTop: cell?.marginTop ?? ref.marginTop ?? s.marginTop,
    fontFamily: cell?.fontFamily ?? ref.fontFamily ?? s.fontFamily,
  };
  // 对齐：cell.align > 分类 align > 官方默认 [center, middle]
  const align = cell?.align ?? s.align ?? ["center", "middle"];
  base.textAlign = align[0];
  const paras = tree.paragraphs
    .map((p) => buildParagraph(theme, p, base, () => null))
    .join("");
  const body =
    `<a:txBody><a:bodyPr anchor="${V_ANCHOR[align[1]] || "ctr"}"><a:noAutofit/></a:bodyPr>` +
    `<a:lstStyle/>${paras}</a:txBody>`;

  // OOXML 严格顺序：tcPr 内 lnL/lnR/lnT/lnB 必须先于填充，否则 PowerPoint 忽略边框
  const kids = [];
  // 边框：单元格内联 > 分类样式 > 官方默认 {solid, 1, #000000}
  const borders = parseBorderSpec(cell?.border ?? s.border ?? { style: "solid", width: 1, color: "#000000" });
  for (const [side, dir] of [["a:lnL", 0], ["a:lnR", 1], ["a:lnT", 2], ["a:lnB", 3]]) {
    kids.push(lnSide(theme, side, borders[dir]));
  }
  // 填充：单元格内联 > 分类样式 > cellStyle > Table.fill > 透明
  const fill = cell?.fill ?? s.fill ?? (tableFill ? tableFill : null);
  if (fill) {
    if (fill.type === "solid" || fill.type === "gradient" || fill.type === "image") kids.push(buildFill(theme, fill));
    else kids.push(el("a:solidFill", {}, colorElement(theme, fill)));
  }

  const tcPrAttrs = { marL: 45720, marR: 45720, marT: 0, marB: 0, anchor: V_ANCHOR[align[1]] || "ctr" };
  if (cell?.rowSpan > 1) tcPrAttrs.rowSpan = cell.rowSpan;
  if (cell?.colSpan > 1) tcPrAttrs.colSpan = cell.colSpan;
  const tcPr = el("a:tcPr", tcPrAttrs, kids.join(""));
  return el("a:tc", {}, body + tcPr);
}
