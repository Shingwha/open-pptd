#!/usr/bin/env node
// ============================================================================
// test-formula.mjs — MathML→OMML 转换器字节级回归测试
// ----------------------------------------------------------------------------
// 用法: node tests/formula/test-formula.mjs [--verbose]
// 对比 editor/core/mathml2omml.js 的输出与微软官方 MML2OMML.XSL 的固化参考
// （tests/formula/fixtures/omml-ai/），逐字符一致才算通过。
//
// 语料: tests/formula/fixtures/formulas.txt（204 个 LaTeX 用例）
//       mml/     KaTeX 输出（tests/formula/dump-formula-mml.mjs 生成）
//       omml-ai/ 官方 XSLT 参考（tests/formula/formula-oracle.py --batch 生成）
//
// 重新生成参考（改语料后）: npm run test:fixtures
//                           python tests/formula/formula-oracle.py --batch ...
// 日常回归无需 Office：直接使用固化的 omml-ai/。
// 归一化规则与公式研究一致：去 <?xml?> 声明、m:oMath 属性统一。
// 已知差异用例（见 KNOWN-DIFFS.md）：语料保留，输出不一致时仅警告不阻断。
// ============================================================================

import { readFileSync, readdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { mathmlToOmml } from "../../editor/core/mathml2omml.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, "fixtures");
const MML_DIR = join(FIXTURES, "mml");
const REF_DIR = join(FIXTURES, "omml-ai");
if (!existsSync(MML_DIR)) {
  console.error("✗ 缺少 tests/formula/fixtures/mml/（KaTeX 中间产物，不入库）。先运行：npm run test:fixtures");
  process.exit(1);
}
const verbose = process.argv.includes("--verbose");

// 已知差异（见 KNOWN-DIFFS.md）：已全部修复（204/204），列表保留为空哨兵，
// 未来新差异必须显式登记，否则视为回归。
const KNOWN_DIFFS = new Map([]);

const no = (f) => Number(f.replace(/^mml-|\.xml$/g, ""));

/** 与官方产物对齐的归一化：去 XML 声明 + m:oMath 属性归一。 */
const norm = (s) => s.replace(/<\?xml[^>]*\?>\s*/g, "").replace(/<m:oMath[^>]*>/, "<m:oMath>").trim();

const files = readdirSync(MML_DIR).filter((f) => f.endsWith(".xml")).sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
let pass = 0;
let known = 0;
const fails = [];
for (const f of files) {
  const n = no(f);
  const mml = readFileSync(join(MML_DIR, f), "utf-8");
  // omml-ai/ 命名与 mml/ 对应（去 mml- 前缀）：mml-03.xml ↔ 03.xml
  const refName = f.replace(/^mml-/, "");
  const ref = readFileSync(join(REF_DIR, refName), "utf-8");
  let mine;
  try {
    mine = norm(mathmlToOmml(mml));
  } catch (e) {
    fails.push({ f, err: `转换器异常: ${e.message.slice(0, 100)}` });
    continue;
  }
  const refNorm = norm(ref);
  if (mine === refNorm) {
    pass += 1;
    if (verbose) console.log(`✓ ${f}`);
    continue;
  }
  // 已知差异：警告不阻断（语料保留覆盖，修复转换器后自动转正）
  if (KNOWN_DIFFS.has(n)) {
    known += 1;
    console.warn(`⚠ ${f} [已知差异] ${KNOWN_DIFFS.get(n)}`);
    continue;
  }
  // 定位第一个差异
  let i = 0;
  while (i < Math.min(mine.length, refNorm.length) && mine[i] === refNorm[i]) i++;
  fails.push({
    f,
    err: `diff @${i}\n    mine: …${mine.slice(Math.max(0, i - 60), i + 120)}…\n    ref : …${refNorm.slice(Math.max(0, i - 60), i + 120)}…`,
  });
}
console.log(`\n公式转换回归: ${pass}/${files.length} 与官方 XSLT 字节一致`);
if (known) console.log(`已知差异（见 KNOWN-DIFFS.md）: ${known} 个，警告不阻断`);
for (const fail of fails) {
  console.log(`✗ ${fail.f}`);
  if (verbose) console.log("   " + fail.err.replace(/\n/g, "\n   "));
}
process.exit(fails.length ? 1 : 0);
