// ============================================================================
// writer/table.js — 表格导出（p:graphicFrame + a:tbl，原生可编辑）
// ----------------------------------------------------------------------------
// 样式消费严格按官方继承链（Style Priority §1.2 表格单元格）：
//   富文本标签 > span 内联 > 段落 > Cell 内联字段 > Cell.textStyle 引用 >
//   位置分类（rowOverColumn 仲裁）> bodyStyles 循环 > cellStyle 基底 > 默认
//
// 合并单元格（PowerPoint 原生结构，对照用户手工合并文件）：
//   - rowSpan/colSpan 是 <a:tc> 的属性（不是 tcPr！）
//   - 被合并覆盖的位置**不省略**，输出空占位格 <a:tc vMerge="1">（被行合并
//     覆盖）或 hMerge="1"（被列合并覆盖），斜向覆盖两者都写
//   - 每行 tc 数量必须与 gridCol 数量一致（完整网格）
//   PPTD YAML 层的省略规则由 tableGrid 展开还原（core/table.js）
//
// 边框：CT_TableCellProperties 的 lnL/lnR/lnT/lnB 直接承载 CT_LineProperties
//   （w/cap/cmpd/algn 属性在 lnL 上，不能包 a:ln）
// 对齐：cell.align > 分类 align > 官方默认 [center, middle]
// ============================================================================

import { el, escAttr } from "./xml.js";
import { buildParagraph } from "./text.js";
import { parseRichText } from "../core/richtext.js";
import { resolveTableStyle, resolveTableCellStyle, resolveTextStyle } from "../core/theme.js";
import { estimateTableLayout, tableGrid } from "../core/table.js";
import { colorElement, buildFill, buildShadow } from "./drawing.js";

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
  const { rowHeights, columnWidths } = estimateTableLayout(tableEl);
  const colWs = columnWidths;
  const rowCount = rows.length;
  const colCount = colWs.length;
  // PPTD 省略式 rows → 完整网格（covered 位输出 vMerge/hMerge 占位格）
  const { grid } = tableGrid(rows, colCount);

  const gridCols = colWs
    .map((cw) => el("a:gridCol", { w: Math.round(Math.max(0.01, cw) * w * 12700) }))
    .join("");
  const trs = grid
    .map((gRow, r) => {
      // 行高：min-height 语义（最小行高 = rowHeights 比例×bounds 或可读性底线），
      // 内容排版超出时由 PowerPoint 按内容自动增高（与预览端 tr 行为一致）
      const rh = rowHeights[r] != null ? rowHeights[r] : 26;
      const trAttrs = { h: Math.round(Math.max(0.01, rh) * 12700) };
      const tcs = gRow
        .map((g, c) => (g.covered ? mergePlaceholderTc(theme, g, r, c, ts, rowCount, colCount) : tcXml(theme, g.cell, r, c, ts, rowCount, colCount, tableEl.fill)))
        .join("");
      return el("a:tr", trAttrs, tcs);
    })
    .join("");

  const tbl = el("a:tbl", {}, [
    // 引用 theme1.xml 中定义的空白表格样式（无边框/无填充，不覆盖手绘），
    // 让 PowerPoint 有样式可循，单元格级 ln 边框才会渲染
    // 官方 Table.shadow → a:tblPr > a:effectLst；**顺序：effectLst 在 tableStyleId 之前**
    // （对照用户 table-shadow-ref.pptx 实测；写反会触发 PowerPoint 修复）
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
        // 图形框高度 = bounds 高度（建议框）；表格实际显示高度由各行排版高度决定
        el("a:ext", { cx: Math.round(w * 12700), cy: Math.round((tableEl.bounds[3] ?? 0) * 12700) }),
      ]),
      el("a:graphic", {}, el("a:graphicData", { uri: "http://schemas.openxmlformats.org/drawingml/2006/table" }, tbl)),
    ].join(""))
  );
}

