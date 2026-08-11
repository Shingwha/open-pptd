// ============================================================================
// scripts/gen-icons-doc.mjs — Generates references/icons.md (AUTO-GENERATED)
// ----------------------------------------------------------------------------
// Purpose: lets the generating model know which icons exist in the local
//          library (bs: direct references) and the FA semantic mappings
//          (fas:/far:/fab: approximate icons), avoiding out-of-library icons
//          that would be skipped during export.
// Run: node scripts/gen-icons-doc.mjs
// ============================================================================

import { writeFileSync } from "node:fs";
import { ICONS } from "../editor/core/icon-library.js";
import { FA_TO_BS } from "../editor/core/icon-name.js";

const CAT_ORDER = ["方向", "状态", "概念", "文档", "图表", "财务", "工具", "设备", "沟通", "时间", "位置", "安全", "人员"];
const CAT_LABEL = {
  方向: "Direction / Arrow", 状态: "Status / Alert", 概念: "Concept / Symbol", 文档: "Document / File", 图表: "Chart / Data",
  财务: "Finance / Business", 工具: "Tool / Action", 设备: "Device / Hardware", 沟通: "Communication / Media", 时间: "Time / Schedule",
  位置: "Location / Map", 安全: "Security / Privacy", 人员: "People / User",
};

// Group by category
const byCat = new Map();
for (const [name, info] of Object.entries(ICONS)) {
  if (!byCat.has(info.cat)) byCat.set(info.cat, []);
  byCat.get(info.cat).push({ name });
}
for (const arr of byCat.values()) arr.sort((a, b) => a.name.localeCompare(b.name));

// FA mapping table grouped by target icon (fas: common)
const faRows = Object.entries(FA_TO_BS)
  .map(([fa, bs]) => ({ fa, bs }))
  .sort((a, b) => a.fa.localeCompare(b.fa));

// Hard consistency check: every FA mapping target must exist in the local library
const badTargets = faRows.filter(({ bs }) => !(bs in ICONS));
if (badTargets.length) {
  console.error(`✗ FA_TO_BS has ${badTargets.length} mappings pointing outside the library; aborted:`);
  for (const { fa, bs } of badTargets.slice(0, 20)) console.error(`  - ${fa} → ${bs}`);
  console.error(`  Fix: remove invalid entries from editor/core/icon-name.js, or add the icons to assets/icons/.`);
  process.exit(1);
}

const lines = [];
lines.push(`# Icon Library`);
lines.push(``);
lines.push(`> AUTO-GENERATED (scripts/gen-icons-doc.mjs) — regenerate after modifying the icon library.`);
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
lines.push(`## Local Icon Library (${Object.keys(ICONS).length} icons, by category)`);
lines.push(``);
for (const cat of CAT_ORDER) {
  const items = byCat.get(cat);
  if (!items || !items.length) continue;
  lines.push(`### ${CAT_LABEL[cat] || cat} (${items.length})`);
  lines.push(``);
  lines.push(`| name |`);
  lines.push(`|---|`);
  for (const { name } of items) lines.push(`| \`bs:${name}\`${ICONS[name]?.src === "fa" ? " *" : ""} |`);
  lines.push(``);
}
// Categories not listed above
for (const [cat, items] of byCat) {
  if (CAT_ORDER.includes(cat)) continue;
  lines.push(`### ${cat} (${items.length})`);
  lines.push(``);
  lines.push(`| name |`);
  lines.push(`|---|`);
  for (const { name } of items) lines.push(`| \`bs:${name}\`${ICONS[name]?.src === "fa" ? " *" : ""} |`);
  lines.push(``);
}
lines.push(`## Font Awesome → Local Mapping (${faRows.length} entries, all resolve to the local library)`);
lines.push(``);
lines.push(`| FA name | Usage | Local icon |`);
lines.push(`|---|---|---|`);
for (const { fa, bs } of faRows) {
  lines.push(`| ${fa} | \`fas:${fa}\` / \`far:${fa}\` | \`bs:${bs}\` |`);
}
lines.push(``);

writeFileSync("references/icons.md", lines.join("\n"), "utf8");
console.log(`✓ references/icons.md regenerated (${Object.keys(ICONS).length} icons + ${faRows.length} FA mappings)`);
