#!/usr/bin/env node
// ============================================================================
// gen-icons.mjs — 从本地 icons/ 源目录生成内置图标库数据
// ----------------------------------------------------------------------------
// 源：icons/*.svg —— Bootstrap Icons 原始 SVG（MIT License,
//     Copyright (c) 2019-2024 The Bootstrap Authors, https://github.com/twbs/icons）
//     viewBox 16×16，填充式（fill-rule 见文件内属性）
// 索引：icons/index.json —— { key: { label 中文名, cat 分类 } }
// 输出：editor/core/icon-library.js（AUTO-GENERATED，勿手改）
// 用法：node scripts/gen-icons.mjs            # 全量重新生成（离线可用）
//       node scripts/gen-icons.mjs --check    # 校验 icons/ 与已生成库一致（CI）
// 新增图标：把上游 SVG 放入 icons/<key>.svg，index.json 加 {key: {label, cat}}，重跑本脚本。
// ============================================================================

import { writeFileSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ICONS_DIR = join(ROOT, "assets", "icons");
const OUT = join(ROOT, "editor", "core", "icon-library.js");
const CHECK = process.argv.includes("--check");

/** 提取 <path d="..." fill-rule? />（Bootstrap 原始 SVG 固定格式，字符串解析即可）。 */
function extractPath(svg) {
  const paths = [];
  const re = /<path\b([^>]*)\bd="([^"]*)"([^>]*)\/?>/g;
  let m;
  while ((m = re.exec(svg))) {
    const attrs = m[1] + m[3];
    const fr = /fill-rule="([^"]*)"/.exec(attrs)?.[1] ?? null;
    paths.push({ d: m[2], fr });
  }
  if (paths.length === 0) throw new Error("无 path");
  return paths;
}

function main() {
  const index = JSON.parse(readFileSync(join(ICONS_DIR, "index.json"), "utf8"));
  const svgFiles = readdirSync(ICONS_DIR).filter((f) => f.endsWith(".svg")).sort();
  const out = {};
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
      out[name] = { label: meta.label, cat: meta.cat, d, fr };
    } catch (err) {
      problems.push(`${name}: ${err.message}`);
    }
  }

  // 校验：index.json 里的 key 都必须有对应 svg 文件
  for (const key of Object.keys(index)) {
    if (!out[key]) problems.push(`${key}: icons/${key}.svg 缺失`);
  }

  if (problems.length) {
    console.error("✗ 生成中止，存在以下问题：");
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }

  const lines = [];
  lines.push("// ============================================================================");
  lines.push("// icon-library.js — 内置图标库（AUTO-GENERATED，勿手改）");
  lines.push("// ----------------------------------------------------------------------------");
  lines.push("// 来源：Bootstrap Icons — MIT License, Copyright (c) 2019-2024 The Bootstrap Authors");
  lines.push("//       https://github.com/twbs/icons ｜ viewBox 16×16，填充式（fill-rule 见 fr 字段）");
  lines.push("// 源文件：icons/*.svg + icons/index.json（见 scripts/gen-icons.mjs）");
  lines.push("// 重新生成：node scripts/gen-icons.mjs（纯本地，离线可用）");
  lines.push("// ============================================================================");
  lines.push("");
  lines.push("/** 图标：{ label 中文名, cat 分类, d 路径, fr fill-rule（可选） }。 */");
  lines.push("export const ICONS = {");
  for (const [name, { label, cat, d, fr }] of Object.entries(out)) {
    lines.push(`  ${JSON.stringify(name)}: { label: ${JSON.stringify(label)}, cat: ${JSON.stringify(cat)}, d: ${JSON.stringify(d)}${fr ? `, fr: ${JSON.stringify(fr)}` : ""} },`);
  }
  lines.push("};");
  lines.push("");

  const content = lines.join("\n");
  if (CHECK) {
    const existing = readFileSync(OUT, "utf8");
    if (existing === content) {
      console.log(`✓ --check 通过：icons/ 与 icon-library.js 一致（${Object.keys(out).length} 个图标）`);
    } else {
      console.error(`✗ --check 失败：icons/ 与 icon-library.js 不一致，请运行 node scripts/gen-icons.mjs`);
      process.exit(1);
    }
  } else {
    writeFileSync(OUT, content, "utf8");
    console.log(`✓ 已生成 editor/core/icon-library.js（${Object.keys(out).length} 个图标，离线生成）`);
  }
}

main();
