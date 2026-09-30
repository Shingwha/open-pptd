// ============================================================================
// tests/regression/ui-token-literals.mjs — UI literal-token gate (Line pass, spec 05 T2)
// ----------------------------------------------------------------------------
// Static scan of editor/styles/*.css, enforcing the "values only live in tokens.css" rule
// (ref/dsh-theme-requirements.md §4.4):
//   1. Color literals (#hex3/4/6/8, rgb()/rgba(), hsl()/hsla()) may only appear in
//      tokens.css. present.css is exempt as a whole file (the projection surface paints
//      on arbitrary media); commented-out text does not count (comments quote values).
//   2. Every box-shadow declaration outside tokens.css must reference a --shadow-* token.
//      The frozen whitelist below holds the only non-projection use in the repo (an inset
//      fill overlay in the data grid, a file this wave does not own); the assertion fails
//      both when a new violation appears and when a whitelist entry goes stale, so the
//      exemption count can only shrink.
//   3. Sanity: tokens.css is part of the scan and declares the four shadow steps — a moved
//      directory or renamed sheet must break this gate loudly instead of scanning nothing.
// Usage: node tests/regression/ui-token-literals.mjs (prints file:line, non-zero exit on failure)
// ============================================================================

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const STYLES = join(ROOT, "editor", "styles");
const rel = (p) => relative(ROOT, p).split(sep).join("/");

// Source of truth for every themed value; present.css paints on arbitrary media and is exempt
const COLOR_SOURCE = "editor/styles/tokens.css";
const COLOR_EXEMPT_FILES = ["editor/styles/present.css"];

// Frozen box-shadow exemptions (file + normalized value). Registered one by one with a
// reason, like tests/regression/dep-graph.mjs's ALLOWLIST: a new entry needs a review,
// and an entry that no longer matches is reported as stale.
const BOX_SHADOW_WHITELIST = [
  {
    file: "panels.css",
    value: "inset 0 0 0 999px var(--primary-soft)",
    reason: "data-grid selected cell: an inset fill overlay (a background on the td would lose to the inline style), not a projection",
  },
  {
    file: "panels.css",
    value: "inset 0 0 0 999px var(--primary-tint)",
    reason: "data-grid region cell: same inset fill overlay mechanism as the selected cell",
  },
];

// ---- Scanners ----
// Comment stripping keeps line numbers (comment text becomes spaces) so reports point at
// the real source line while commented-out values stay out of the count.
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));

// #hex (3/4/6/8 digits; the lookahead rejects selectors like #add-menu) plus the two
// functional color notations. Case-insensitive; color-mix()/srgb stay out of the match.
const hasColorLiteral = (text) => /#(?:[0-9a-f]{3,8})(?![0-9a-z_-])|\brgba?\s*\(|\bhsla?\s*\(/i.test(text);

// A declaration statement that STARTS with box-shadow (so the property lists of
// `transition: ..., box-shadow ...` never match) up to the closing ; or }.
const BOX_SHADOW_DECL_RE = /(^|[;{}])\s*box-shadow\s*:\s*([^;}]*)/gm;
const normalize = (v) => v.replace(/\s+/g, " ").trim();

/** Every box-shadow declaration in a (comment-stripped) sheet, with its line number. */
function boxShadowDecls(src) {
  const out = [];
  for (const m of src.matchAll(BOX_SHADOW_DECL_RE)) {
    // Report the line of the box-shadow keyword itself: the statement can start at a
    // preceding `;`/`{` that sits several lines above (blanked comment in between).
    const line = src.slice(0, m.index + m[0].indexOf("box-shadow")).split("\n").length;
    out.push({ line, value: normalize(m[2]) });
  }
  return out;
}

// ---- Collect files ----
let pass = 0, fail = 0;
const ok = (cond, msg) => {
  if (cond) { pass++; console.log(`  ✓ ${msg}`); }
  else { fail++; console.error(`  ✗ ${msg}`); }
};

