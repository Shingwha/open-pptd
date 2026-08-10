#!/usr/bin/env node
// ============================================================================
// dump-formula-mml.mjs — 公式语料 → KaTeX MathML（tests/formula/fixtures/）
// ----------------------------------------------------------------------------
// 用法: npm run test:fixtures（或 node tests/formula/dump-formula-mml.mjs）
// 读取 tests/formula/fixtures/formulas.txt（# 注释、每行一个 LaTeX），
// 用仓库内 vendored KaTeX（editor/vendor/katex.mjs，与编辑器同源）输出
// mml-XX.xml（XX = 用例序号 01..N，与 omml-ai/、omml-js/ 对应）。
// KaTeX 解析失败会以 FAIL 列出（不中断，可继续对照其余用例）。
// ============================================================================

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import katex from "../../editor/vendor/katex.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, "fixtures");
const OUT_DIR = join(FIXTURES, "mml");

const lines = readFileSync(join(FIXTURES, "formulas.txt"), "utf-8")
  .split(/\r?\n/)
  .map((s) => s.trim())
  .filter((s) => s && !s.startsWith("#"));

mkdirSync(OUT_DIR, { recursive: true });
let ok = 0;
const fails = [];
lines.forEach((tex, i) => {
  const name = String(i + 1).padStart(2, "0");
  try {
    const mml = katex.renderToString(tex, { output: "mathml", throwOnError: true, strict: false });
    writeFileSync(join(OUT_DIR, `mml-${name}.xml`), mml);
    ok += 1;
  } catch (e) {
    fails.push(`FAIL ${name}  <-  ${tex.slice(0, 60)}  (${e.message.split("\n")[0].slice(0, 80)})`);
  }
});
console.log(`KaTeX MathML 生成: ${ok}/${lines.length}`);
for (const f of fails) console.log(f);
if (fails.length) process.exit(1);
