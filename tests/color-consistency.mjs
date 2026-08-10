// ============================================================================
// tests/color-consistency.mjs — 预览端 vs 导出端颜色一致性回归
// ----------------------------------------------------------------------------
// 背景：编辑器预览用 resolveColor（hex），导出用 colorElement（schemeClr /
// srgbClr）。两者语义必须一致，否则出现「网页颜色 ≠ PowerPoint 颜色」。
// 本测试遍历测试项目的全部颜色字段（元素/背景/textStyles 内 $ 令牌与 hex），
// 分别按预览链路与导出链路解析，比对最终色值（含 alpha）。
// 运行：node tests/color-consistency.mjs [项目目录，默认 tests/projects/text]
// ============================================================================

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import yaml from "../editor/vendor/js-yaml.mjs";
import { normalizeTheme, resolveColor } from "../editor/core/theme.js";
import { colorElement } from "../editor/writer/drawing.js";
import { themeColorSlots } from "../editor/writer/parts.js";

const projectDir = process.argv[2] || "tests/projects/text";
const manifestPath = join(projectDir, "deck.pptd");
if (!existsSync(manifestPath)) {
  console.error(`✗ 找不到项目 manifest: ${manifestPath}`);
  process.exit(1);
}

const deck = yaml.load(readFileSync(manifestPath, "utf8"));
const theme = normalizeTheme(deck.theme);
const slots = themeColorSlots(theme);

/** 导出端颜色 → 可比较字符串（hex + alpha）。 */
function exportedColor(theme, val) {
  const el = colorElement(theme, val);
  if (el.includes("schemeClr")) {
    const m = el.match(/val="(\w+)"/);
    const slot = slots[m?.[1]] || "";
    return { hex: slot.replace("#", "").toUpperCase(), alpha: null, note: `${m?.[1]}→${slot}` };
  }
  const m = el.match(/<a:srgbClr val="([0-9A-F]+)"(?:>[\s\S]*?<a:alpha val="(\d+)")?/);
  if (!m) return null;
  return { hex: m[1], alpha: m[2] ? Number(m[2]) / 100000 : null, note: "srgbClr" };
}

let pass = 0, fail = 0;
const seen = new Set();

function checkColor(path, val) {
  const key = `${path}=${val}`;
  if (seen.has(key) || typeof val !== "string") return;
  seen.add(key);
  if (!val.startsWith("$") && !val.startsWith("#")) return;
  const preview = resolveColor(theme, val);
  const exported = exportedColor(theme, val);
  if (!exported) { fail++; console.log(`✗ ${path} 值=${val} 导出端无法解析`); return; }
  // 预览 #RRGGBBAA → hex+alpha；导出 srgbClr val + a:alpha
  const pHex = preview ? preview.replace("#", "").slice(0, 6).toUpperCase() : null;
  const pAlpha = preview && preview.length === 9 ? parseInt(preview.slice(7, 9), 16) / 255 : null;
  const hexOk = pHex != null && pHex === exported.hex;
  // alpha：预览 0.5 ≈ 导出 50000/100000；未显式比较时（null）视为一致
  const alphaOk = exported.alpha == null || pAlpha == null || Math.abs(exported.alpha - pAlpha) < 0.01;
  if (hexOk && alphaOk) {
    pass++;
  } else {
    fail++;
    console.log(`✗ ${path}\n    值=${val}  预览=${preview}  导出=${exported.hex}${exported.alpha != null ? " alpha=" + Math.round(exported.alpha * 100) + "%" : ""}（${exported.note}）`);
  }
}

/** 颜色字段键（其余键即使字符串也不检查，避免把文本内容误判为颜色）。 */
const COLOR_KEYS = new Set(["color", "backgroundColor", "fill", "lineColor", "areaColor", "headerColor"]);

function walkColor(v, path) {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    for (const [k, val] of Object.entries(v)) walkColor(val, `${path}.${k}`);
  } else if (typeof v === "string") {
    const key = String(path).split(".").pop();
    if (COLOR_KEYS.has(key)) checkColor(path, v);
  }
}

for (const rel of deck.pages || []) {
  const pagePath = join(projectDir, rel);
  if (!existsSync(pagePath)) continue;
  const page = yaml.load(readFileSync(pagePath, "utf8"));
  for (let i = 0; i < (page.elements || []).length; i++) {
    walkColor(page.elements[i], `${rel} elements[${i}]`);
  }
  if (page.background) walkColor(page.background, `${rel} background`);
}
for (const [k, v] of Object.entries(deck.theme?.textStyles || {})) walkColor(v, `theme.textStyles.${k}`);
for (const [k, v] of Object.entries(deck.theme?.colors || {})) walkColor(v, `theme.colors.${k}`);

// —— buildFill 官方 SolidFill 回归（2026-08-10：清理时删 fill.color 兜底分支后，
//    所有 {type:"solid", color} 填充返回空 → 表格填充/页面背景全丢）——
{
  const { buildFill } = await import("../editor/writer/drawing.js");
  const cases = [
    { type: "solid", color: "#0F172A" },
    { type: "solid", color: "$primary" },
    { type: "solid", color: "#12345678" },
  ];
  for (const fill of cases) {
    const out = buildFill(theme, fill);
    if (typeof out === "string" && out.includes("solidFill") && out.includes("Clr")) {
      pass++;
    } else {
      fail++;
      console.log(`✗ buildFill ${JSON.stringify(fill)} → ${JSON.stringify(out)}（官方 SolidFill 应输出 solidFill）`);
    }
  }
  // 渐变/字符串色不受影响
  const grad = buildFill(theme, { type: "gradient", gradientType: "linear", stops: [{ position: 0, color: "#000000" }, { position: 1, color: "#FFFFFF" }] });
  if (typeof grad === "string" && grad.includes("gradFill")) pass++;
  else { fail++; console.log(`✗ buildFill 渐变 → ${JSON.stringify(grad)}`); }
  const str = buildFill(theme, "#0F172A");
  if (typeof str === "string" && str.includes("solidFill")) pass++;
  else { fail++; console.log(`✗ buildFill 字符串色 → ${JSON.stringify(str)}`); }
}

console.log(`\n颜色一致性: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
