// ============================================================================
// tests/theme-presets-consistency.mjs — 主题预设一致性回归
// ----------------------------------------------------------------------------
// 守护三处色值同步：editor/core/theme-presets.js（权威源）↔ references/themes.md
// ↔ docs/editor-v2-ux.md §1.3；同时回归 normalizeTheme 字符串预设解析行为。
// 运行：node tests/theme-presets-consistency.mjs
// ============================================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_THEME, THEME_PALETTES, normalizeTheme, themeChartPalette } from "../editor/core/theme.js";

let pass = 0, fail = 0;
const ok = (cond, msg) => {
  if (cond) { pass++; console.log(`  ✓ ${msg}`); }
  else { fail++; console.error(`  ✗ ${msg}`); }
};

const KEYS = ["primary", "accent", "bg", "text", "muted", "line", "success", "warning", "danger",
  "primarySoft", "primaryTint", "primaryDeep", "accent3", "accent4", "accent5", "accent6"];
const ORDER = Object.keys(THEME_PALETTES);
const HEX6 = /^#[0-9A-Fa-f]{6}$/;

console.log("== 1. 预设结构（17 键齐全 + 合法 hex）==");
ok(Object.keys(THEME_PALETTES).length === 10, `共 ${Object.keys(THEME_PALETTES).length} 套预设`);
for (const [k, p] of Object.entries(THEME_PALETTES)) {
  const keysOk = [...Object.keys(p.colors)].sort().join() === [...KEYS].sort().join();
  const hexOk = Object.values(p.colors).every((v) => HEX6.test(v));
  const nameOk = typeof p.name === "string" && p.name.length > 0;
  ok(keysOk && hexOk && nameOk, `${k}「${p.name}」17 键齐全 + hex 合法`);
}
const consult = THEME_PALETTES.consult.colors;
ok(KEYS.every((k) => DEFAULT_THEME.colors[k] === consult[k]), "DEFAULT_THEME.colors == consult（默认主题 = 第 1 套）");

console.log("== 2. references/themes.md 色值表与代码一致 ==");
const md = readFileSync(resolve("references/themes.md"), "utf8");
const mainTbl = md.split("Primary and chart series colors")[1].split("The remaining 11 keys")[0];
for (const row of mainTbl.split("\n").filter((l) => /^\| (consult|tech|orange|green|red|purple|mono|brown|morandi|sakura) \|/.test(l))) {
  const c = row.split("|").map((s) => s.trim());
  const code = ["primary", "accent", "accent3", "accent4", "accent5", "accent6"].map((k) => THEME_PALETTES[c[1]].colors[k].toUpperCase());
  ok(JSON.stringify(c.slice(2, 8)) === JSON.stringify(code), `themes.md 主色表 ${c[1]}`);
}
const restTbl = md.split("The remaining 11 keys")[1].split("> Usage:")[0];
for (const row of restTbl.split("\n").filter((l) => /^\| (text|muted|line|success|warning|danger|primarySoft|primaryTint|primaryDeep) \|/.test(l))) {
  const c = row.split("|").map((s) => s.trim());
  for (let i = 0; i < 10; i++) {
    const doc = c[i + 2].toUpperCase();
    const code = THEME_PALETTES[ORDER[i]].colors[c[1]].toUpperCase();
    if (doc !== code) ok(false, `themes.md ${c[1]} ${ORDER[i]}: ${doc} vs ${code}`);
  }
  ok(true, `themes.md 扩展键表 ${c[1]} × 10 套`);
}

console.log("== 3. normalizeTheme 字符串预设解析（不再静默回退）==");
{
  const t = normalizeTheme("tech");
  ok(t.colors.primary === THEME_PALETTES.tech.colors.primary, `"tech" → primary=${THEME_PALETTES.tech.colors.primary}`);
  ok(KEYS.every((k) => t.colors[k] === THEME_PALETTES.tech.colors[k]), `"tech" → colors 全套命中`);
  ok(JSON.stringify(t.textStyles) === JSON.stringify(DEFAULT_THEME.textStyles), `"tech" → textStyles 用默认`);
  ok(JSON.stringify(t.tableStyles) === JSON.stringify(DEFAULT_THEME.tableStyles), `"tech" → tableStyles 用默认`);
}
{
  const warns = [];
  const orig = console.warn;
  console.warn = (...a) => warns.push(a.join(" "));
  const t = normalizeTheme("no-such-key");
  console.warn = orig;
  ok(JSON.stringify(t.colors) === JSON.stringify(DEFAULT_THEME.colors), `未知键 → 回退默认主题`);
  ok(warns.some((w) => w.includes("未知配色预设")), `未知键 → 输出告警（不再静默）`);
}
{
  const t = normalizeTheme(null);
  ok(JSON.stringify(t.colors) === JSON.stringify(DEFAULT_THEME.colors), "null → 默认主题");
  const t2 = normalizeTheme({ colors: { primary: "#123456" } });
  ok(t2.colors.primary === "#123456" && t2.colors.accent === DEFAULT_THEME.colors.accent, "对象 → 深合并覆盖单键");
}

console.log("== 4. 图表系列色循环（accent1-6 = primary/accent/accent3-6）==");
for (const k of ORDER) {
  const pal = themeChartPalette(normalizeTheme(k));
  const expect = ["primary", "accent", "accent3", "accent4", "accent5", "accent6"].map((x) => THEME_PALETTES[k].colors[x]);
  ok(JSON.stringify(pal) === JSON.stringify(expect), `${k} 系列色 = 预设 6 槽`);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
