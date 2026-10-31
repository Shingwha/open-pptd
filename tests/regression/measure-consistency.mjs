// ============================================================================
// tests/regression/measure-consistency.mjs — one measure across frames/box/cy
// ----------------------------------------------------------------------------
// 1. Package entry: fontMetricsMeasure.measureTable/measureCell are the same
//    functions exported by measure/index.js (one implementation, no adapter).
// 2. Sweep every table in tests/projects/table + examples:
//      layout.frame.h === facts.totalHeight === sum(facts.rowHeights)
//      rowHeights are integers; measureTable(el,{theme}) reproduces layout facts
//      (layout is style-aware and uses the deck theme).
// 3. Table project export: for every table page, writer a:ext cy and a:tr h are
//    exactly the layout facts (px→EMU) — writer and preview consume the same tree.
// 4. Source boundaries: writer never calls measureTable; renderer reads
//    el.layout.table; table editor calls measureTable(el,{theme}); buildPptx runs
//    layout exactly once.
// Run: node tests/regression/measure-consistency.mjs
// ============================================================================

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { measureTable, measureCell, fontMetricsMeasure } from "../../packages/measure/index.js";
import { layout } from "../../packages/layout/index.js";
import { resolveTheme } from "../../packages/model/theme.js";
import { parseDeck } from "../../packages/model/pptd-io.js";
import { loadProjectFiles } from "../../packages/cli/export.js";
import { buildPptx } from "../../packages/writer/pptx.js";
import { readText } from "../lib/unzip.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
let ok = true;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) ok = false;
};
const sum = (list) => list.reduce((a, b) => a + b, 0);
const factsOf = (le) => le.table && {
  columnWidths: le.table.columnWidths,
  rowHeights: le.table.rowHeights,
  totalHeight: le.table.totalHeight,
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------------------------------------------------------------------------
// 1. One measure implementation
// ---------------------------------------------------------------------------
console.log("=== 1. MeasurePort 唯一实现 ===");
check("fontMetricsMeasure.measureTable === measure/index export", fontMetricsMeasure.measureTable === measureTable);
check("fontMetricsMeasure.measureCell === measure/index export", fontMetricsMeasure.measureCell === measureCell);

// ---------------------------------------------------------------------------
// 2. Layout facts vs direct measure over all projects
// ---------------------------------------------------------------------------
console.log("\n=== 2. layout facts == measureTable（全项目表格） ===");
const projectDirs = [];
for (const src of ["tests/projects", "examples"]) {
  const dir = join(ROOT, src);
  for (const name of readdirSync(dir)) {
    const deckFile = join(dir, name, "deck.pptd");
    if (existsSync(deckFile)) projectDirs.push(deckFile);
  }
}
let tableCount = 0;
let mismatch = 0;
let shrink = 0;
const mismatches = [];
for (const deckFile of projectDirs) {
  const { manifestText, pageFiles } = loadProjectFiles(deckFile);
  const deck = parseDeck(manifestText, pageFiles);
  const theme = resolveTheme(deck);
  const tree = layout(deck);
  const tableEls = [];
  (deck.pages || []).forEach((page) => (page.elements || []).forEach((el) => { if (el?.elementType === "table") tableEls.push(el); }));
  const laidTables = [];
  for (const page of tree.pages) for (const le of page.elements) if (le.elementType === "table") laidTables.push(le);
  if (laidTables.length !== tableEls.length) {
    mismatch += 1;
    mismatches.push(`${deckFile}: layout ${laidTables.length} != model ${tableEls.length}`);
    continue;
  }
  for (let i = 0; i < laidTables.length; i++) {
    tableCount += 1;
    const le = laidTables[i];
    const facts = factsOf(le);
    const direct = measureTable(tableEls[i], { theme });
    const directFacts = { columnWidths: direct.columnWidths, rowHeights: direct.rowHeights, totalHeight: direct.totalHeight };
    if (le.frame.h !== facts.totalHeight || sum(facts.rowHeights) !== facts.totalHeight || !same(facts, directFacts)) {
      mismatch += 1;
      mismatches.push(`${deckFile} ${le.elementId}: frame=${le.frame.h} total=${facts.totalHeight} direct=${direct.totalHeight}`);
    }
    if (!facts.rowHeights.every((h) => Number.isInteger(h)) || !Number.isInteger(facts.totalHeight)) {
      mismatch += 1;
      mismatches.push(`${deckFile} ${le.elementId}: 非整数行高 ${JSON.stringify(facts.rowHeights)}`);
    }
    if (le.frame.h < le.declared.h) shrink += 1;
  }
}
check(`扫描 ${projectDirs.length} 项目 / ${tableCount} 个表格：frame.h == totalHeight == sum(rowHeights) == direct measure`, mismatch === 0 && tableCount > 0, mismatch ? mismatches.slice(0, 3).join(" | ") : `tableCount=${tableCount}`);
check("至少一个表格缩短到内容高（D6：不再留 bounds 空白）", shrink > 0, `shrink=${shrink}`);
const tableProject = parseDeck(...(() => { const f = loadProjectFiles(join(ROOT, "tests/projects/table/deck.pptd")); return [f.manifestText, f.pageFiles]; })());
const tableTree = layout(tableProject);
const p1 = tableTree.pages[0].elements.find((e) => e.elementId === "tb1") || tableTree.pages[0].elements.find((e) => e.elementType === "table");
check("table 项目 page1 声明 220 → frame == totalHeight（内容高）", p1.elementId === "tb1" && p1.declared.h === 220 && p1.frame.h === p1.table.totalHeight && p1.frame.h < 220, `declared=${p1.declared.h} frame=${p1.frame.h}`);

// Determinism of the pure measure across repeated calls
const d1 = measureTable(tableProject.pages[0].elements.find((e) => e.elementType === "table"), { theme: tableProject.theme });
const d2 = measureTable(tableProject.pages[0].elements.find((e) => e.elementType === "table"), { theme: tableProject.theme });
check("measureTable 重复调用确定", same(d1, d2), JSON.stringify(d1.rowHeights));

// ---------------------------------------------------------------------------
// 3. buildPptx: writer a:ext cy / a:tr h == layout facts (table project)
// ---------------------------------------------------------------------------
console.log("\n=== 3. PPTX 与 layout facts 逐表对照（tests/projects/table） ===");
const pptx = await buildPptx(tableProject, { iconRegistry: {} });
const tableProjectTables = tableTree.pages.reduce((n, p) => n + p.elements.filter((e) => e.elementType === "table").length, 0);
const tableXmlOf = (xml) => {
  const frames = [];
  for (const m of xml.matchAll(/<p:graphicFrame>([\s\S]*?)<\/p:graphicFrame>/g)) {
    if (!m[1].includes("<a:tbl>")) continue;
    const ext = m[1].match(/<a:ext cx="(\d+)" cy="(\d+)"\/>/);
    const rowHeights = [...m[1].matchAll(/<a:tr h="(\d+)"/g)].map((x) => Number(x[1]) / 12700);
    frames.push({ cx: ext ? Number(ext[1]) / 12700 : null, cy: ext ? Number(ext[2]) / 12700 : null, rowHeights });
  }
  return frames;
};
let xmlTables = 0;
let xmlMismatch = 0;
const xmlDetails = [];
for (let pi = 0; pi < tableTree.pages.length; pi++) {
  const xml = readText(pptx, `ppt/slides/slide${pi + 1}.xml`);
  const frames = tableXmlOf(xml);
  const laid = tableTree.pages[pi].elements.filter((e) => e.elementType === "table");
  if (frames.length !== laid.length) {
    xmlMismatch += 1;
    xmlDetails.push(`slide${pi + 1}: XML ${frames.length} != layout ${laid.length}`);
    continue;
  }
  for (let i = 0; i < frames.length; i++) {
    xmlTables += 1;
    const f = frames[i];
    const facts = laid[i].table;
    if (f.cy !== facts.totalHeight || !same(f.rowHeights, facts.rowHeights) || f.cx !== Math.round(laid[i].frame.w)) {
      xmlMismatch += 1;
      xmlDetails.push(`slide${pi + 1} ${laid[i].elementId}: cy=${f.cy} total=${facts.totalHeight} tr=${JSON.stringify(f.rowHeights)}`);
    }
  }
}
check(`PPTX ${xmlTables} 个表格：a:ext cy / a:tr h == facts（px→EMU 后一致）`, xmlMismatch === 0 && xmlTables === tableProjectTables && xmlTables > 0, xmlMismatch ? xmlDetails.slice(0, 3).join(" | ") : `pages=${tableTree.pages.length}`);

// ---------------------------------------------------------------------------
// 4. Source boundaries (one layout pass; writer/renderer/editor consumption)
// ---------------------------------------------------------------------------
console.log("\n=== 4. 源码边界 ===");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");
const pptxSrc = read("packages/writer/pptx.js");
const slideSrc = read("packages/writer/slide.js");
const writerTable = read("packages/writer/table.js");
const rendererTable = read("packages/renderer/table.js");
const editorTable = read("editor/interaction/dialogs/table-editor.js");
check("buildPptx 只计算一次 layout", (pptxSrc.match(/layout\(/g) || []).length === 1 && /const tree = layout\(/.test(pptxSrc));
check("buildSlide 通过 ctx.layoutOf 下发 LayoutTree", /layoutOf\(element\)/.test(slideSrc) && /options\.layoutPage/.test(slideSrc));
check("writer/table.js 不 import/调用 measureTable", !/measureTable/.test(writerTable));
check("writer/pptx.js + slide.js 不调用 measureTable", !/measureTable/.test(pptxSrc) && !/measureTable/.test(slideSrc));
check("renderer/table.js 读 layout facts（el.layout.table）", /el\.layout\?\.table/.test(rendererTable) && !/measureTable/.test(rendererTable));
check("table-editor 用 measureTable(el,{theme}) 且不再用 estimateTableLayout", /measureTable\(el, \{ theme \}\)/.test(editorTable) && !/estimateTableLayout/.test(editorTable));
check("writer 的 table shard 仍由 toXml 自注册", /registerType\(\{ type: "table", toXml: tableXml \}\)/.test(read("packages/writer/types/table.js")));

console.log(`\n结果: ${ok ? "全部通过 ✅" : "存在失败 ❌"}`);
process.exit(ok ? 0 : 1);
