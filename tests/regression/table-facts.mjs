// tests/regression/table-facts.mjs — TableFacts single-height regression.
// 1. Style awareness: cellTextStyle fontSize 10/11/13 + theme table styles drive row heights.
// 2. rowSpan 2/3: required height split as q=floor(deficit/span), first `rem` rows take +1.
// 3. rowHeights lifecycle (normalize/adjust), schema length-mismatch warning, and
//    frame == box == a:ext cy == totalHeight; the writer consumes ctx facts verbatim.
// Run: node tests/regression/table-facts.mjs

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { measureTable, measureCell, defaultMetricsTable } from "../../packages/measure/index.js";
import { layout } from "../../packages/layout/index.js";
import {
  normalizeRowHeights,
  adjustRowHeightsForRowChange,
  estimateTableLayout,
} from "../../packages/model/table.js";
import { validateDeck } from "../../packages/model/validate.js";
import { tableXml } from "../../packages/writer/table.js";
import { buildPptx } from "../../packages/writer/pptx.js";
import { readText } from "../lib/unzip.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
let ok = true;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) ok = false;
};
const sum = (list) => list.reduce((a, b) => a + b, 0);
const approx = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// 1. Style awareness.
console.log("=== 1. 样式感知（cellTextStyle fontSize / theme） ===");
const long = "这是一个用于表格样式感知测试的较长单元格文本，需要在较窄列中换行多次。";
const styleTheme = {
  colors: {},
  textStyles: { big: { fontSize: 16, lineHeight: 1.25 } },
  tableStyles: {
    s10: { cellStyle: { fontSize: 10 } },
    s11: { cellStyle: { fontSize: 11 } },
    s13: { cellStyle: { fontSize: 13 } },
    bigHead: { cellStyle: { fontSize: 13 }, firstRowStyle: { fontSize: 20 } },
  },
};
const styleTable = (ref, cell = { text: long }) => ({
  rows: [[cell], [{ text: "短" }]],
  columnWidths: [1],
  bounds: [0, 0, 300, 200],
  style: ref,
});
const h10 = measureTable(styleTable("$s10"), { theme: styleTheme }).rowHeights[0];
const h11 = measureTable(styleTable("$s11"), { theme: styleTheme }).rowHeights[0];
const h13 = measureTable(styleTable("$s13"), { theme: styleTheme }).rowHeights[0];
check("样式 10 小于 11 小于 13（行高随字号）", h10 < h11 && h11 < h13, `${h10} < ${h11} < ${h13}`);
check(
  "fontSize 10 与直接 measureCell 一致（padding 一次）",
  h10 === measureCell({ text: long, fontSize: 10 }, 300),
  `${h10} vs ${measureCell({ text: long, fontSize: 10 }, 300)}`
);
check(
  "fontSize 11 与直接 measureCell 一致",
  h11 === measureCell({ text: long, fontSize: 11 }, 300),
  `${h11}`
);
check("默认 13 与 measureCell(13) 一致（无 theme 路径不变）", h13 === measureCell({ text: long, fontSize: 13 }, 300), `${h13}`);
const noTheme13 = measureTable(styleTable(undefined), undefined).rowHeights[0];
const inline13 = measureTable(styleTable(undefined), undefined).rowHeights[0];
check("无 theme 调用仍可用且确定", noTheme13 === inline13 && noTheme13 > 30, `${noTheme13}`);
const headBig = measureTable(styleTable("$bigHead"), { theme: styleTheme }).rowHeights[0];
check("firstRowStyle 覆盖 cellStyle 字号（20 > 13）", headBig > h13, `${headBig} > ${h13}`);
const cellRef = measureTable(styleTable("$s13", { text: long, textStyle: "$big" }), { theme: styleTheme }).rowHeights[0];
const cellInline = measureTable(styleTable("$s13", { text: long, fontSize: 10 }), { theme: styleTheme }).rowHeights[0];
check("Cell.textStyle 生效（16 号高于 13）", cellRef > h13, `${cellRef}`);
check("cell 内联字号优先级最高（10 号低于 13）", cellInline === h10, `${cellInline}`);
const spacingA = measureTable(styleTable("$s13", { text: long, letterSpacing: 0 }), { theme: styleTheme }).rowHeights[0];
const spacingB = measureTable(styleTable("$s13", { text: long, letterSpacing: 6 }), { theme: styleTheme }).rowHeights[0];
check("letterSpacing 参与换行/高度", spacingB > spacingA, `${spacingB} > ${spacingA}`);
check("裸字体表仍可作为第二参数（兼容）", measureTable(styleTable(undefined), defaultMetricsTable).rowHeights[0] === noTheme13);

