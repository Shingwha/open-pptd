// ============================================================================
// tests/run-all.mjs — 一键回归（导出全部组件项目 + 全部自动回归）
// ----------------------------------------------------------------------------
// 用法：node tests/run-all.mjs（npm test）
// 覆盖：
//   1. 导出 tests/projects/ 下全部组件项目 → tests/projects/<项目>/out/check-<项目>.pptx
//      （projects/ 自动发现：新增项目只需放 deck.pptd + pages/，无需改本文件）
//   2. 每个产物过包内引用一致性（tests/regression/package-integrity.mjs）
//   3. tests/regression/ 下全部自动回归套件（见下方 suites 清单）
// 新增回归：把 <名字>.mjs 放进 tests/regression/ 并在 suites 加一行。
// ============================================================================

import { readFileSync, mkdirSync, existsSync, statSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { run } from "./lib/run.js";

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
  const deck = await import("../packages/model/vendor/js-yaml.mjs").then((y) =>
    y.load(readFileSync(join(projectsDir, name, "deck.pptd"), "utf8"))
  );
  const pageCount = (deck.pages || []).length;
  const { code: code2, stdout: out2 } = await run(`node tests/regression/package-integrity.mjs ${out} ${pageCount}`);
  record(`导出 + 包一致性 ${name}（${pageCount} 页）`, code2 === 0, code2 === 0 ? "" : out2.slice(-300));
  if (code2 !== 0) allOk = false;
}

// 2. 自动回归套件（tests/regression/）
const suites = [
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
];
for (const [name, cmd] of suites) {
  const { code, stdout } = await run(cmd);
  const ok = code === 0;
  record(name, ok, ok ? "" : stdout.split("\n").filter((l) => l.includes("✗") || l.includes("失败") || l.includes("FAIL")).slice(0, 5).join("; "));
  if (!ok) allOk = false;
}

console.log(`\n结果: ${results.filter((r) => r.ok).length}/${results.length} 通过${allOk ? " ✅" : " ❌"}`);
process.exit(allOk ? 0 : 1);
