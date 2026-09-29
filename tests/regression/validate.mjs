// ============================================================================
// tests/regression/validate.mjs — validator regression (model/validate.js + check command + export gate)
// ----------------------------------------------------------------------------
// 1. Every gallery project under examples/: 0 errors (warnings allowed by design)
// 2. Synthetic bad deck: schema errors must be caught (unknown type / negative size / missing required field)
// 3. Export gate: a bad deck must be blocked by exportDeck
// ============================================================================

import { readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { validateDeck } from "../../packages/model/validate.js";
import { checkDeck } from "../../packages/cli/check.js";
import { exportDeck } from "../../packages/cli/export.js";

let ok = true;
function check(name, cond, detail = "") {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) ok = false;
}

// ---- 1. full examples sweep: 0 errors ----
const examplesDir = resolve("examples");
const decks = readdirSync(examplesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(examplesDir, d.name, "deck.pptd")))
  .map((d) => join(examplesDir, d.name, "deck.pptd"));
let clean = 0;
for (const manifest of decks) {
  const { report } = checkDeck(manifest);
  if (report.errors.length === 0) clean += 1;
  else console.log(`  ✗ ${manifest} 有 ${report.errors.length} 个错误: ${report.errors[0].message}`);
}
check(`examples 全量校验 0 error（${clean}/${decks.length}）`, clean === decks.length);

// ---- 2. synthetic bad deck: each error class must be hit ----
const badDeck = {
  version: "v2",
  title: "bad",
  size: [960, 540],
  pages: [
    {
      elements: [
        { elementId: "a", elementType: "widget", bounds: [0, 0, 10, 10] },
        { elementId: "b", elementType: "text", bounds: [0, 0, -5, 10], content: { text: "hi" } },
        { elementId: "c", elementType: "text", bounds: [0, 0, 10, 10] },
        { elementId: "d", elementType: "shape", bounds: [0, 0, 10, 10] },
      ],
    },
  ],
};
const bad = validateDeck(badDeck);
// Assert on stable identifiers only (rule key + elementId), never on the wording of
// user-facing messages: any copy edit to a Chinese message must not break this suite.
const errsFor = (id) => bad.errors.filter((e) => e.elementId === id);
check("未知 elementType 被抓", errsFor("a").some((e) => e.rule === "schema"));
check("负宽高被抓", errsFor("b").some((e) => e.rule === "schema"));
check("text 缺 content 被抓", errsFor("c").some((e) => e.rule === "schema-type"));
check("shape 缺 shapeName 被抓", errsFor("d").some((e) => e.rule === "schema-type"));

// ---- 3. good deck: 0 errors (incl. YAML leniency for numeric text) ----
const goodDeck = {
  version: "v2",
  title: "ok",
  size: [960, 540],
  pages: [
    { elements: [{ elementId: "t1", elementType: "text", bounds: [10, 10, 100, 40], content: { text: 2024, fontSize: 20 } }] },
  ],
};
check("数字 content.text 不误报（YAML 01/2024 → number）", validateDeck(goodDeck).errors.length === 0);

// ---- 4. export gate: a bad deck written to disk must fail export ----
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
const dir = mkdtempSync(join(tmpdir(), "pptd-validate-"));
mkdirSync(join(dir, "pages"), { recursive: true });
writeFileSync(join(dir, "deck.pptd"), "version: v2\ntitle: bad\npages:\n  - pages/p1.page\n");
writeFileSync(join(dir, "pages", "p1.page"), "elements:\n  - elementId: x\n    elementType: widget\n    bounds: [0, 0, 10, 10]\n");
let blocked = false;
try {
  await exportDeck({ manifest: join(dir, "deck.pptd"), outPath: join(dir, "out.pptx") });
} catch {
  blocked = true;
}
rmSync(dir, { recursive: true, force: true });
check("导出闸门阻断坏 deck", blocked);

// ---- 5. geometry facts (LayoutTree overflow): passing layout reports out-of-canvas/overlap
//         precisely (the old "text overflows 2× box height" heuristic was removed; this now
//         consumes the deterministic layout fact) ----
import { layout } from "../../packages/layout/index.js";

const geoDeck = {
  version: "v2",
  title: "geo",
  size: [960, 540],
  pages: [
    {
      elements: [
        // declared height 30, content far taller → layout grows it over the shape below and past the canvas
        { elementId: "t1", elementType: "text", bounds: [40, 480, 200, 30], content: { text: "很长的中文内容用于验证溢出与重叠事实。".repeat(6), fontSize: 18 } },
        { elementId: "box", elementType: "shape", shapeName: "rect", bounds: [40, 500, 200, 40] },
      ],
    },
  ],
};
const noLayout = validateDeck(geoDeck);
const withLayout = validateDeck(geoDeck, { layout: layout(geoDeck) });
const geometryWarnings = (r, id) => r.warnings.filter((w) => w.rule === "geometry" && (!id || w.elementId === id));
check("未传 layout：不报布局越界/重叠（旧启发式已删）", geometryWarnings(noLayout).length === 0);
check("传 layout：报出实际几何越界（几何事实接入）", geometryWarnings(withLayout, "t1").length > 0);

// A tall table pushes the element below it
const tblDeck = {
  version: "v2",
  title: "tbl",
  size: [960, 540],
  pages: [
    {
      elements: [
        {
          elementId: "tb",
          elementType: "table",
          bounds: [60, 100, 300, 40],
          rows: [
            [{ text: "表头" }, { text: "说明" }],
            [{ text: "很长的单元格中文内容需要换行很多行来把表格撑高一些" }, { text: "x" }],
          ],
          columnWidths: [0.5, 0.5],
        },
        { elementId: "under", elementType: "shape", shapeName: "rect", bounds: [60, 130, 300, 30] },
      ],
    },
  ],
};
const tblReport = validateDeck(tblDeck, { layout: layout(tblDeck) });
// tb stays inside the canvas, so the only geometry fact it can raise is the overlap with "under".
check("表格撑高后压下方元素被抓", geometryWarnings(tblReport, "tb").length > 0);

process.exit(ok ? 0 : 1);
