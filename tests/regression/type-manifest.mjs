// ============================================================================
// tests/regression/type-manifest.mjs — TypeManifest + lazy shard regression (W4)
// ----------------------------------------------------------------------------
// 1. ELEMENT_TYPES === manifest ids (order included); descriptor fields complete;
//    group composite; contentEditor only text/table/chart; no descriptor imports
//    style-spec (cycle guard).
// 2. Every built-in type: schema hook validates (valid passes / missing field
//    reports schema-type), render shard registered and paints (DOM stub; chart
//    uses the pure option builder — the ECharts canvas path is covered by
//    tests/e2e/render.mjs), toXml shard registered and buildPptx succeeds.
// 3. A new test type (descriptor + dynamic render/toXml shard via types/load.js)
//    validates/renders/exports without editing the static shard indexes.
// 4. Lazy boundary: importing the renderer shard loader registers no writer
//    toXml; composite types load no shard; static import closures keep
//    renderer ⊅ writer and writer/export ⊅ editor.
// 5. Unknown types still fail validation; group shells pass and layout skips them.
// Usage: node tests/regression/type-manifest.mjs (non-zero exit = contract broken)
// ============================================================================

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { ELEMENT_TYPES } from "../../packages/model/style-spec.js";
import {
  allTypes, defineType, getType, isKnownType, registerType, typeIds,
} from "../../packages/model/registry.js";
import { TYPE_DEFS, TYPE_IDS, defineType as defineMeta } from "../../packages/model/types/index.js";
import { validateDeck } from "../../packages/model/validate.js";
import { layout } from "../../packages/layout/index.js";
import { normalizeTheme } from "../../packages/model/theme.js";
import { resolveChartSpec } from "../../packages/model/chart/spec.js";
import { buildOptionFromSpec } from "../../packages/model/chart/option/index.js";
// Real render function for the lazy-text test (importing the module registers nothing).
import { renderText } from "../../packages/renderer/text.js";
// Shard loaders only: importing them registers nothing by itself.
import { loadType as loadRenderType, loadTypes as loadRenderTypes } from "../../packages/renderer/types/load.js";
import { loadType as loadXmlType } from "../../packages/writer/types/load.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
let ok = true;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) ok = false;
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------------------------------------------------------------------------
// 0. Lazy boundary: registry is seeded from the manifest, no shard is loaded yet
// ---------------------------------------------------------------------------
check("registry 仅含 manifest 元数据（尚未加载分片）", typeof getType("text").render === "undefined" && typeof getType("text").toXml === "undefined");
let textShaderSpec = null;
await loadRenderType("text", async (spec) => {
  textShaderSpec = spec;
  registerType({ type: "text", render: renderText });
  return {};
});
check("renderer 分片按 id 懒加载（./<id>.js 约定）", textShaderSpec === "./text.js" && typeof getType("text").render === "function");
let reloadCalls = 0;
await loadRenderType("text", async () => { reloadCalls += 1; return {}; });
check("已注册分片不重复加载", reloadCalls === 0);

let groupImportCalls = 0;
const groupDef = await loadRenderType("group", async () => { groupImportCalls += 1; return {}; });
check("group composite 不加载 render 分片", groupImportCalls === 0 && groupDef.composite === true);
let groupXmlCalls = 0;
const groupXmlDef = await loadXmlType("group", async () => { groupXmlCalls += 1; return {}; });
check("group composite 不加载 toXml 分片", groupXmlCalls === 0 && groupXmlDef.toXml === undefined);

const rejects = async (fn) => {
  try { await fn(); return false; } catch { return true; }
};
check("未定义类型拒绝懒加载", await rejects(() => loadRenderType("widget")));
check("非法 id 拒绝懒加载（路径穿越防护）", await rejects(() => loadRenderType("../evil")));

// ---------------------------------------------------------------------------
// 1. Manifest: ELEMENT_TYPES / descriptor completeness / composite / contentEditor
// ---------------------------------------------------------------------------
check("ELEMENT_TYPES === TYPE_IDS（顺序不变）", same(ELEMENT_TYPES, TYPE_IDS) && same(TYPE_IDS, ["text", "shape", "line", "image", "icon", "table", "chart", "group"]));
check("typeIds() === manifest ids", same(typeIds(), TYPE_IDS));
check("allTypes() 由 manifest 初始化", TYPE_IDS.every((id) => allTypes().some((t) => t.id === id)));

