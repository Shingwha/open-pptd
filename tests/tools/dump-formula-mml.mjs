#!/usr/bin/env node
// ============================================================================
// dump-formula-mml.mjs — formula corpus → KaTeX MathML (tests/fixtures/formula/)
// ----------------------------------------------------------------------------
// Usage: npm run test:fixtures (or node tests/tools/dump-formula-mml.mjs)
// Reads tests/fixtures/formula/formulas.txt (# comments, one LaTeX per line) and,
// with the vendored KaTeX (packages/model/vendor/katex.mjs, same source as the
// editor), writes mml-XX.xml (XX = case number 01..N, matching omml-ai/).
// A KaTeX parse failure is listed as FAIL (it does not abort; the other cases still run).
// ============================================================================

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import katex from "../../packages/model/vendor/katex.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, "..", "fixtures", "formula");
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
