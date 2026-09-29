// ============================================================================
// tests/regression/theme-presets.mjs — theme preset consistency regression
// ----------------------------------------------------------------------------
// Guards the authoritative preset data in packages/model/theme-presets.js
// (17 keys per preset, valid hex, default == first preset) plus normalizeTheme
// string-preset resolution and the chart series-color cycle.
// Usage: node tests/regression/theme-presets.mjs
// ============================================================================

import { DEFAULT_THEME, THEME_PALETTES } from "../../packages/model/theme-presets.js";
import { normalizeTheme, themeChartPalette } from "../../packages/model/theme.js";

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

console.log("== 2. normalizeTheme 字符串预设解析（不再静默回退）==");
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
  // Assert the warning fires and names the offending key (stable input), not its wording.
  ok(warns.length > 0 && warns.some((w) => w.includes("no-such-key")), `未知键 → 输出告警（不再静默）`);
}
{
  const t = normalizeTheme(null);
  ok(JSON.stringify(t.colors) === JSON.stringify(DEFAULT_THEME.colors), "null → 默认主题");
  const t2 = normalizeTheme({ colors: { primary: "#123456" } });
  ok(t2.colors.primary === "#123456" && t2.colors.accent === DEFAULT_THEME.colors.accent, "对象 → 深合并覆盖单键");
}

console.log("== 3. 图表系列色循环（accent1-6 = primary/accent/accent3-6）==");
for (const k of ORDER) {
  const pal = themeChartPalette(normalizeTheme(k));
  const expect = ["primary", "accent", "accent3", "accent4", "accent5", "accent6"].map((x) => THEME_PALETTES[k].colors[x]);
  ok(JSON.stringify(pal) === JSON.stringify(expect), `${k} 系列色 = 预设 6 槽`);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