const expectedLabels = { text: "文字", shape: "形状", line: "线条", image: "图片", icon: "图标", table: "表格", chart: "图表", group: "组合" };
const descriptorComplete = TYPE_DEFS.every((def) =>
  typeof def.id === "string" && def.id &&
  typeof def.label === "string" && def.label &&
  typeof def.composite === "boolean" &&
  typeof def.contentEditor === "boolean" &&
  (typeof def.schema === "function" || def.composite) // schema is optional; composite group has none
);
check("每个 descriptor 字段完整（id/label/composite/contentEditor/schema*）", descriptorComplete);
check("descriptor label 与编辑器 shard 一致", TYPE_DEFS.every((def) => def.label === expectedLabels[def.id]));
check("composite 仅 group", TYPE_DEFS.filter((def) => def.composite).map((def) => def.id).join(",") === "group");
check("contentEditor 仅 text/table/chart", same(TYPE_DEFS.filter((def) => def.contentEditor).map((def) => def.id), ["text", "table", "chart"]));
check("layoutKey 仅 text/table", same(TYPE_DEFS.filter((def) => def.layoutKey).map((def) => `${def.id}:${def.layoutKey}`), ["text:text", "table:table"]));
check("注册表条目与 descriptor 一致", TYPE_DEFS.every((def) => {
  const t = getType(def.id);
  return t && t.label === def.label && t.composite === def.composite && t.contentEditor === def.contentEditor && t.schema === def.schema;
}));
check("isKnownType 覆盖 manifest ids", TYPE_IDS.every((id) => isKnownType(id)) && !isKnownType("widget"));

const typeDir = join(ROOT, "packages", "model", "types");
const descriptorFiles = readdirSync(typeDir).filter((f) => f.endsWith(".js"));
const cycleHits = descriptorFiles.filter((f) => /from\s+["'][^"']*style-spec\.js["']/.test(readFileSync(join(typeDir, f), "utf8")));
check("descriptor 不 import style-spec（防循环）", cycleHits.length === 0, cycleHits.join(","));

// ---------------------------------------------------------------------------
// 2. Built-in types: validate / render / toXml smoke
// ---------------------------------------------------------------------------
const PNG_1X1 = Uint8Array.from(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
));
const IMG_DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function validElements() {
  return {
    text: { elementId: "t1", elementType: "text", bounds: [10, 10, 220, 60], content: { text: "类型冒烟", fontSize: 18 } },
    shape: { elementId: "s1", elementType: "shape", bounds: [10, 80, 120, 80], shapeName: "rect" },
    line: { elementId: "l1", elementType: "line", bounds: [10, 170, 200, 20], viewBox: [200, 20], points: "0,10 200,10" },
    image: { elementId: "i1", elementType: "image", bounds: [10, 200, 80, 60], src: IMG_DATA_URL },
    icon: { elementId: "c1", elementType: "icon", bounds: [100, 200, 40, 40], iconName: "fas fa-star" },
    table: { elementId: "b1", elementType: "table", bounds: [10, 280, 300, 70], rows: [[{ text: "A" }, { text: "B" }], [{ text: "1" }, { text: "2" }]], columnWidths: [0.5, 0.5] },
    chart: { elementId: "h1", elementType: "chart", bounds: [340, 10, 560, 300], data: { cols: ["x", "y"], rows: [["A", 1], ["B", 2]] }, series: [{ type: "bar", encode: { x: "x", y: "y" } }] },
    group: { elementId: "g1", elementType: "group", bounds: [0, 0, 400, 400], children: ["t1"] },
  };
}

const els = validElements();
const validDeck = { version: "v2", title: "types", size: [960, 540], pages: [{ elements: Object.values(els) }] };
const validReport = validateDeck(validDeck);
check("8 个内置类型 validate 冒烟（0 error）", validReport.errors.length === 0, validReport.errors.map((e) => e.message).join("; "));

