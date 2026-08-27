// ============================================================================
// tests/regression/validate.mjs — 校验器回归（model/validate.js + check 命令 + 导出闸门）
// ----------------------------------------------------------------------------
// 1. examples/ 全部画廊项目：0 error（warning 允许，是设计提示）
// 2. 合成坏 deck：schema error 必须被抓到（未知类型 / 负宽高 / 缺必填字段）
// 3. 导出闸门：坏 deck 走 exportDeck 必须被阻断
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

// ---- 1. examples 全量 0 error ----
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

// ---- 2. 合成坏 deck：各类 error 必须命中 ----
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
const rulesHit = new Set(bad.errors.map((e) => e.message));
check("未知 elementType 被抓", [...rulesHit].some((m) => m.includes("未知 elementType")));
check("负宽高被抓", [...rulesHit].some((m) => m.includes("宽高必须为正")));
check("text 缺 content 被抓", [...rulesHit].some((m) => m.includes("content.text")));
check("shape 缺 shapeName 被抓", [...rulesHit].some((m) => m.includes("shapeName")));

// ---- 3. 好 deck 0 error（含数字 text 的 YAML 宽容）----
const goodDeck = {
  version: "v2",
  title: "ok",
  size: [960, 540],
  pages: [
    { elements: [{ elementId: "t1", elementType: "text", bounds: [10, 10, 100, 40], content: { text: 2024, fontSize: 20 } }] },
  ],
};
check("数字 content.text 不误报（YAML 01/2024 → number）", validateDeck(goodDeck).errors.length === 0);

// ---- 4. 导出闸门：坏 deck 写盘后 export 必须失败 ----
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

process.exit(ok ? 0 : 1);