/** 单元格 tcPr 公共部分（边框 + 填充 + 对齐；rowSpan/colSpan 不在 tcPr）。 */
function tcPrXml(theme, r, c, ts, rowCount, colCount, tableFill, cell, cellAlign) {
  const s = resolveTableCellStyle(ts, r, c, rowCount, colCount);
  const kids = [];
  // OOXML 严格顺序：tcPr 内 lnL/lnR/lnT/lnB 必须先于填充，否则 PowerPoint 忽略边框
  // 边框解析：全链未设置（undefined）→ 文档默认 1px 黑；显式 null → 四边清除
  const b = cell?.border ?? s.border;
  const borders = parseBorderSpec(b === undefined ? { style: "solid", width: 1, color: "#000000" } : b);
  // BorderSpec 数组顺序为 [上,右,下,左]（顺时针），映射到 lnT/lnR/lnB/lnL，
  // 数组下标与 XML 边名不是直连关系（曾误用 [0,1,2,3]→lnL/lnR/lnT/lnB，边框整体旋转）
  for (const [side, dir] of [["a:lnL", 3], ["a:lnR", 1], ["a:lnT", 0], ["a:lnB", 2]]) {
    kids.push(lnSide(theme, side, borders[dir]));
  }
  // 填充：单元格内联 > 分类样式 > cellStyle > Table.fill > 透明
  const fill = cell?.fill ?? s.fill ?? (tableFill ? tableFill : null);
  if (fill) {
    if (fill.type === "solid" || fill.type === "gradient" || fill.type === "image") kids.push(buildFill(theme, fill));
    else kids.push(el("a:solidFill", {}, colorElement(theme, fill)));
  }
  const align = cellAlign ?? s.align ?? ["center", "middle"];
  const attrs = { marL: 45720, marR: 45720, marT: 0, marB: 0, anchor: V_ANCHOR[align[1]] || "ctr" };
  return { xml: el("a:tcPr", attrs, kids.join("")), align, s };
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

  const tcPr = tcPrXml(theme, r, c, ts, rowCount, colCount, tableFill, cell, align).xml;
  // rowSpan/gridSpan 是 <a:tc> 的属性（PowerPoint 原生结构；横向跨度叫 gridSpan，
  // 不是 colSpan——写 colSpan 会被 PowerPoint 忽略，只剩 rowSpan 生效）
  const tcAttrs = {};
  if (cell?.rowSpan > 1) tcAttrs.rowSpan = cell.rowSpan;
  if (cell?.colSpan > 1) tcAttrs.gridSpan = cell.colSpan;
  return el("a:tc", tcAttrs, body + tcPr);
}

/**
 * 被合并覆盖的占位格（python-pptx 官方 merge 输出对照，check-table-修改后.pptx
 * 用户手工文件验证）：
 *   - 主格右侧同行：rowSpan=主格.rowSpan + hMerge="1"（接力覆盖下方列）
 *   - 主格下方行首格：gridSpan=主格.colSpan + vMerge="1"（接力覆盖右侧行）
 *   - 主格下方行其余格：hMerge="1" vMerge="1"（双从属，跨度 1×1）
 * 内容为空 txBody；tcPr 按分类样式计算（保持边框/填充视觉连续）。
 */
function mergePlaceholderTc(theme, g, r, c, ts, rowCount, colCount, tableFill) {
  const attrs = {};
  const owner = g.owner; // {cell, r, c}：合并主格
  const ownerCell = owner?.cell;
  const rs = ownerCell?.rowSpan || 1;
  const cs = ownerCell?.colSpan || 1;
  if (owner && owner.r === r && c > owner.c) {
    // 主格右侧同行：垂直方向仍被覆盖 → 继承 rowSpan
    if (rs > 1) attrs.rowSpan = rs;
    attrs.hMerge = "1";
  } else if (owner && r > owner.r && c === owner.c) {
    // 主格下方行首格：水平方向仍被覆盖 → 继承 gridSpan
    if (cs > 1) attrs.gridSpan = cs;
    attrs.vMerge = "1";
  } else if (owner && r > owner.r && c > owner.c) {
    // 斜向占位：双从属，跨度 1×1
    attrs.hMerge = "1";
    attrs.vMerge = "1";
  }
  const body = `<a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr/></a:p></a:txBody>`;
  const tcPr = tcPrXml(theme, r, c, ts, rowCount, colCount, tableFill, null, null).xml;
  return el("a:tc", attrs, body + tcPr);
}