const broken = {
  text: { ...els.text, content: undefined },
  shape: { ...els.shape, shapeName: undefined },
  line: { ...els.line, points: undefined, viewBox: undefined },
  image: { ...els.image, src: undefined },
  icon: { ...els.icon, iconName: undefined },
  table: { ...els.table, rows: undefined },
  chart: { ...els.chart, data: undefined, series: undefined },
};
const schemaHits = Object.entries(broken).map(([type, el]) => {
  const errs = validateDeck({ version: "v2", size: [960, 540], pages: [{ elements: [el] }] }).errors;
  return [type, errs.some((e) => e.rule === "schema-type")];
});
check("每个 schema hook 都产出 schema-type issue", schemaHits.every(([, hit]) => hit), schemaHits.filter(([, hit]) => !hit).map(([t]) => t).join(","));
check("group 壳不被当成未知类型", !validateDeck({ version: "v2", size: [960, 540], pages: [{ elements: [els.group, els.text] }] }).errors.some((e) => e.rule === "schema"));

// --- render smoke (DOM stub; chart option is pure, real canvas path is e2e/render) ---
class FakeNode {
  constructor(tag, ns = null) {
    this.tagName = tag;
    this.namespaceURI = ns;
    this.children = [];
    this.style = {};
    this.dataset = {};
    this.attributes = {};
    this.className = "";
    this.innerHTML = "";
    this._text = "";
  }
  appendChild(node) { this.children.push(node); return node; }
  append(...nodes) { for (const n of nodes) this.appendChild(n); }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k]; }
  addEventListener() {}
  set textContent(v) { this._text = String(v); }
  get textContent() { return this._text; }
}
globalThis.document = {
  createElement: (tag) => new FakeNode(tag),
  createElementNS: (ns, tag) => new FakeNode(tag, ns),
};

// Static closure (all built-in shards): import the barrel, like the preview entry does.
await import("../../packages/renderer/index.js");
const theme = normalizeTheme(null);
const renderIds = ["text", "shape", "line", "image", "icon", "table"];
const renderFails = [];
for (const id of renderIds) {
  try {
    const node = getType(id).render(theme, els[id], {});
    if (!node || node.dataset.elementId !== els[id].elementId) renderFails.push(id);
  } catch (err) {
    renderFails.push(`${id}:${err.message}`);
  }
}
check("6 个非图表类型 render 冒烟（DOM 桩）", renderFails.length === 0, renderFails.join(","));
const chartDef = getType("chart");
const chartOption = buildOptionFromSpec(resolveChartSpec(theme, els.chart));
check("chart render 分片注册 + option 组装", typeof chartDef.render === "function" && chartOption && typeof chartOption.series?.length === "number");
check("group 无 render 分片（composite）", getType("group").render === undefined);

// --- toXml smoke: static writer closure + one buildPptx over all types ---
await import("../../packages/writer/index.js");
const { buildPptx } = await import("../../packages/writer/pptx.js");
check("7 个可绘制类型 toXml 分片注册", ["text", "shape", "line", "image", "icon", "table", "chart"].every((id) => typeof getType(id).toXml === "function"));
check("group 无 toXml 分片（导出跳过壳）", getType("group").toXml === undefined);
const pptxBytes = await buildPptx(validDeck, {
  loadImage: (src) => (src === IMG_DATA_URL ? { bytes: PNG_1X1, ext: "png", size: [1, 1] } : null),
  iconRegistry: {}, // no network: icon shard dispatches and skips the missing def
});
check("8 类型混排 buildPptx 成功（PK 签名）", pptxBytes[0] === 0x50 && pptxBytes[1] === 0x4b && pptxBytes.length > 20000, `${pptxBytes.length} bytes`);

// --- layout: composite shell skipped / layoutKey dispatch ---
const lt = layout(validDeck);
check("layout 跳过 group 壳、成员独立", lt.pages[0].elements.length === 7 && !lt.pages[0].elements.some((e) => e.elementType === "group"));
check("layoutKey text/table 命中本地 hook", lt.pages[0].elements.find((e) => e.elementId === "t1").text != null && lt.pages[0].elements.find((e) => e.elementId === "b1").table != null);

// ---------------------------------------------------------------------------
// 3. New type: descriptor + dynamic shards only (no static index edit)
// ---------------------------------------------------------------------------
const demoDesc = defineMeta({
  id: "demo",
  label: "演示类型",
  schema: (el) => (el.demoOk ? [] : [{ message: "demo 元素缺 demoOk" }]),
});
defineType(demoDesc);
check("defineType 注册元数据（typeIds/allTypes 更新）", typeIds().includes("demo") && allTypes().some((t) => t.id === "demo"));

