// ============================================================================
// tests/run-all.mjs — 一键回归（导出全部组件项目 + 全部一致性检查）
// ----------------------------------------------------------------------------
// 用法：node tests/run-all.mjs
// 覆盖：
//   1. 导出 tests/projects/ 下全部组件项目 → tests/projects/<项目>/out/check-<项目>.pptx
//   2. 包内引用一致性（rels/rId/Content_Types）
//   3. 颜色两端一致性（预览 resolveColor vs 导出 schemeClr）
//   4. 预置形状全量回归（187 prst 名 + custGeom 结构）
//   5. 公式转换回归（204 用例 vs 微软官方 XSLT）
//   6. 图标导出回归
//   7. 主题预设一致性（themes.md/代码/行为）
// ============================================================================

import { readFileSync, mkdirSync, writeFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { run } from "./util/run.js";

const ROOT = resolve(".");
// 产物输出到每个项目自己的 out/ 目录（tests/projects/<项目>/out/check-<项目>.pptx）
mkdirSync(resolve("tests"), { recursive: true });

const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
}

// 1. 导出全部组件项目
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
  const deck = await import("../editor/vendor/js-yaml.mjs").then((y) =>
    y.load(readFileSync(join(projectsDir, name, "deck.pptd"), "utf8"))
  );
  const pageCount = (deck.pages || []).length;
  const { code: code2, stdout: out2 } = await run(`node tests/package-integrity.mjs ${out} ${pageCount}`);
  record(`导出 + 包一致性 ${name}（${pageCount} 页）`, code2 === 0, code2 === 0 ? "" : out2.slice(-300));
  if (code2 !== 0) allOk = false;
}

// 2. 其余回归
const suites = [
  ["颜色一致性", "node tests/color-consistency.mjs"],
  ["主题预设一致性", "node tests/theme-presets-consistency.mjs"],
  ["预置形状全量", "node tests/preset-shapes.mjs"],
  ["公式转换", "node tests/formula/test-formula.mjs"],
  ["图标导出", "node tests/icon/test-icon.mjs"],
  ["线条导出", "node tests/line/test-line.mjs"],
  ["本地项目句柄读写", "node tests/handle-io.mjs"],
  ["项目包图片完整性", "node tests/export-media.mjs"],
];
for (const [name, cmd] of suites) {
  const { code, stdout } = await run(cmd);
  const ok = code === 0;
  record(name, ok, ok ? "" : stdout.split("\n").filter((l) => l.includes("✗") || l.includes("失败")).slice(0, 5).join("; "));
  if (!ok) allOk = false;
}

console.log(`\n结果: ${results.filter((r) => r.ok).length}/${results.length} 通过${allOk ? " ✅" : " ❌"}`);
process.exit(allOk ? 0 : 1);
