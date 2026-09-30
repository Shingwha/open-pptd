// ============================================================================
// tests/run-all.mjs — one-shot regression (export every component project + all suites)
// ----------------------------------------------------------------------------
// Usage: node tests/run-all.mjs (npm test)
// Covers:
//   1. Export every component project under tests/projects/ → tests/projects/<name>/out/check-<name>.pptx
//      (projects are auto-discovered: adding one only needs deck.pptd + pages/, no edit here)
//   2. Run in-package reference integrity on each artifact (tests/regression/package-integrity.mjs)
//   3. Every automated suite under tests/contract/ and tests/regression/ (see the suites list below)
// Adding a regression: drop <name>.mjs into tests/regression/ and add one line to suites.
// ============================================================================

import { readFileSync, mkdirSync, existsSync, statSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { run } from "./lib/run.js";

// Artifacts go to each project's own out/ directory (tests/projects/<name>/out/check-<name>.pptx)
mkdirSync(resolve("tests"), { recursive: true });

const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
}

// 1. Export every component project
const projectsDir = resolve("tests/projects");
const projects = readdirSync(projectsDir)
  .filter((name) => statSync(join(projectsDir, name)).isDirectory() && existsSync(join(projectsDir, name, "deck.pptd")))
  .sort();

let allOk = true;
for (const name of projects) {
  const out = join(projectsDir, name, "out", `check-${name}.pptx`);
  mkdirSync(join(projectsDir, name, "out"), { recursive: true });
  const { code, stdout } = await run(`node bin/open-pptd.js export tests/projects/${name}/deck.pptd -o ${out}`);
  if (code !== 0) {
    record(`导出 ${name}`, false, stdout.slice(-200));
    allOk = false;
    continue;
  }
  const deck = await import("../packages/model/vendor/js-yaml.mjs").then((y) =>
    y.load(readFileSync(join(projectsDir, name, "deck.pptd"), "utf8"))
  );
  const pageCount = (deck.pages || []).length;
  const { code: code2, stdout: out2 } = await run(`node tests/regression/package-integrity.mjs ${out} ${pageCount}`);
  record(`导出 + 包一致性 ${name}（${pageCount} 页）`, code2 === 0, code2 === 0 ? "" : out2.slice(-300));
  if (code2 !== 0) allOk = false;
}

// 2. Automated suites (tests/contract/ + tests/regression/)
const suites = [
  // Package-level public contract (tests/contract/, contract 4): barrel export surface,
  // CONTRACT_VERSION, contract.json ↔ package.json exports drift, editor/main.js boot seam.
  // Fast and artifact-free — run before the regression suites so interface breakage is visible first.
  ["包级公开契约（contract 4）", "node tests/contract/public-api.mjs"],
  ["依赖方向与环境全局", "node tests/regression/dep-graph.mjs"],
  ["背景尺寸随 deck.size", "node tests/regression/background-size.mjs"],
  ["校验器与导出闸门", "node tests/regression/validate.mjs"],
  ["颜色一致性", "node tests/regression/color-consistency.mjs"],
  ["主题预设一致性", "node tests/regression/theme-presets.mjs"],
  ["预置形状全量", "node tests/regression/preset-shapes.mjs"],
  ["公式转换", "node tests/regression/formula.mjs"],
  ["图标导出", "node tests/regression/icon.mjs"],
  ["线条导出", "node tests/regression/line.mjs"],
  ["本地项目句柄读写", "node tests/regression/handle-io.mjs"],
  ["项目包图片完整性", "node tests/regression/export-media.mjs"],
  ["资源路径解析（契约 5）", "node tests/regression/resource-paths.mjs"],
  ["排版度量（measure）", "node tests/regression/measure.mjs"],
  ["布局与越界事实（layout）", "node tests/regression/layout.mjs"],
  // UI literal gate (spec 2026-09-30-ui-redesign-line T2): color literals only in tokens.css,
  // box-shadow only through var(--shadow-*); frozen whitelist for the data-grid inset fills
  ["UI 令牌字面量门禁", "node tests/regression/ui-token-literals.mjs"],
  ["智能参考线吸附（align-guides）", "node tests/regression/align-guides.mjs"],
];
for (const [name, cmd] of suites) {
  const { code, stdout } = await run(cmd);
  const ok = code === 0;
  record(name, ok, ok ? "" : stdout.split("\n").filter((l) => l.includes("✗") || l.includes("失败") || l.includes("FAIL")).slice(0, 5).join("; "));
  if (!ok) allOk = false;
}

console.log(`\n结果: ${results.filter((r) => r.ok).length}/${results.length} 通过${allOk ? " ✅" : " ❌"}`);
process.exit(allOk ? 0 : 1);