if (!existsSync(STYLES)) {
  console.error(`✗ 找不到样式目录 ${rel(STYLES)}`);
  process.exit(1);
}
const files = readdirSync(STYLES).filter((f) => f.endsWith(".css")).sort();

// ---- 1. Color literals only in tokens.css ----
console.log("== 1. 颜色字面量只允许在 tokens.css ==");
const colorViolations = [];
let scanned = 0;
for (const name of files) {
  const r = rel(join(STYLES, name));
  if (COLOR_EXEMPT_FILES.includes(r)) continue;
  if (r === COLOR_SOURCE) continue;
  scanned++;
  const lines = stripComments(readFileSync(join(STYLES, name), "utf8")).split("\n");
  lines.forEach((line, i) => {
    if (hasColorLiteral(line)) colorViolations.push(`${r}:${i + 1}  ${line.trim().slice(0, 110)}`);
  });
}
ok(scanned >= 6, `扫描 ${scanned} 个样式文件（豁免 ${COLOR_EXEMPT_FILES.length} 个：投影面）`);
ok(colorViolations.length === 0, colorViolations.length === 0
  ? "tokens.css 之外无颜色字面量"
  : `tokens.css 之外出现颜色字面量 ${colorViolations.length} 处`);
for (const v of colorViolations) console.error(`    ${v}`);

// ---- 2. box-shadow only references --shadow-* ----
console.log("== 2. box-shadow 只允许 var(--shadow-*) ==");
const shadowViolations = [];
const whitelistUsed = new Set();
for (const name of files) {
  if (name === "tokens.css") continue;
  const r = rel(join(STYLES, name));
  for (const { line, value } of boxShadowDecls(stripComments(readFileSync(join(STYLES, name), "utf8")))) {
    const refs = [...value.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)/g)].map((m) => m[1]);
    if (refs.length && refs.every((n) => n.startsWith("--shadow-")) && !hasColorLiteral(value)) continue;
    const hit = BOX_SHADOW_WHITELIST.findIndex((w) => w.file === name && w.value === value);
    if (hit >= 0) { whitelistUsed.add(hit); continue; }
    shadowViolations.push(`${r}:${line}  box-shadow: ${value.slice(0, 110)}`);
  }
}
ok(whitelistUsed.size === BOX_SHADOW_WHITELIST.length, whitelistUsed.size === BOX_SHADOW_WHITELIST.length
  ? `冻结豁免 ${BOX_SHADOW_WHITELIST.length} 处仍然存在（panels.css 数据网格 inset 填充）`
  : `冻结豁免失效 ${BOX_SHADOW_WHITELIST.length - whitelistUsed.size} 处，请核对后更新白名单`);
ok(shadowViolations.length === 0, shadowViolations.length === 0
  ? "无新增 box-shadow 违规（非 var(--shadow-*) 值）"
  : `出现非 --shadow-* 的 box-shadow ${shadowViolations.length} 处`);
for (const v of shadowViolations) console.error(`    ${v}`);

// ---- 3. Gate sanity: the source of truth is in the scan and complete ----
console.log("== 3. 门禁自身健全性 ==");
ok(files.includes("tokens.css"), "tokens.css 在扫描范围内（值来源未被整体豁免）");
const tokens = existsSync(join(STYLES, "tokens.css")) ? readFileSync(join(STYLES, "tokens.css"), "utf8") : "";
const missing = ["--shadow-sm", "--shadow-md", "--shadow-lg", "--shadow-sheet"].filter(
  (t) => !new RegExp(`^\\s*${t}\\s*:`, "m").test(tokens)
);
ok(missing.length === 0, missing.length === 0 ? "tokens.css 声明四档 --shadow-*" : `tokens.css 缺少阴影令牌：${missing.join(", ")}`);

console.log(`\n结果: ${pass}/${pass + fail} 通过${fail === 0 ? " ✅" : " ❌"}`);
process.exit(fail === 0 ? 0 : 1);
