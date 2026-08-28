#!/usr/bin/env node
// ============================================================================
// gen-icons.mjs — 从本地 icons/ 源目录生成内置图标库数据 + 图标参考文档
// ----------------------------------------------------------------------------
// 源：assets/icons/*.svg —— Bootstrap Icons 原始 SVG（MIT License,
//     Copyright (c) 2019-2024 The Bootstrap Authors, https://github.com/twbs/icons）
//     viewBox 16×16，填充式（fill-rule 见文件内属性）
// 索引：assets/icons/index.json —— { key: { label 中文名, cat 分类 } }
// 输出 1：packages/model/icon-library.js（AUTO-GENERATED，勿手改）
// 输出 2：references/icons.md（AUTO-GENERATED）—— 给生成模型看的图标清单
//         （bs: 直接引用 + fas:/far: 的 FA 语义映射表，避免用库外图标导出被跳过）
// 用法：node scripts/gen-icons.mjs            # 全量重新生成（离线可用）
//       node scripts/gen-icons.mjs --check    # 校验两份产物与 icons/ 一致（CI）
// 新增图标：把上游 SVG 放入 assets/icons/<key>.svg，index.json 加 {key: {label, cat}}，重跑本脚本。
// ============================================================================

import { writeFileSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FA_TO_BS } from "../packages/model/icon-name.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ICONS_DIR = join(ROOT, "assets", "icons");
const OUT_LIB = join(ROOT, "packages", "model", "icon-library.js");
const OUT_DOC = join(ROOT, "references", "icons.md");
const CHECK = process.argv.includes("--check");

/** 提取 <path d="..." fill-rule? />（Bootstrap 原始 SVG 固定格式，字符串解析即可）。
 *  个别图标用 <circle cx cy r>（如 circle-fill）：无 path 时转换为等效圆弧 path。 */
function extractPath(svg) {
  const paths = [];
  const re = /<path\b([^>]*)\bd="([^"]*)"([^>]*)\/?>/g;
  let m;
  while ((m = re.exec(svg))) {
    const attrs = m[1] + m[3];
    const fr = /fill-rule="([^"]*)"/.exec(attrs)?.[1] ?? null;
    paths.push({ d: m[2], fr });
  }
  if (paths.length === 0) {
    const cre = /<circle\b([^>]*)\/?>/g;
    while ((m = cre.exec(svg))) {
      const num = (k) => Number(new RegExp(`${k}="([\\d.]+)"`).exec(m[1])?.[1]);
      const [cx, cy, r] = [num("cx"), num("cy"), num("r")];
      if (!(r > 0)) throw new Error("circle 缺少 cx/cy/r");
      paths.push({ d: `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`, fr: null });
    }
  }
  if (paths.length === 0) throw new Error("无 path");
  return paths;
}

/** 写出或校验产物：--check 时不一致则非零码退出。 */
function emit(path, content, label) {
  if (!CHECK) {
    writeFileSync(path, content, "utf8");
    console.log(`✓ 已生成 ${label}`);
    return;
  }
  if (readFileSync(path, "utf8") === content) {
    console.log(`✓ --check 通过：${label} 与 icons/ 一致`);
  } else {
    console.error(`✗ --check 失败：${label} 与 icons/ 不一致，请运行 node scripts/gen-icons.mjs`);
    process.exit(1);
  }
}

/** 输出 1：packages/model/icon-library.js */
function buildLibrary(icons) {
  const lines = [];
  lines.push("// ============================================================================");
  lines.push("// icon-library.js — 内置图标库（AUTO-GENERATED，勿手改）");
  lines.push("// ----------------------------------------------------------------------------");
  lines.push("// 来源：Bootstrap Icons — MIT License, Copyright (c) 2019-2024 The Bootstrap Authors");
  lines.push("//       https://github.com/twbs/icons ｜ viewBox 16×16，填充式（fill-rule 见 fr 字段）");
  lines.push("// 源文件：assets/icons/*.svg + assets/icons/index.json（见 scripts/gen-icons.mjs）");
  lines.push("// 重新生成：node scripts/gen-icons.mjs（纯本地，离线可用）");
  lines.push("// ============================================================================");
  lines.push("");
  lines.push("/** 图标：{ label 中文名, cat 分类, d 路径, fr fill-rule（可选） }。 */");
  lines.push("export const ICONS = {");
  for (const [name, { label, cat, d, fr }] of Object.entries(icons)) {
    lines.push(`  ${JSON.stringify(name)}: { label: ${JSON.stringify(label)}, cat: ${JSON.stringify(cat)}, d: ${JSON.stringify(d)}${fr ? `, fr: ${JSON.stringify(fr)}` : ""} },`);
  }
  lines.push("};");
  lines.push("");
  return lines.join("\n");
}

