// ============================================================================
// gen-icon-registry.mjs — generate assets/icons/registry.json from Font Awesome Free metadata
// ----------------------------------------------------------------------------
// Data sources (fetched once from CDN; jsDelivr primary + unpkg mirror):
//   metadata/icon-families.json — per icon: label / aliases.names / search.terms /
//     svgs.classic.<style>.{viewBox,width,height} / familyStylesByLicense (free filter)
//   metadata/categories.yml     — official categories (id → {label, icons[]})
// Output registry.json: { version, faVersion, license, prefixes, cats, icons:[…] }
//   icons entries {name, w, h, styles(prefix array), aliases?, terms?, label?, cat?}
// SVGs are not committed (.gitignore policy as for fonts); CLI `open-pptd icons download` fetches them.
// Regenerate: node scripts/gen-icon-registry.mjs [--fa 7.3.1]
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

/** style dir name → prefix (official iconName prefix ↔ FA classic family dir). */
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

  // categories: name → first category id it belongs to (official categories have no duplicate membership, so the first wins)
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
    // only free-licensed classic-family styles are usable
    const freeStyles = (entry.familyStylesByLicense?.free || [])
      .filter((s) => s.family === "classic")
      .map((s) => s.style);
    const styles = [];
    for (const style of freeStyles) {
      const svg = entry.svgs?.classic?.[style];
      if (!svg || typeof svg.width !== "number") continue; // guard against incomplete metadata
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
  // one icon per line, easier for git diff and grep
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
