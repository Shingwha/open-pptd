// ============================================================================
// scripts/gen-icons-doc.mjs — 从图标库生成 references/icons.md（AUTO-GENERATED）
// ----------------------------------------------------------------------------
// 用途：让生成模型知道本地图标库有哪些图标（bs: 直引）与 FA 语义映射
//       （fas:/far:/fab: 近似图标），避免写出库外图标导致导出跳过。
// 运行：node scripts/gen-icons-doc.mjs
// ============================================================================

import { writeFileSync } from "node:fs";
import { ICONS } from "../editor/core/icon-library.js";
import { FA_TO_BS } from "../editor/core/icon-name.js";

const CAT_ORDER = ["方向", "状态", "概念", "文档", "图表", "财务", "工具", "设备", "沟通", "时间", "位置", "安全", "人员"];
const CAT_LABEL = {
  方向: "方向/箭头", 状态: "状态/提示", 概念: "概念/象征", 文档: "文档/文件", 图表: "图表/数据",
  财务: "财务/商业", 工具: "工具/操作", 设备: "设备/硬件", 沟通: "沟通/媒体", 时间: "时间/日程",
  位置: "位置/地图", 安全: "安全/隐私", 人员: "人员/用户",
};

// 按分类收集
const byCat = new Map();
for (const [name, info] of Object.entries(ICONS)) {
  if (!byCat.has(info.cat)) byCat.set(info.cat, []);
  byCat.get(info.cat).push({ name, label: info.label });
}
for (const arr of byCat.values()) arr.sort((a, b) => a.name.localeCompare(b.name));

// FA 映射表按目标图标分组（fas: 常用）
const faRows = Object.entries(FA_TO_BS)
  .map(([fa, bs]) => ({ fa, bs }))
  .sort((a, b) => a.fa.localeCompare(b.fa));

const lines = [];
lines.push(`# Icon Library（本地图标库）`);
lines.push(``);
lines.push(`> AUTO-GENERATED（scripts/gen-icons-doc.mjs）——修改图标库后重新生成。`);
lines.push(``);
lines.push(`## 用法`);
lines.push(``);
lines.push(`\`iconName\` 格式为 \`style:name\`：`);
lines.push(``);
lines.push(`| 前缀 | 语义 | 说明 |`);
lines.push(`|---|---|---|`);
lines.push(`| \`bs:\` | 本地库直引 | 下方清单中的任意 name，如 \`bs:rocket\` |`);
lines.push(`| \`fas:\` | Font Awesome Solid | 按 FA 语义名映射到本地近似图标，如 \`fas:house\`；仅下表覆盖的 FA 名可用 |`);
lines.push(`| \`far:\` | Font Awesome Regular | 同 \`fas:\` 映射表（Regular 语义无区分） |`);
lines.push(`| \`fab:\` | Font Awesome Brands | **不支持**——本地库无品牌 logo（版权）；品牌标识请用图片元素 |`);
lines.push(``);
lines.push(`> 生成时优先用 \`bs:\` 直引（一定存在）；用 \`fas:\` 时先查下方映射表确认存在，否则导出会跳过该图标。`);
lines.push(``);
lines.push(`## 本地图标库（${Object.keys(ICONS).length} 个，按分类）`);
lines.push(``);
for (const cat of CAT_ORDER) {
  const items = byCat.get(cat);
  if (!items || !items.length) continue;
  lines.push(`### ${CAT_LABEL[cat] || cat}（${items.length}）`);
  lines.push(``);
  lines.push(`| name | 中文 |`);
  lines.push(`|---|---|`);
  for (const { name, label } of items) lines.push(`| \`bs:${name}\` | ${label} |`);
  lines.push(``);
}
// 未列出的分类
for (const [cat, items] of byCat) {
  if (CAT_ORDER.includes(cat)) continue;
  lines.push(`### ${cat}（${items.length}）`);
  lines.push(``);
  lines.push(`| name | 中文 |`);
  lines.push(`|---|---|`);
  for (const { name, label } of items) lines.push(`| \`bs:${name}\` | ${label} |`);
  lines.push(``);
}
lines.push(`## Font Awesome → 本地映射（${faRows.length} 条）`);
lines.push(``);
lines.push(`| FA 名 | 用法 | 本地图标 |`);
lines.push(`|---|---|---|`);
for (const { fa, bs } of faRows) {
  const label = ICONS[bs]?.label || "";
  lines.push(`| ${fa} | \`fas:${fa}\` / \`far:${fa}\` | \`bs:${bs}\`（${label}） |`);
}
lines.push(``);

writeFileSync("references/icons.md", lines.join("\n"), "utf8");
console.log(`✓ references/icons.md 已生成（${Object.keys(ICONS).length} 图标 + ${faRows.length} FA 映射）`);