// 2. rowSpan 2/3 + integer remainder.
console.log("\n=== 2. rowSpan 补差（平均 + 余数） ===");
// The merged cell is 120px wide; its required height must exceed the sum of the span's
// minimum floors, and the deficit must not divide evenly by the span so the remainder
// path (first `rem` rows take +1) is actually exercised.
const spanTextBase = "跨行合并单元格的文本需要足够长，使所需高度明显超过多行最小高度之和，只有这样才能观察到整数均分与余数分配。";
const floorsOf = (n) => Array.from({ length: n }, (_, i) => (i === 0 ? 30 : 26));
const findSpanText = (width, span) => {
  let text = spanTextBase;
  for (let i = 0; i < 40; i++) {
    const required = measureCell({ text }, width);
    const deficit = required - sum(floorsOf(span));
    if (deficit > 0 && deficit % span !== 0) return { text, required, deficit };
    text += "字";
  }
  return null;
};
const spanTable = (span, text) => {
  const rows = [[{ text, rowSpan: span }, { text: "右" }]];
  for (let r = 1; r < span; r++) rows.push([{ text: `第${r}行` }]);
  return { rows, columnWidths: [0.5, 0.5], bounds: [0, 0, 240, 60] };
};
for (const span of [2, 3]) {
  const found = findSpanText(120, span);
  check(`rowSpan=${span} 构造出 deficit>0 且有余数`, !!found, found ? `required=${found.required} deficit=${found.deficit}` : "未找到");
  if (!found) continue;
  const table = spanTable(span, found.text);
  const facts = measureTable(table);
  const floors = floorsOf(span);
  const q = Math.floor(found.deficit / span);
  const rem = found.deficit - q * span;
  const expected = floors.map((h, i) => h + q + (i < rem ? 1 : 0));
  check(
    `rowSpan=${span} 行高 = floor 均分 + 前 ${rem} 行各 +1`,
    JSON.stringify(facts.rowHeights) === JSON.stringify(expected),
    `${JSON.stringify(facts.rowHeights)} vs ${JSON.stringify(expected)}`
  );
  check(`rowSpan=${span} 跨度总高 == required（一次取整、padding 一次）`, sum(facts.rowHeights) === found.required, `sum=${sum(facts.rowHeights)} required=${found.required}`);
  check(`rowSpan=${span} 总高不低于合并内容`, facts.totalHeight >= found.required, `${facts.totalHeight}`);
  check(`rowSpan=${span} 结果确定（重复调用一致）`, JSON.stringify(measureTable(table)) === JSON.stringify(facts));
}
const nonSpanText = "普通单元格的内容只影响自己这一行，不应该被平均摊分到其它行。";
const noSpan = measureTable({ rows: [[{ text: nonSpanText }, { text: "右" }], [{ text: "x" }], [{ text: "y" }]], columnWidths: [0.5, 0.5], bounds: [0, 0, 240, 60] });
check("非跨行单元格按自身行取 max（不摊分）", noSpan.rowHeights[0] === measureCell({ text: nonSpanText }, 120) && noSpan.rowHeights[1] === 26, `${JSON.stringify(noSpan.rowHeights)}`);

