// ============================================================================
// tests/contract/public-api.mjs — 包级公共契约测试（契约 4，见 docs/embedding.md）
// ----------------------------------------------------------------------------
// 断言：
//   1. 五个已存在 barrel 的导出名齐全（与 spec 01 T1 清单逐一比对）；
//   2. CONTRACT_VERSION === 2，且与 contract.json 的 contractVersion 一致；
//   3. contract.json 可解析；entries 与 package.json exports 的对应条目一一对应
//      （双向，防口径漂移）；entries 指向的已存在文件存在（paths/config 落地前
//      打印 SKIP —— W2/A3 后收紧为 FAIL）；
//   4. model/renderer/writer 三个双端 barrel 可静态导入，且源文件不含 Node/DOM
//      全局（浏览器安全约束，与 dep-graph 既有四条互补）；
//   5. W1.5 扁平再导出清单（editor 消费面）与 editor 入口（open-pptd/editor）：
//      editor barrel 依赖 DOM、无法在 Node 静态导入，改用文本断言（剥离注释后
//      必须出现再导出语句）+ 被引源文件与其导出名存在。
// 用法：node tests/contract/public-api.mjs（非零码退出 = 契约破坏）
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
// spec 01 T1 的冻结导出清单（函数 / 命名空间对象 / 常量 三类）
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
    // 命名空间抽查（spec 01 T1 点名要求）
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
    // ZipWriter 是 class（typeof "function"），与函数同检
    fns: ["buildPptx", "downloadPptx", "downloadBlob", "magicMatches", "ZipWriter"],
    objs: ["xml", "parts", "text"],
    consts: [],
    namespaceSpot: [["xml", "el"], ["parts", "buildContentTypes"], ["text", "buildTextBody"]],
  },
  "packages/server/index.js": {
    fns: ["createServer", "startServer"],
    objs: [],
    consts: ["PROJECT_ROOT"],
    namespaceSpot: [],
  },
  "packages/cli/index.js": {
    fns: ["runCheck", "exportDeck", "exportProject", "runRender", "runFonts", "runIcons", "runGallery"],
    objs: [],
    consts: [],
    namespaceSpot: [],
  },
};

// 双端 barrel：源文件不得出现 Node 专用来源或 DOM 全局（T1「浏览器安全约束」）
const DUAL_END = ["packages/model/index.js", "packages/renderer/index.js", "packages/writer/index.js"];
const PURITY_PATTERNS = [
  [/\bfrom\s*["']node:/, "node: import"],
  [/\bimport\s*\(\s*["']node:/, "node: 动态 import"],
  [/\bfrom\s*["']fs["']/, "裸 fs import"],
  [/\bwindow\./, "window."],
  [/\bdocument\./, "document."],
  [/\bheadless\//, "headless/ 引用"],
];

// W1.5 扁平再导出清单（editor 消费面；只断言存在，类型随源文件）
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

// editor 入口（契约 1/2/3 的对外面；DOM 依赖，文本断言）
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

  // 双向：entries 每个 key 在 exports 有对应项；exports 里非逃生舱/非元数据项都在 entries
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
    // registry 必须只有一根，且不含 home（版本耦合，永不被 home 遮蔽）
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
    // 包根再导出面：measure 命名空间 + layout 函数
    const root = await import(pathToFileURL(join(ROOT, "packages/index.js")).href);
    if (root.measure && typeof root.measure.measureTextRuns === "function") ok("packages/index.js 再导出 measure 命名空间");
    else bad("packages/index.js 再导出 measure 命名空间", `measure=${typeof root.measure}`);
    if (typeof root.layout === "function") ok("packages/index.js 再导出 layout 函数");
    else bad("packages/index.js 再导出 layout 函数", `layout=${typeof root.layout}`);
    // entries ↔ exports 对应由 §3 双向比对自动覆盖（entries 新增 measure/layout）
  }

  console.log(`\n结果: ${fail === 0 ? "契约通过 ✅" : `契约破坏 ❌（${fail} 处）`}${skip ? `；待落地跳过 ${skip} 项` : ""}`);
  if (pending.length) console.log(`待落地: ${pending.join("、")}`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