const demoBad = { version: "v2", size: [960, 540], pages: [{ elements: [{ elementId: "d1", elementType: "demo", bounds: [0, 0, 10, 10] }] }] };
const demoBadReport = validateDeck(demoBad);
check("新类型可校验（schema hook / 不再未知）", demoBadReport.errors.some((e) => e.rule === "schema-type" && e.message === "demo 元素缺 demoOk") && !demoBadReport.errors.some((e) => e.rule === "schema"));
check("未知类型仍被抓", validateDeck({ version: "v2", size: [960, 540], pages: [{ elements: [{ elementId: "w1", elementType: "widget", bounds: [0, 0, 10, 10] }] }] }).errors.some((e) => e.rule === "schema"));

let demoSrc = null;
let demoXmlSrc = null;
let demoXmlCalls = 0;
await loadRenderType("demo", async (spec) => {
  demoSrc = spec;
  registerType({ type: "demo", render: (t, el) => ({ demoNode: el.elementId }) });
  return {};
});
await loadXmlType("demo", async (spec) => {
  demoXmlSrc = spec;
  registerType({ type: "demo", toXml: () => { demoXmlCalls += 1; return ""; } });
  return {};
});
check("新类型分片按 id 动态加载（renderer/writer）", demoSrc === "./demo.js" && demoXmlSrc === "./demo.js");
check("新类型 render/toXml 可调用", getType("demo").render(theme, { elementId: "d1" }).demoNode === "d1" && typeof getType("demo").toXml === "function");

const demoDeck = { version: "v2", title: "demo", size: [960, 540], pages: [{ elements: [{ elementId: "d1", elementType: "demo", bounds: [10, 10, 100, 50], demoOk: true }] }] };
const demoBytes = await buildPptx(demoDeck, { iconRegistry: {} });
check("新类型可导出（descriptor + 分片即可）", demoBytes[0] === 0x50 && demoXmlCalls === 1);
check("ELEMENT_TYPES 仍是内置 8 类（manifest 常量不漂移）", ELEMENT_TYPES.length === 8 && !ELEMENT_TYPES.includes("demo"));

// ---------------------------------------------------------------------------
// 4. Static import closure boundaries (source scan)
// ---------------------------------------------------------------------------
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}
function staticImports(src) {
  return [...stripComments(src).matchAll(/\b(?:from|import)\s*(?:\(\s*)?["']([^"']+)["']/g)].map((m) => m[1]);
}
function closure(entry) {
  const seen = new Set();
  const stack = [resolve(ROOT, entry)];
  while (stack.length) {
    const file = stack.pop();
    const key = relative(ROOT, file).split(sep).join("/");
    if (seen.has(key) || !existsSync(file)) continue;
    seen.add(key);
    for (const spec of staticImports(readFileSync(file, "utf8"))) {
      if (!spec.startsWith(".")) continue;
      let target = resolve(dirname(file), spec);
      if (!existsSync(target) && existsSync(target + ".js")) target += ".js";
      stack.push(target);
    }
  }
  return [...seen];
}
const rendererClosure = closure("packages/renderer/index.js");
const writerClosure = closure("packages/writer/index.js");
const exportClosure = closure("packages/export/index.js");
const modelClosure = closure("packages/model/index.js");
check("renderer 静态闭包不含 writer/editor", !rendererClosure.some((p) => p.startsWith("packages/writer/") || p.startsWith("editor/")), rendererClosure.filter((p) => p.startsWith("packages/writer/") || p.startsWith("editor/")).join(","));
check("renderer 静态闭包含 render 分片", rendererClosure.includes("packages/renderer/types/chart.js"));
check("writer 静态闭包不含 editor", !writerClosure.some((p) => p.startsWith("editor/")));
check("writer 静态闭包含 toXml 分片", writerClosure.includes("packages/writer/types/chart.js"));
check("export 静态闭包不含 editor", !exportClosure.some((p) => p.startsWith("editor/")));
const modelSiblings = modelClosure.filter((p) => {
  const m = p.match(/^packages\/([^/]+)\//);
  return m && m[1] !== "model";
});
check("model 静态闭包不 import 兄弟包", modelSiblings.length === 0, modelSiblings.join(","));

// ---------------------------------------------------------------------------
// 5. Summary
// ---------------------------------------------------------------------------
console.log(`\n结果: ${ok ? "TypeManifest 契约通过 ✅" : "TypeManifest 契约失败 ❌"}`);
process.exit(ok ? 0 : 1);
