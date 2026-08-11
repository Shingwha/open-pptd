// ============================================================================
// tests/icon/test-icon.mjs — 图标导出回归（SVG 嵌入方案）
// ----------------------------------------------------------------------------
// 验证「预览 = 导出」同源：
//   1. 192 个图标 iconToSvg 全部生成成功（无解析异常）
//   2. 全图标 buildPptx 导出成功，包结构对齐官方格式
//      （media/*.svg + asvg:svgBlip + Content_Types svg 声明 + image rels）
//   3. 预览渲染的 SVG body 与导出写入文件的 body 字节一致（同源）
// 运行：node tests/icon/test-icon.mjs
// ============================================================================

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ICONS } from "../../editor/core/icon-library.js";
import { iconToSvg, iconSvgBody, normalizeIconFill } from "../../editor/core/icon-svg.js";
import { buildPptx } from "../../editor/writer/pptx.js";
import { unzip } from "../util/unzip.js";
import { DEFAULT_THEME } from "../../editor/core/theme.js";

let pass = 0, fail = 0;
const ok = (cond, msg) => {
  if (cond) { pass++; console.log(`  ✓ ${msg}`); }
  else { fail++; console.error(`  ✗ ${msg}`); }
};

// 与导出端相同的默认主题（不写死色值，避免默认配色更新后同源断言失效）
const theme = { colors: { ...DEFAULT_THEME.colors } };

console.log("== 1. 192 图标 iconToSvg 生成（含弧/fill-rule/多子路径）==");
const keys = Object.keys(ICONS);
let svgBodies = {};
for (const key of keys) {
  try {
    const fill = normalizeIconFill(theme, { color: "$primary" });
    svgBodies[key] = iconSvgBody(ICONS[key], fill, "ig-test");
    const svg = iconToSvg(ICONS[key], fill);
    if (!svg.includes("<svg") || !svg.includes("<path")) throw new Error("结构异常");
  } catch (e) {
    fail++;
    console.error(`  ✗ ${key}: ${e.message}`);
  }
}
ok(Object.keys(svgBodies).length === keys.length, `全部 ${keys.length} 个图标生成成功`);
// 抽样：fill-rule 保留、主题色解析
const graphUp = svgBodies["graph-up"];
ok(graphUp.includes('fill-rule="evenodd"'), "graph-up 保留 fill-rule=evenodd");
ok(graphUp.includes(DEFAULT_THEME.colors.primary), "主题令牌 $primary 解析为默认主色 " + DEFAULT_THEME.colors.primary);
const bullseye = svgBodies["bullseye"];
ok(bullseye.includes("A7 7") && bullseye.includes("a7 7"), "bullseye 弧命令原样保留（零转换）");

console.log("== 2. 全图标导出 → 包结构对齐官方格式 ==");
const elements = keys.map((key, i) => ({
  elementId: `ic-${i}`, elementType: "icon", iconName: `bs:${key}`,
  bounds: [20 + (i % 16) * 58, 16 + Math.floor(i / 16) * 42, 32, 32],
  fill: { type: "solid", color: i % 3 === 0 ? "$primary" : i % 3 === 1 ? "$accent" : "$text" },
}));
const deck = {
  version: "v2", title: "图标回归测试", theme: {}, size: [960, 540],
  pages: [{ pageType: "content", background: { type: "solid", color: "#FFFFFF" }, elements }],
};
const bytes = await buildPptx(deck);
const dir = mkdtempSync(join(tmpdir(), "icon-test-"));
try {
  const files = unzip(bytes, dir);
  const svgCount = files.filter((f) => f.endsWith(".svg")).length;
  ok(svgCount === keys.length, `media 含 ${svgCount} 个 SVG（= 图标数）`);

  const slide = readFileSync(join(dir, "ppt/slides/slide1.xml"), "utf8");
  ok((slide.match(/<p:pic>/g) || []).length === keys.length, "slide1 含全部 p:pic");
  ok(slide.includes('<asvg:svgBlip xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main" r:embed='), "asvg:svgBlip 结构（官方 ext uri + 内联命名空间）");
  ok(slide.includes('uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}"'), "官方 SVG ext uri");

  const ct = readFileSync(join(dir, "[Content_Types].xml"), "utf8");
  ok(ct.includes('Extension="svg" ContentType="image/svg+xml"'), "[Content_Types] 声明 svg");

  const rels = readFileSync(join(dir, "ppt/slides/_rels/slide1.xml.rels"), "utf8");
  ok(rels.includes("/relationships/image") && rels.includes(".svg"), "rels 使用标准 image 类型指向 svg");

  console.log("== 3. 预览 body 与导出 SVG 字节一致（同源）==");
  // 抽查 5 个代表性图标：导出文件内容 == 预览 body 内容
  const samples = ["bullseye", "check-circle", "gear", "graph-up", "arrow-right"];
  for (const key of samples) {
    const idx = keys.indexOf(key);
    const mediaFile = files.find((f) => f.includes(`image${idx + 1}.svg`));
    if (!mediaFile) { ok(false, `${key} 的 SVG 文件存在`); continue; }
    const onDisk = readFileSync(join(dir, mediaFile), "utf8").trim();
    const fill = normalizeIconFill(theme, { color: idx % 3 === 0 ? "$primary" : idx % 3 === 1 ? "$accent" : "$text" });
    const expected = `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">${iconSvgBody(ICONS[key], fill)}</svg>`.trim();
    ok(onDisk === expected, `${key}: 磁盘 SVG == 预览 SVG body（字节一致）`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