/** 输出 2：references/icons.md */
function buildDoc(icons) {
  const CAT_ORDER = ["方向", "状态", "概念", "文档", "图表", "财务", "工具", "设备", "沟通", "时间", "位置", "安全", "人员"];
  const CAT_LABEL = {
    方向: "Direction / Arrow", 状态: "Status / Alert", 概念: "Concept / Symbol", 文档: "Document / File", 图表: "Chart / Data",
    财务: "Finance / Business", 工具: "Tool / Action", 设备: "Device / Hardware", 沟通: "Communication / Media", 时间: "Time / Schedule",
    位置: "Location / Map", 安全: "Security / Privacy", 人员: "People / User",
  };

  // Group by category
  const byCat = new Map();
  for (const [name, info] of Object.entries(icons)) {
    if (!byCat.has(info.cat)) byCat.set(info.cat, []);
    byCat.get(info.cat).push(name);
  }
  for (const arr of byCat.values()) arr.sort((a, b) => a.localeCompare(b));

  // FA mapping table grouped by target icon (fas: common)
  const faRows = Object.entries(FA_TO_BS).map(([fa, bs]) => ({ fa, bs })).sort((a, b) => a.fa.localeCompare(b.fa));

  // Hard consistency check: every FA mapping target must exist in the local library
  const badTargets = faRows.filter(({ bs }) => !(bs in icons));
  if (badTargets.length) {
    console.error(`✗ FA_TO_BS has ${badTargets.length} mappings pointing outside the library; aborted:`);
    for (const { fa, bs } of badTargets.slice(0, 20)) console.error(`  - ${fa} → ${bs}`);
    console.error(`  Fix: remove invalid entries from packages/model/icon-name.js, or add the icons to assets/icons/.`);
    process.exit(1);
  }

  const lines = [];
  lines.push(`# Icon Library`);
  lines.push(``);
  lines.push(`> AUTO-GENERATED (scripts/gen-icons.mjs) — regenerate after modifying the icon library.`);
  lines.push(``);
  lines.push(`## Usage`);
  lines.push(``);
  lines.push(`\`iconName\` format is \`style:name\`:`);
  lines.push(``);
  lines.push(`| Prefix | Meaning | Notes |`);
  lines.push(`|---|---|---|`);
  lines.push(`| \`bs:\` | Local library direct reference | Any name from the lists below, e.g. \`bs:rocket\` |`);
  lines.push(`| \`fas:\` | Font Awesome Solid | Mapped by FA semantic name to a local approximate icon, e.g. \`fas:house\`; only FA names covered by the table below are available |`);
  lines.push(`| \`far:\` | Font Awesome Regular | Same mapping table as \`fas:\` (Regular semantics are not distinguished) |`);
  lines.push(`| \`fab:\` | Font Awesome Brands | **Not supported** — the local library has no brand logos (copyright); use an image element for brand marks |`);
  lines.push(``);
  lines.push(`> Prefer \`bs:\` direct references when generating (they always exist); when using \`fas:\`, check the mapping table below first — otherwise the icon is skipped during export.`);
  lines.push(``);
  lines.push(`## Local Icon Library (${Object.keys(icons).length} icons, by category)`);
  lines.push(``);
  const emitCat = (cat, items) => {
    lines.push(`### ${CAT_LABEL[cat] || cat} (${items.length})`);
    lines.push(``);
    lines.push(`| name |`);
    lines.push(`|---|`);
    for (const name of items) lines.push(`| \`bs:${name}\` |`);
    lines.push(``);
  };
  for (const cat of CAT_ORDER) {
    const items = byCat.get(cat);
    if (items?.length) emitCat(cat, items);
  }
  // Categories not listed above
  for (const [cat, items] of byCat) {
    if (!CAT_ORDER.includes(cat)) emitCat(cat, items);
  }
  lines.push(`## Font Awesome → Local Mapping (${faRows.length} entries, all resolve to the local library)`);
  lines.push(``);
  lines.push(`| FA name | Usage | Local icon |`);
  lines.push(`|---|---|---|`);
  for (const { fa, bs } of faRows) {
    lines.push(`| ${fa} | \`fas:${fa}\` / \`far:${fa}\` | \`bs:${bs}\` |`);
  }
  lines.push(``);
  return lines.join("\n");
}

function main() {
  const index = JSON.parse(readFileSync(join(ICONS_DIR, "index.json"), "utf8"));
  const svgFiles = readdirSync(ICONS_DIR).filter((f) => f.endsWith(".svg")).sort();
  const icons = {};
  const problems = [];

  for (const file of svgFiles) {
    const name = file.replace(/\.svg$/, "");
    const meta = index[name];
    if (!meta) {
      problems.push(`${name}: icons/index.json 缺少条目`);
      continue;
    }
    const svg = readFileSync(join(ICONS_DIR, file), "utf8");
    try {
      const paths = extractPath(svg);
      // 多 path 合并：后续 path 是独立坐标系，须以绝对 M0 0 开头
      // （否则其相对 m 会相对上一 path 终点，预览/导出都会错位）；fill-rule 取第一个非空
      const d = paths.map((p, i) => (i === 0 ? p.d : "M0 0" + p.d)).join("");
      const fr = paths.find((p) => p.fr)?.fr ?? null;
      icons[name] = { label: meta.label, cat: meta.cat, d, fr };
    } catch (err) {
      problems.push(`${name}: ${err.message}`);
    }
  }

  // 校验：index.json 里的 key 都必须有对应 svg 文件
  for (const key of Object.keys(index)) {
    if (!icons[key]) problems.push(`${key}: icons/${key}.svg 缺失`);
  }

  if (problems.length) {
    console.error("✗ 生成中止，存在以下问题：");
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }

  emit(OUT_LIB, buildLibrary(icons), `packages/model/icon-library.js（${Object.keys(icons).length} 个图标）`);
  emit(OUT_DOC, buildDoc(icons), `references/icons.md（${Object.keys(icons).length} 个图标 + ${Object.keys(FA_TO_BS).length} 条 FA 映射）`);
}

main();