// 3. rowHeights lifecycle.
console.log("\n=== 3. rowHeights 长度 / 插入删除 ===");
const threeRows = { rows: [[{ text: "a" }], [{ text: "b" }], [{ text: "c" }]], rowHeights: [0.5, 0.25, 0.25], columnWidths: [1] };
check("normalizeRowHeights 长度一致 → 归一数组", JSON.stringify(normalizeRowHeights(threeRows)) === JSON.stringify([0.5, 0.25, 0.25]));
const stale = { rows: threeRows.rows, rowHeights: [0.5, 0.5] };
check("normalizeRowHeights 长度不一致 → null", normalizeRowHeights(stale) === null);
check("estimateTableLayout 对 stale 回退到最小行高", JSON.stringify(estimateTableLayout({ ...stale, bounds: [0, 0, 200, 200] }).rowHeights) === JSON.stringify([30, 26, 26]));
check("measureTable 对 stale 不套用比例", JSON.stringify(measureTable({ ...stale, bounds: [0, 0, 200, 200] }).rowHeights) === JSON.stringify([30, 26, 26]));
check("sum(rowHeights)=1 时比例作为种子", JSON.stringify(estimateTableLayout({ ...threeRows, bounds: [0, 0, 200, 400] }).rowHeights) === JSON.stringify([200, 100, 100]));
const ins = adjustRowHeightsForRowChange([0.5, 0.5], 2, 1, 1);
check("插入一行：长度 +1 且和 = 1", ins && ins.length === 3 && approx(sum(ins), 1) && approx(ins[1], 1 / 3), JSON.stringify(ins));
const del = adjustRowHeightsForRowChange([0.2, 0.3, 0.5], 3, 1, -1);
check("删除一行：长度 -1、保留其它行并归一", del && del.length === 2 && approx(sum(del), 1) && approx(del[0], 2 / 7) && approx(del[1], 5 / 7), JSON.stringify(del));
check("删除全部行 → null（不再有比例）", adjustRowHeightsForRowChange([1], 1, 0, -1) === null);
check("输入长度与 rows 不一致 → null（不猜）", adjustRowHeightsForRowChange([0.5, 0.5], 3, 0, 1) === null);
const roundTrip = adjustRowHeightsForRowChange(adjustRowHeightsForRowChange([1 / 3, 2 / 3], 2, 0, 2), 4, 1, -2);
check("插入 2 再删除 2 → 长度回到 2 且和 = 1", roundTrip && roundTrip.length === 2 && approx(sum(roundTrip), 1), JSON.stringify(roundTrip));

// 4. Schema warning (not error).
console.log("\n=== 4. table schema：rowHeights 长度 warning ===");
const schemaDeck = {
  version: "v2",
  title: "t",
  size: [960, 540],
  pages: [
    {
      elements: [
        { elementId: "tb", elementType: "table", bounds: [0, 0, 300, 100], rows: [[{ text: "a" }], [{ text: "b" }], [{ text: "c" }]], columnWidths: [1], rowHeights: [0.5, 0.5] },
      ],
    },
  ],
};
const report = validateDeck(schemaDeck);
const rowHeightWarnings = report.warnings.filter((w) => w.elementId === "tb" && /rowHeights/.test(w.message));
check("长度不一致发 warning（不进 errors）", rowHeightWarnings.length === 1 && report.errors.length === 0, `warnings=${report.warnings.length} errors=${report.errors.length}`);
check("warning 消息写明实际/期望", rowHeightWarnings[0] && rowHeightWarnings[0].message.includes("2") && rowHeightWarnings[0].message.includes("3"), rowHeightWarnings[0]?.message);
const validDeck = { ...schemaDeck, pages: [{ elements: [{ ...schemaDeck.pages[0].elements[0], rowHeights: [1 / 3, 1 / 3, 1 / 3] }] }] };
check("长度一致时不产生 rowHeights warning", validateDeck(validDeck).warnings.filter((w) => /rowHeights/.test(w.message)).length === 0);

