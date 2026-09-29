// ============================================================================
// tests/regression/layout.mjs — layout 包回归（spec 09 T4 / M2 验收）
// ----------------------------------------------------------------------------
// 1. LayoutTree 形状：pageSize/pages/elements/frame/text/table/overflow
// 2. 文本撑高、表格撑高、图表尺寸透传、group 组壳跳过
// 3. overflow 事实：越界 + 内容撑高压下方元素（重叠）
// 4. 确定性：同一 deck 两次 layout 结果一致（可快照）
// 5. examples 全量：每页元素数与「非组壳元素」一致
// ============================================================================

import { readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { layout } from "../../packages/layout/index.js";
import { parseDeck } from "../../packages/model/pptd-io.js";
import { loadProjectFiles } from "../../packages/cli/export.js";

let ok = true;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) ok = false;
};

const deckWith = (elements) => ({ version: "v2", title: "t", size: [960, 540], pages: [{ elements }] });

// ---- 1. 形状 + 文本撑高 ----
const textDeck = deckWith([
  { elementId: "t1", elementType: "text", bounds: [40, 40, 200, 30], content: { text: "很长的中文内容用于验证文本撑高事实。".repeat(5), fontSize: 18 } },
  { elementId: "s1", elementType: "shape", shapeName: "rect", bounds: [10, 10, 50, 50] },
]);
const lt = layout(textDeck);
check("pageSize 来自 deck.size", lt.pageSize.w === 960 && lt.pageSize.h === 540);
check("pages 数一致", lt.pages.length === 1);
check("elements 数一致（非组壳）", lt.pages[0].elements.length === 2);
const t1 = lt.pages[0].elements.find((e) => e.elementId === "t1");
check("文本 frame.h 被内容撑高（> 声明 30）", t1.frame.h > 30 && t1.grown === true, `h=${t1.frame.h}`);
check("text 断行结果存在", t1.text && t1.text.lines >= 1, JSON.stringify(t1.text));
check("overflow 字段齐全", ["x", "y", "page"].every((k) => typeof t1.overflow[k] === "boolean") && Array.isArray(t1.overflow.overlaps));
const s1 = lt.pages[0].elements.find((e) => e.elementId === "s1");
check("shape frame == declared（尺寸透传）", s1.frame.x === 10 && s1.frame.h === 50 && s1.grown === false);

// 声明高 > 内容高时不变（只增不减）
const bigBox = layout(deckWith([{ elementId: "t", elementType: "text", bounds: [0, 0, 400, 300], content: { text: "短", fontSize: 18 } }]));
check("内容小于声明高时 frame.h 取声明值", bigBox.pages[0].elements[0].frame.h === 300 && bigBox.pages[0].elements[0].grown === false);

// ---- 2. 表格撑高 ----
const tableDeck = deckWith([
  {
    elementId: "tb",
    elementType: "table",
    bounds: [60, 100, 300, 40],
    rows: [[{ text: "表头" }, { text: "说明" }], [{ text: "很长的单元格中文内容需要换行很多行来把表格撑高一些" }, { text: "x" }]],
    columnWidths: [0.5, 0.5],
  },
  { elementId: "under", elementType: "shape", shapeName: "rect", bounds: [60, 130, 300, 30] },
]);
const ltT = layout(tableDeck);
const tb = ltT.pages[0].elements.find((e) => e.elementId === "tb");
check("表格 table 结构（列宽/行高/总高）", tb.table && tb.table.rowHeights.length === 2 && tb.table.totalHeight > 40, JSON.stringify(tb.table));
check("表格 frame.h 被内容撑高", tb.frame.h === Math.max(40, tb.table.totalHeight) && tb.grown === true, `h=${tb.frame.h}`);
check("表格撑高压下方元素 → overlaps 命中", tb.overflow.overlaps.some((o) => o.elementId === "under"));

// ---- 3. 越界 ----
const offDeck = deckWith([{ elementId: "x", elementType: "shape", shapeName: "rect", bounds: [900, 500, 200, 100] }]);
const xt = layout(offDeck).pages[0].elements[0];
check("超出画布 → overflow.x/y", xt.overflow.x && xt.overflow.y && !xt.overflow.page);
const outDeck = deckWith([{ elementId: "y", elementType: "shape", shapeName: "rect", bounds: [1200, 700, 100, 100] }]);
check("完全在画布外 → overflow.page", layout(outDeck).pages[0].elements[0].overflow.page);

// ---- 4. group 组壳跳过 ----
const groupDeck = deckWith([
  { elementId: "g1", elementType: "group", children: ["a", "b"], bounds: [0, 0, 100, 100] },
  { elementId: "a", elementType: "shape", shapeName: "rect", bounds: [10, 10, 50, 50] },
  { elementId: "b", elementType: "text", bounds: [10, 80, 100, 20], content: { text: "成员", fontSize: 14 } },
]);
const ltG = layout(groupDeck);
check("group 组壳不进 LayoutTree", !ltG.pages[0].elements.some((e) => e.elementType === "group") && ltG.pages[0].elements.length === 2);

// ---- 5. 图表尺寸透传 ----
const chartDeck = deckWith([{ elementId: "c", elementType: "chart", bounds: [20, 20, 400, 300], series: [{ type: "bar" }], data: { cols: ["a"], rows: [1] } }]);
const cc = layout(chartDeck).pages[0].elements[0];
check("图表尺寸透传（frame == declared）", cc.frame.w === 400 && cc.frame.h === 300 && !cc.table && !cc.text);

// ---- 6. 确定性 + MeasurePort 注入 ----
const a = JSON.stringify(layout(textDeck));
const b = JSON.stringify(layout(textDeck));
check("两次 layout 结果一致（确定性）", a === b);
const stub = {
  measureTextRuns: (runs, style, maxWidth) => { void runs; void style; void maxWidth; return { lines: 1, height: 7 }; },
  measureTable: () => ({ columnWidths: [1], rowHeights: [5], totalHeight: 5 }),
};
const ltStub = layout(textDeck, stub);
check("可注入 MeasurePort（帧高来自注入实现）", ltStub.pages[0].elements.find((e) => e.elementId === "t1").text.contentHeight === 7);

// ---- 7. examples 全量 ----
const examplesDir = resolve("examples");
const decks = readdirSync(examplesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(examplesDir, d.name, "deck.pptd")))
  .map((d) => join(examplesDir, d.name, "deck.pptd"));
let totalPages = 0, mismatched = 0;
for (const manifest of decks) {
  const { manifestText, pageFiles } = loadProjectFiles(manifest);
  const deck = parseDeck(manifestText, pageFiles);
  const tree = layout(deck);
  if (tree.pages.length !== (deck.pages || []).length) mismatched++;
  for (let i = 0; i < tree.pages.length; i++) {
    totalPages++;
    const rendered = (deck.pages[i].elements || []).filter((e) => e.elementType !== "group").length;
    if (tree.pages[i].elements.length !== rendered) mismatched++;
  }
}
check(`examples 全量 layout（${decks.length} 套 ${totalPages} 页）元素数对齐`, mismatched === 0, `mismatch=${mismatched}`);

process.exit(ok ? 0 : 1);
