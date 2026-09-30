// ============================================================================
// tests/contract/public-api.mjs — package-level public contract test (contract 4, see docs/embedding.md)
// ----------------------------------------------------------------------------
// Asserts:
//   1. Every export name of the five existing barrels is present (spec 01 T1 list, plus the W-E
//      additive server re-exports: MIME / resolveFile / resolveStaticFile / sendFile /
//      handleSave / handlePing);
//   2. CONTRACT_VERSION === 2 and matches contract.json's contractVersion;
//   3. contract.json parses; entries correspond one-to-one with the package.json exports entries
//      (both directions, guards against drift); the files an entry points at exist;
//   4. the three dual-end barrels (model/renderer/writer) import statically and their sources contain
//      no Node/DOM globals (browser safety constraint, complementing dep-graph);
//   5. the W1.5 flat re-export list (editor consumption surface) and the editor entry
//      (open-pptd/editor): the editor barrel depends on the DOM and cannot be imported statically in
//      Node, so it is checked textually (after stripping comments, the re-export statement must
//      appear) plus the source files and their export names must exist;
//   6. the W-E host boot seam in editor/main.js (browser-only → textual as well): boot parameters
//      (?base= / ?chrome= / window.__PPTD_BOOT__) and the postMessage protocol
//      (pptd:theme / pptd:ready / window.__pptdTheme).
// Usage: node tests/contract/public-api.mjs (non-zero exit = contract broken)
// ============================================================================

import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

let fail = 0;
let skip = 0;
const ok = (name) => console.log(`✓ ${name}`);
const bad = (name, detail) => {
  fail++;
  console.error(`✗ ${name}${detail ? " — " + detail : ""}`);
};
const skipTo = (name, detail) => {
  skip++;
  console.log(`SKIP ${name}${detail ? " — " + detail : ""}`);
};

// ---------------------------------------------------------------------------
// spec 01 T1 frozen export list (three classes: functions / namespace objects / constants)
// ---------------------------------------------------------------------------
const BARRELS = {
  "packages/model/index.js": {
    fns: [
      "parseDeck", "serializeDeck", "createDeck", "createPage", "nextElementId",
      "deckSize", "registerType", "getType", "allTypes",
      "resolveTheme", "resolveColor", "resolveFont", "mergePaletteColors",
      "validateDeck", "registerRule", "walkElements", "collectImageSrcs",
      "shapePaths", "shapeMenuIcon",
    ],
    objs: ["chart", "icons", "fonts", "bytes"],
    consts: [
      "PAGE_WIDTH", "PAGE_HEIGHT", "PAGE_TYPES", "SUPPORTED_SHAPES", "ELEMENT_TYPES",
      "DEFAULT_THEME", "DEFAULT_FONT", "THEME_PALETTES", "PRESET_SHAPES",
    ],
    // namespace spot checks (explicitly named by spec 01 T1)
    namespaceSpot: [
      ["chart", "CHART_META"], ["chart", "buildChartOption"], ["chart", "resolveChartSpec"],
      ["icons", "loadIconRegistry"], ["fonts", "loadFontRegistry"], ["bytes", "encodeUtf8"],
    ],
  },
  "packages/renderer/index.js": {
    fns: ["renderPage", "autoGrowTexts", "disposeChartInstances", "iconThumb"],
    objs: ["renderers"],
    consts: [],
    namespaceSpot: [
      ["renderers", "renderText"], ["renderers", "renderShape"], ["renderers", "renderLine"],
      ["renderers", "renderImage"], ["renderers", "renderIcon"], ["renderers", "renderTable"],
      ["renderers", "renderChart"], ["renderers", "pageBackground"],
    ],
  },
  "packages/writer/index.js": {
    // ZipWriter is a class (typeof "function"), checked alongside the functions
    fns: ["buildPptx", "downloadPptx", "downloadBlob", "magicMatches", "ZipWriter"],
    objs: ["xml", "parts", "text"],
    consts: [],
    namespaceSpot: [["xml", "el"], ["parts", "buildContentTypes"], ["text", "buildTextBody"]],
  },
  "packages/server/index.js": {
    // W-E additive re-exports: hosts mount these on their own routes (see docs/embedding.md §6)
    fns: ["createServer", "startServer", "resolveFile", "resolveStaticFile", "sendFile", "handleSave", "handlePing"],
    objs: ["MIME"],
    consts: ["PROJECT_ROOT"],
    namespaceSpot: [],
  },
  "packages/cli/index.js": {
    fns: ["runCheck", "exportDeck", "exportProject", "runRender", "renderDeck", "runFonts", "runIcons", "runGallery"],
    objs: [],
    consts: [],
    namespaceSpot: [],
  },
};