// 5. frame == writer a:ext cy == totalHeight; renderer box source.
console.log("\n=== 5. frame / a:ext cy / totalHeight 一致 ===");
const deck = {
  version: "v2",
  title: "facts",
  size: [960, 540],
  pages: [
    {
      elements: [
        { elementId: "tb", elementType: "table", bounds: [40, 60, 400, 300], style: "$s11", rows: [[{ text: long }, { text: long }], [{ text: "x" }, { text: "y" }], [{ text: "z" }, { text: "w" }]], columnWidths: [0.5, 0.5] },
      ],
    },
  ],
  theme: { colors: {}, textStyles: {}, tableStyles: styleTheme.tableStyles },
};
const tree = layout(deck);
const le = tree.pages[0].elements[0];
check("layout.frame.h == table.totalHeight", le.frame.h === le.table.totalHeight, `${le.frame.h} vs ${le.table.totalHeight}`);
check("frame.h 不再 max(bounds.h)：声明 300 → 实际 " + le.frame.h, le.frame.h < 300 && le.grown === false);
const pptx = await buildPptx(deck, { iconRegistry: {} });
const slideXml = readText(pptx, "ppt/slides/slide1.xml");
const frameMatch = slideXml.match(/<p:graphicFrame>[\s\S]*?<a:tbl>[\s\S]*?<\/p:graphicFrame>/);
const ext = frameMatch && frameMatch[0].match(/<a:ext cx="(\d+)" cy="(\d+)"\/>/);
const trs = frameMatch ? [...frameMatch[0].matchAll(/<a:tr h="(\d+)"/g)].map((m) => Number(m[1]) / 12700) : [];
check("buildPptx 表格 a:ext cy == totalHeight（px→EMU）", ext && Number(ext[2]) === le.table.totalHeight * 12700, `cy=${ext?.[2]} total=${le.table.totalHeight}`);
check("a:tr h == facts.rowHeights（逐行）", JSON.stringify(trs) === JSON.stringify(le.table.rowHeights), `${JSON.stringify(trs)} vs ${JSON.stringify(le.table.rowHeights)}`);
const rendererSrc = readFileSync(join(ROOT, "packages/renderer/table.js"), "utf8");
check("renderer box 高 = layout facts.totalHeight（源码）", /box\.style\.height\s*=\s*`\$\{lt\.totalHeight\}px`/.test(rendererSrc));
const paintSrc = readFileSync(join(ROOT, "packages/renderer/page.js"), "utf8");
check("paintPage 把 table frame.h 交给 renderer（源码）", /bounds:\s*\[f\.x, f\.y, f\.w, h\]/.test(paintSrc) && /if \(le\.table\) view\.layout = le/.test(paintSrc));

// 6. Writer consumes ctx facts (no measureTable).
console.log("\n=== 6. writer 只吃 ctx facts ===");
const writerSrc = readFileSync(join(ROOT, "packages/writer/table.js"), "utf8");
check("writer/table.js 不含 measureTable（源码）", !/measureTable/.test(writerSrc));
const synthetic = { rowHeights: [11, 12], columnWidths: [1], totalHeight: 23 };
const ctx = { layoutOf: () => ({ table: synthetic }), nextId: () => 7 };
const syntheticXml = tableXml({ colors: {} }, { elementId: "tb", bounds: [0, 0, 100, 500], rows: [[{ text: "a" }], [{ text: "b" }]], columnWidths: [1] }, ctx);
const synExt = syntheticXml.match(/<a:ext cx="(\d+)" cy="(\d+)"\/>/);
const synTr = [...syntheticXml.matchAll(/<a:tr h="(\d+)"/g)].map((m) => Number(m[1]));
check("writer 直接使用注入 facts（不重新测量）", synExt && Number(synExt[2]) === 23 * 12700 && JSON.stringify(synTr) === JSON.stringify([11 * 12700, 12 * 12700]), `cy=${synExt?.[2]} tr=${JSON.stringify(synTr)}`);

console.log(`\n结果: ${ok ? "全部通过 ✅" : "存在失败 ❌"}`);
process.exit(ok ? 0 : 1);
