// ============================================================================
// writer/table.js — 表格导出（p:graphicFrame + a:tbl，原生可编辑）
// ----------------------------------------------------------------------------
// 样式消费严格按官方继承链（Style Priority §1.2 表格单元格）：
//   cellStyle 基底 → bodyStyles 循环 → 位置分类（rowOverColumn 仲裁）→ 单元格内联
// 填充：单元格内联 fill > 分类样式 fill > cellStyle fill > Table.fill > 透明
// 边框：BorderSpec（四边独立，null=无）；对齐：CellStyle.align [水平, 垂直]
// 单元格富文本走统一 buildParagraph（与文字元素同一套样式逻辑）。
// ============================================================================

import { el, escAttr } from "./xml.js";
import { buildParagraph } from "./text.js";
import { parseRichText } from "../core/richtext.js";
import { resolveTableStyle, resolveTableCellStyle, resolveFont } from "../core/theme.js";
import { estimateTableLayout } from "../core/table.js";
import { colorElement, buildFill, buildLn } from "./drawing.js";

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
  const text = cell?.text ?? "";
  const tree = parseRichText(text);

  // 文字基线（TextStyleConfig 字段；未设置的回退官方默认）
  const base = {
    color: s.color ?? "#000000",
    fontSize: s.fontSize ?? 13,
    bold: !!s.bold,
    italic: !!s.italic,
    lineHeight: s.lineHeight ?? 1,
    lineHeightPx: s.lineHeightPx,
    letterSpacing: s.letterSpacing,
    marginTop: s.marginTop,
    backgroundColor: s.backgroundColor,
  };
  if (s.fontFamily) base.fontFamily = s.fontFamily;
  // 水平对齐（CellStyle.align [h, v] → 段落 algn；v → tcPr anchor）
  if (Array.isArray(s.align) && s.align[0]) base.textAlign = s.align[0];
  const paras = tree.paragraphs
    .map((p) => buildParagraph(theme, p, base, () => null))
    .join("");
  const body =
    `<a:txBody><a:bodyPr anchor="${V_ANCHOR[s.align?.[1]] || "ctr"}" lIns="114300" tIns="0" rIns="114300" bIns="0"><a:noAutofit/></a:bodyPr>` +
    `<a:lstStyle/>${paras}</a:txBody>`;

  // OOXML 严格顺序：tcPr 内 lnL/lnR/lnT/lnB 必须先于填充，否则 PowerPoint 忽略边框
  const kids = [];
  // 边框：单元格内联 > 分类样式 > 官方默认 {solid, 1, #000000}
  // 注意：元素必须带 a: 前缀（漏前缀 = 不属于 DrawingML 命名空间 → PowerPoint 不渲染）
  const borders = parseBorderSpec(cell?.border ?? s.border ?? { style: "solid", width: 1, color: "#000000" });
  for (const [side, dir] of [["a:lnL", 0], ["a:lnR", 1], ["a:lnT", 2], ["a:lnB", 3]]) {
    const b = borders[dir];
    kids.push(b ? el(side, {}, buildLn(theme, b)) : el(side));
  }
  // 填充：单元格内联 > 分类样式 > cellStyle > Table.fill > 透明
  const fill = cell?.fill ?? s.fill ?? (tableFill ? tableFill : null);
  if (fill) {
    if (fill.type === "solid" || fill.type === "gradient" || fill.type === "image") kids.push(buildFill(theme, fill));
    else kids.push(el("a:solidFill", {}, colorElement(theme, fill)));
  }

  const tcPrAttrs = { anchor: V_ANCHOR[s.align?.[1]] || "ctr", marL: 45720, marR: 45720, marT: 0, marB: 0 };
  if (cell?.rowSpan > 1) tcPrAttrs.rowSpan = cell.rowSpan;
  if (cell?.colSpan > 1) tcPrAttrs.colSpan = cell.colSpan;
  const tcPr = el("a:tcPr", tcPrAttrs, kids.join(""));
  return el("a:tc", {}, body + tcPr);
}