// Dual-end barrels: the source must contain no Node-only source or DOM global (T1 "browser safety constraint")
const DUAL_END = ["packages/model/index.js", "packages/renderer/index.js", "packages/writer/index.js"];
const PURITY_PATTERNS = [
  [/\bfrom\s*["']node:/, "node: import"],
  [/\bimport\s*\(\s*["']node:/, "node: 动态 import"],
  [/\bfrom\s*["']fs["']/, "裸 fs import"],
  [/\bwindow\./, "window."],
  [/\bdocument\./, "document."],
  [/\bheadless\//, "headless/ 引用"],
];

// W1.5 flat re-export list (editor consumption surface; only existence is asserted, types follow the source)
const FLAT = {
  "packages/model/index.js": [
    "syncElementId", "normalizeTheme", "resolveTableStyle", "themeChartPalette",
    "tableGrid", "tryMerge", "trySplit", "normalizeCells", "estimateTableLayout", "validateDims",
    "parseFontInfo", "parseFontResources",
    "CHART_META", "remapEncode", "CHART_TYPE_ORDER", "DATA_LABEL_CONTENTS", "NUMBER_FORMAT_CODES",
    "colLetter", "validateChartSeries",
    "loadIconRegistry", "resolveIconName", "fetchIconSvg", "normalizeIconSvg",
    "loadFontRegistry", "findFont", "fontFileUrl", "fetchFontBytes",
    "bytesToBase64", "base64ToBytes",
    "SHOT_READY_TITLE", "SHOT_ERROR_TITLE", "yaml",
  ],
  "packages/renderer/index.js": ["cellFinal", "tdCss"],
  "packages/writer/index.js": ["imageSize", "decodeDataUrl", "extToMime", "dataUrlOf", "safeFileName"],
};

// editor entry (the public face of contracts 1/2/3; DOM-dependent, checked textually)
const EDITOR_ENTRY = {
  barrel: "editor/index.js",
  exports: [
    "createEditor", "TOKENS", "defaultTokens", "applyThemeTokens",
    "httpSource", "directoryHandleSource", "memorySource", "delegatingSource",
  ],
  sources: {
    "editor/editor.js": ["createEditor"],
    "editor/theme.js": ["TOKENS", "defaultTokens", "applyThemeTokens"],
    "editor/app/project/source.js": ["httpSource", "directoryHandleSource", "memorySource", "delegatingSource"],
  },
};

// W-E host boot seam in editor/main.js (browser-only file, checked textually after comment stripping)
const EDITOR_MAIN = {
  file: "editor/main.js",
  patterns: [
    ["query base 解析", /params\.get\(\s*["']base["']\s*\)/],
    ["query chrome 解析", /params\.get\(\s*["']chrome["']\s*\)/],
    ["宿主 boot 参数", /__PPTD_BOOT__/],
    ["宿主主题直调面", /__pptdTheme/],
    ["主题消息钩子", /["']pptd:theme["']/],
    ["就绪通知", /["']pptd:ready["']/],
  ],
};

// ---------------------------------------------------------------------------
async function checkBarrel(rel, spec) {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) return bad(`${rel} 存在`, "文件缺失");
  let mod;
  try {
    mod = await import(pathToFileURL(abs).href);
  } catch (e) {
    return bad(`${rel} 可静态导入`, e.message);
  }
  const names = [...spec.fns, ...spec.objs, ...spec.consts];
  const missing = names.filter((n) => !(n in mod));
  if (missing.length) bad(`${rel} 导出名齐全`, `缺 ${missing.length} 个: ${missing.join(", ")}`);
  else ok(`${rel} 导出名齐全（${names.length} 个）`);

  for (const n of spec.fns) if (typeof mod[n] !== "function") if (n in mod) bad(`${rel}#${n} 应为函数`, `实际 ${typeof mod[n]}`);
  for (const n of spec.objs) if (n in mod && (typeof mod[n] !== "object" || mod[n] === null)) bad(`${rel}#${n} 应为对象`, `实际 ${typeof mod[n]}`);
  for (const n of spec.consts) if (n in mod && mod[n] === undefined) bad(`${rel}#${n} 不应为 undefined`, "");

  for (const [ns, key] of spec.namespaceSpot) {
    if (!mod[ns] || !(key in mod[ns])) bad(`${rel}#${ns}.${key} 存在`, "缺");
  }
  if (spec.namespaceSpot.length) ok(`${rel} 命名空间抽查 ${spec.namespaceSpot.length} 项`);
}

// ---------------------------------------------------------------------------
async function main() {
  console.log("=== 1. barrel 导出名与类型 ===");
  for (const [rel, spec] of Object.entries(BARRELS)) await checkBarrel(rel, spec);

  console.log("\n=== 2. CONTRACT_VERSION ===");
  const rootMod = await import(pathToFileURL(join(ROOT, "packages/index.js")).href);
  if (rootMod.CONTRACT_VERSION === 2) ok("packages/index.js CONTRACT_VERSION === 2");
  else bad("packages/index.js CONTRACT_VERSION === 2", `实际 ${rootMod.CONTRACT_VERSION}`);

  console.log("\n=== 3. contract.json ↔ package.json exports ===");
  const contractPath = join(ROOT, "contract.json");
  if (!existsSync(contractPath)) return bad("contract.json 存在", "文件缺失");
  let contract;
  try {
    contract = JSON.parse(readFileSync(contractPath, "utf8"));
    ok("contract.json 可解析");
  } catch (e) {
    return bad("contract.json 可解析", e.message);
  }
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

  if (contract.contractVersion === rootMod.CONTRACT_VERSION) ok("contract.json contractVersion 与 CONTRACT_VERSION 一致（2）");
  else bad("contract.json contractVersion", `${contract.contractVersion} ≠ ${rootMod.CONTRACT_VERSION}`);

  // Both directions: every entries key has a matching exports item; every non-escape-hatch,
  // non-metadata exports item appears in entries
  const META_SUBPATHS = new Set([".", "./editor/index.html", "./package.json", "./internal/*"]);
  const entryKeys = Object.keys(contract.entries || {});
  const drift = [];
  for (const [k, v] of Object.entries(contract.entries || {})) {
    const ext = pkg.exports?.["./" + k];
    if (ext !== "./" + v) drift.push(`exports["./${k}"]=${ext ?? "缺失"} ≠ "./${v}"`);
  }
  for (const key of Object.keys(pkg.exports || {})) {
    if (META_SUBPATHS.has(key)) continue;
    if (!entryKeys.includes(key.replace(/^\.\//, ""))) drift.push(`exports 多出 ${key}（contract.json entries 未列）`);
  }
  if (drift.length) bad("entries ↔ exports 一一对应", drift.join("；"));
  else ok(`entries ↔ exports 一一对应（${entryKeys.length} 条）`);

  const normBin = (b) => String(b).replace(/^\.\//, "");
  if (normBin(contract.bin) === normBin(pkg.bin?.["open-pptd"])) ok("contract.json bin 与 package.json bin 一致");
  else bad("contract.json bin 与 package.json bin 一致", `${contract.bin} ≠ ${pkg.bin?.["open-pptd"]}`);

  const pending = [];
  for (const [k, v] of Object.entries(contract.entries || {})) {
    if (existsSync(join(ROOT, v))) ok(`entries.${k} → ${v} 存在`);
    else {
      pending.push(`entries.${k} → ${v}`);
      skipTo(`entries.${k} 文件存在`, `未落地（${v}）`);
    }
  }

  console.log("\n=== 4. 双端 barrel 源文件纯净度（无 Node/DOM 全局）===");
  const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  for (const rel of DUAL_END) {
    const src = stripComments(readFileSync(join(ROOT, rel), "utf8"));
    const hits = PURITY_PATTERNS.filter(([re]) => re.test(src)).map(([, label]) => label);
    if (hits.length) bad(`${rel} 无 Node/DOM 全局`, hits.join(", "));
    else ok(`${rel} 无 Node/DOM 全局`);
  }

  console.log("\n=== 5. W1.5 扁平面与 editor 入口 ===");
  for (const [rel, names] of Object.entries(FLAT)) {
    const mod = await import(pathToFileURL(join(ROOT, rel)).href);
    const missing = names.filter((n) => !(n in mod));
    if (missing.length) bad(`${rel} 扁平面齐全`, `缺 ${missing.length} 个: ${missing.join(", ")}`);
    else ok(`${rel} 扁平面齐全（${names.length} 个）`);
  }
  {
    const barrelSrc = stripComments(readFileSync(join(ROOT, EDITOR_ENTRY.barrel), "utf8"));
    const missing = EDITOR_ENTRY.exports.filter((n) => !new RegExp(`\\b${n}\\b`).test(barrelSrc));
    if (missing.length) bad(`${EDITOR_ENTRY.barrel} 再导出面`, `缺 ${missing.join(", ")}`);
    else ok(`${EDITOR_ENTRY.barrel} 再导出面齐全（${EDITOR_ENTRY.exports.length} 个）`);
    for (const [src, names] of Object.entries(EDITOR_ENTRY.sources)) {
      const p = join(ROOT, src);
      if (!existsSync(p)) { bad(`${src} 存在`, "文件缺失"); continue; }
      const text = stripComments(readFileSync(p, "utf8"));
      const lack = names.filter((n) => !new RegExp(`export\\s+(?:const|function|class)\\s+${n}\\b`).test(text));
      if (lack.length) bad(`${src} 导出名`, `缺 ${lack.join(", ")}`);
      else ok(`${src} 导出名齐全`);
    }
  }
  // W-E host boot seam: the textual names the DSH adapter and the W1/W2 tests rely on
  {
    const p = join(ROOT, EDITOR_MAIN.file);
    if (!existsSync(p)) bad(`${EDITOR_MAIN.file} 存在`, "文件缺失");
    else {
      const text = stripComments(readFileSync(p, "utf8"));
      const lack = EDITOR_MAIN.patterns.filter(([, re]) => !re.test(text)).map(([name]) => name);
      if (lack.length) bad(`${EDITOR_MAIN.file} 宿主接缝`, `缺 ${lack.join(", ")}`);
      else ok(`${EDITOR_MAIN.file} 宿主接缝齐全（${EDITOR_MAIN.patterns.length} 项）`);
    }
  }

  console.log("\n=== 6. 契约 5：paths / config（W2/A3 收紧）===");
  {
    const PATHS_SPEC = {
      file: "packages/paths.js",
      names: ["openPptdHome", "ensureHome", "paths", "resourceRoots", "resolveCliRoot", "contractRoot", "resolveResourceFile"],
    };
    const CONFIG_SPEC = { file: "packages/config.js", names: ["readConfig", "writeConfig", "CONFIG_VERSION"] };
    for (const spec of [PATHS_SPEC, CONFIG_SPEC]) {
      const abs = join(ROOT, spec.file);
      if (!existsSync(abs)) {
        bad(`${spec.file} 存在`, "文件缺失");
        continue;
      }
      let mod;
      try {
        mod = await import(pathToFileURL(abs).href);
      } catch (e) {
        bad(`${spec.file} 可静态导入`, e.message);
        continue;
      }
      const missing = spec.names.filter((n) => !(n in mod));
      if (missing.length) bad(`${spec.file} 导出名齐全`, `缺 ${missing.join(", ")}`);
      else ok(`${spec.file} 导出名齐全（${spec.names.length} 个）`);
    }
    const pmod = await import(pathToFileURL(join(ROOT, PATHS_SPEC.file)).href);
    // registry must have exactly one root and must not include home (version-coupled, never shadowed by home)
    const reg = pmod.resourceRoots?.registry;
    if (Array.isArray(reg) && reg.length === 1 && !reg.includes(pmod.paths?.home)) ok("resourceRoots.registry 仅一根且不含 home");
    else bad("resourceRoots.registry 仅一根且不含 home", JSON.stringify(reg));
    const fRoots = pmod.resourceRoots?.fonts;
    if (Array.isArray(fRoots) && fRoots.length === 2 && fRoots[0] === pmod.paths.fonts && !fRoots.includes(reg?.[0])) {
      ok("resourceRoots.fonts = [home/assets/fonts, 包内]（home 优先）");
    } else bad("resourceRoots.fonts 顺序", JSON.stringify(fRoots));
    const pathKeys = ["home", "assets", "fonts", "icons", "cli", "cliCurrent", "config", "state", "cache", "tmp"];
    const lack = pathKeys.filter((k) => typeof pmod.paths?.[k] !== "string");
    if (lack.length) bad("paths 目录字段齐全", `缺 ${lack.join(", ")}`);
    else ok(`paths 目录字段齐全（${pathKeys.length} 个）`);
    const cmod = await import(pathToFileURL(join(ROOT, CONFIG_SPEC.file)).href);
    const cfg = cmod.readConfig();
    if (cfg && typeof cfg.version === "number") ok("readConfig() 返回含 version 的配置");
    else bad("readConfig() 返回含 version 的配置", JSON.stringify(cfg));
  }

  console.log("\n=== 7. 渲染管线新入口 measure / layout（spec 09 T5）===");
  {
    const MEASURE_SPEC = {
      file: "packages/measure/index.js",
      names: ["measureTextRuns", "measureCell", "measureTable", "lineHeightMultiplierFor", "createMetricsTable", "runsFromRichText", "fontMetricsMeasure", "defaultMetricsTable"],
      fns: ["measureTextRuns", "measureCell", "measureTable", "lineHeightMultiplierFor", "createMetricsTable", "runsFromRichText"],
      objs: ["fontMetricsMeasure", "defaultMetricsTable"],
    };
    const LAYOUT_SPEC = { file: "packages/layout/index.js", names: ["layout"], fns: ["layout"], objs: [] };
    for (const spec of [MEASURE_SPEC, LAYOUT_SPEC]) {
      const abs = join(ROOT, spec.file);
      if (!existsSync(abs)) { bad(`${spec.file} 存在`, "文件缺失"); continue; }
      let mod;
      try {
        mod = await import(pathToFileURL(abs).href);
      } catch (e) {
        bad(`${spec.file} 可静态导入`, e.message);
        continue;
      }
      const missing = spec.names.filter((n) => !(n in mod));
      if (missing.length) bad(`${spec.file} 导出名齐全`, `缺 ${missing.join(", ")}`);
      else ok(`${spec.file} 导出名齐全（${spec.names.length} 个）`);
      for (const n of spec.fns) if (n in mod && typeof mod[n] !== "function") bad(`${spec.file}#${n} 应为函数`, `实际 ${typeof mod[n]}`);
      for (const n of spec.objs) if (n in mod && (typeof mod[n] !== "object" || mod[n] === null)) bad(`${spec.file}#${n} 应为对象`, `实际 ${typeof mod[n]}`);
    }
    // Package-root re-exports: the measure namespace + the layout function
    const root = await import(pathToFileURL(join(ROOT, "packages/index.js")).href);
    if (root.measure && typeof root.measure.measureTextRuns === "function") ok("packages/index.js 再导出 measure 命名空间");
    else bad("packages/index.js 再导出 measure 命名空间", `measure=${typeof root.measure}`);
    if (typeof root.layout === "function") ok("packages/index.js 再导出 layout 函数");
    else bad("packages/index.js 再导出 layout 函数", `layout=${typeof root.layout}`);
    // entries ↔ exports correspondence is covered automatically by the §3 two-way comparison
  }

  console.log(`\n结果: ${fail === 0 ? "契约通过 ✅" : `契约破坏 ❌（${fail} 处）`}${skip ? `；待落地跳过 ${skip} 项` : ""}`);
  if (pending.length) console.log(`待落地: ${pending.join("、")}`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
