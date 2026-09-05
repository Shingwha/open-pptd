// ============================================================================
// gen-icon-registry.mjs — 从 Font Awesome Free 元数据生成 assets/icons/registry.json
// ----------------------------------------------------------------------------
// 数据源（CDN 一次性拉取，jsDelivr 主源 + unpkg 镜像）：
//   metadata/icon-families.json — 每图标 label / aliases.names / search.terms /
//     svgs.classic.<style>.{viewBox,width,height} / familyStylesByLicense（free 过滤）
//   metadata/categories.yml     — 官方分类（id → {label, icons[]}）
// 产物 registry.json：{ version, faVersion, license, prefixes, cats, icons:[…] }
//   icons 条目 {name, w, h, styles(前缀数组), aliases?, terms?, label?, cat?}
// SVG 本体不入库（.gitignore 同字体策略），CLI `open-pptd icons download` 拉取。
// 重新生成：node scripts/gen-icon-registry.mjs [--fa 7.3.1]
// ============================================================================

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as yaml from "../packages/model/vendor/js-yaml.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "assets", "icons", "registry.json");

const FA_VERSION = (() => {
  const i = process.argv.indexOf("--fa");
  return i >= 0 ? process.argv[i + 1] : "7.3.1";
})();

const SOURCES = (file) => [
  `https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@${FA_VERSION}/${file}`,
  `https://unpkg.com/@fortawesome/fontawesome-free@${FA_VERSION}/${file}`,
];

/** style 目录名 → 前缀（官方 iconName 前缀 ↔ FA classic 家族目录）。 */
const STYLE_TO_PREFIX = { solid: "fas", regular: "far", brands: "fab" };

async function fetchText(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 30_000);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchAny(file) {
  let lastErr;
  for (const url of SOURCES(file)) {
    try {
      return await fetchText(url);
    } catch (err) {
      lastErr = new Error(`${url} → ${err.message}`);
    }
  }
  throw lastErr;
}

async function main() {
  console.log(`== Font Awesome Free ${FA_VERSION} 元数据拉取 ==`);
  const famText = await fetchAny("metadata/icon-families.json");
  const catText = await fetchAny("metadata/categories.yml");
  console.log(`  icon-families.json ${(famText.length / 1e6).toFixed(1)}MB, categories.yml ${(catText.length / 1e3).toFixed(0)}KB`);

  const fam = JSON.parse(famText);
  const cats = yaml.load(catText);

  // 分类：name → 第一个所属分类 id（官方分类无重复归属的用首个）
  const catOf = new Map();
  for (const [id, def] of Object.entries(cats)) {
    for (const name of def.icons || []) {
      if (!catOf.has(name)) catOf.set(name, id);
    }
  }
  const catLabels = {};
  for (const [id, def] of Object.entries(cats)) catLabels[id] = def.label || id;

  const icons = [];
  let skippedProOnly = 0;
  for (const [name, entry] of Object.entries(fam)) {
    // free 许可且 classic 家族的样式才是可用样式
    const freeStyles = (entry.familyStylesByLicense?.free || [])
      .filter((s) => s.family === "classic")
      .map((s) => s.style);
    const styles = [];
    for (const style of freeStyles) {
      const svg = entry.svgs?.classic?.[style];
      if (!svg || typeof svg.width !== "number") continue; // 元数据残缺防御
      styles.push(STYLE_TO_PREFIX[style]);
    }
    if (!styles.length) {
      skippedProOnly += 1;
      continue;
    }
    const first = entry.svgs.classic[freeStyles[0]];
    const icon = {
      name,
      w: first.width,
      h: first.height ?? 512,
      styles,
    };
    const aliases = entry.aliases?.names;
    if (aliases?.length) icon.aliases = aliases.slice(0, 6);
    const terms = entry.search?.terms;
    if (terms?.length) icon.terms = terms.slice(0, 5);
    if (entry.label && entry.label !== name) icon.label = entry.label;
    const cat = catOf.get(name);
    if (cat) icon.cat = cat;
    icons.push(icon);
  }
  icons.sort((a, b) => a.name.localeCompare(b.name));

  const registry = {
    version: 1,
    faVersion: FA_VERSION,
    license: "Font Awesome Free — Icons: CC BY 4.0 (c) Fonticons, Inc. https://fontawesome.com/license/free",
    prefixes: STYLE_TO_PREFIX,
    counts: icons.reduce((acc, i) => {
      for (const s of i.styles) acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {}),
    cats: catLabels,
    icons,
  };

  mkdirSync(dirname(OUT), { recursive: true });
  // 每图标一行，便于 git diff 与 grep
  const head = JSON.stringify({ ...registry, icons: undefined }).slice(0, -1).slice(1);
  const body = icons.map((i) => `  ${JSON.stringify(i)}`).join(",\n");
  writeFileSync(OUT, `{\n  ${head},\n  "icons": [\n${body}\n  ]\n}\n`);

  const size = (JSON.stringify(registry).length / 1024).toFixed(0);
  console.log(
    `✓ ${icons.length} 个图标（pro-only 跳过 ${skippedProOnly}）→ assets/icons/registry.json（${size}KB）` +
      `  fas=${registry.counts.fas} far=${registry.counts.far} fab=${registry.counts.fab}`
  );
}

main().catch((err) => {
  console.error(`✗ 生成失败: ${err.message}`);
  process.exit(1);
});
