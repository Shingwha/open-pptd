// ============================================================================
// tests/regression/dep-graph.mjs — 依赖方向与环境全局静态扫描（v3 P0，CI 强制）
// ----------------------------------------------------------------------------
// 扫描 packages/ 与 editor/ 下全部 .js/.mjs 的 import 语句与源码，断言：
//   1. packages/model 不得 import 任何兄弟包（packages/ 内其他目录）；
//   2. 允许的跨包 import 边表（spec 09 T0/T5，渲染管线三段式）：
//        writer   → model | vendor | measure
//        renderer → model | vendor | layout
//        layout   → model | measure
//        measure  → model
//      其余跨包方向一律违规。表里含 vendor（中立共享 vendor 区，如 echarts.mjs）；
//      "存在即检查"：目标包目录尚不存在时不报错（edge 表先行，新包随后落地）。
//   3. editor/ 不得 import packages/server、packages/cli（P1 才建，规则先写上）；
//   4. 环境全局（vendor/ 子目录豁免）：
//      - packages/model、packages/writer：禁 window./document./require(/裸 fs./node: 来源
//        （双端包，Node CLI 链路不能带浏览器全局，浏览器链路不能带 Node 全局）；
//      - packages/renderer（headless 之外）：DOM 是其输出目标（v3 §3「renderer 仍输出
//        DOM」），允许 window./document.；仍禁 require(/裸 fs./node: 来源，防 Node API
//        渗入浏览器预览链路。
//      - packages/measure、packages/layout（渲染管线新包）：双端纯函数，无 headless
//        豁免——禁 window./document./require(/裸 fs./node:（与 model/writer 同档）。
//      - packages/renderer/headless/：Node 专用子目录（无头截图链路），豁免环境全局
//        与 node: import 检查，但仍受 import 图规则约束（不得反向 import editor/）。
//   5. 包级 barrel（packages/index.js 与 packages/*/index.js）不得 import editor/
//      （spec 01 T5：包级入口是「契约 4」的对外面，依赖方向只允许 editor → packages）。
// 用法：node tests/regression/dep-graph.mjs（失败打印违规文件与行号，非零码退出）
// ============================================================================

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// ---- 既存有意豁免（逐一登记，新增豁免须附理由）----
const ALLOWLIST = [
  {
    file: "packages/writer/pptx.js",
    pattern: /\bdocument\./,
    reason: "downloadPptx 浏览器下载助手（仅浏览器端调用，Node 导出链路不触达）",
  },
  {
    file: "packages/model/font-registry.js",
    pattern: /^path$/,
    kind: "import",
    reason: "Node 端 fontDir 分支的惰性 path 导入（依赖注入，浏览器端走 fetch 不触达）",
  },
];

// ---- 收集待扫描文件 ----
function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(js|mjs)$/.test(e.name)) out.push(p);
  }
  return out;
}
const files = [...walk(join(ROOT, "packages")), ...walk(join(ROOT, "editor"))];

const rel = (p) => relative(ROOT, p).split(sep).join("/");
const inVendor = (r) => r.split("/").includes("vendor");
const inHeadless = (r) => r.startsWith("packages/renderer/headless/"); // Node 专用子目录（无头截图链路）
// 双端包（浏览器 + Node 都可跑，需环境纯净）；server/cli 是 Node 专用，不受环境全局与 node: 来源约束
const DUAL_END_PKGS = new Set(["model", "writer", "renderer", "measure", "layout"]);
// 允许的跨包 import 边（spec 09 T0/T5 目标态；model 单独按"不得引任何兄弟包"处理）
const ALLOWED_CROSS = {
  writer: ["model", "vendor", "measure"],
  renderer: ["model", "vendor", "layout"],
  layout: ["model", "measure"],
  measure: ["model"],
};
const pkgOf = (r) => (r.startsWith("packages/") ? r.split("/")[1] : null);

// ---- import 语句提取（静态 from / 副作用 import / 动态 import()）----
const IMPORT_RE = /(?:\bfrom|\bimport)\s*(?:\(\s*)?["']([^"']+)["']/g;

function importsOf(src) {
  const out = [];
  for (const m of src.matchAll(IMPORT_RE)) {
    const line = src.slice(0, m.index).split("\n").length;
    out.push({ source: m[1], line });
  }
  return out;
}

// ---- 注释剥离（保行号：注释内容替换为空格，字符串/正则原样保留）----
// 正则字面量用常见启发式：/ 前一个有效字符是运算符/括号/关键字边界时按正则处理。
function stripComments(src) {
  let out = "";
  let i = 0, state = null; // null | "'" | '"' | '`' | '//' | '/*' | 'regex'
  let last = ""; // 上一个非空白有效字符（判断除法 vs 正则）
  const regexPrev = (ch) => ch === "" || "(,=:[!&|?{};+-*%<>^~".includes(ch);
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (state === "//") {
      if (c === "\n") { state = null; out += c; } else out += " ";
      i++;
    } else if (state === "/*") {
      if (c === "*" && n === "/") { out += "  "; i += 2; state = null; }
      else { out += c === "\n" ? "\n" : " "; i++; }
    } else if (state === "regex") {
      out += c;
      if (c === "\\") { out += n || ""; i += 2; continue; }
      if (c === "/") { state = "regex-flags"; }
      i++;
    } else if (state === "regex-flags") {
      out += c;
      if (!/[a-z]/.test(c)) { state = null; last = "/"; }
      i++;
    } else if (state) {
      out += c;
      if (c === "\\") { out += n || ""; i += 2; continue; }
      if (c === state) state = null;
      i++;
    } else if (c === "/" && n === "/") { state = "//"; out += "  "; i += 2; }
    else if (c === "/" && n === "*") { state = "/*"; out += "  "; i += 2; }
    else if (c === "/" && regexPrev(last)) { state = "regex"; out += c; i++; }
    else if (c === "'" || c === '"' || c === "`") { state = c; out += c; i++; last = c; }
    else {
      out += c;
      if (!/\s/.test(c)) last = c;
      i++;
    }
  }
  return out;
}

// ---- 环境全局模式 ----
const ENV_PATTERNS = [
  { id: "window.", re: /\bwindow\./ },
  { id: "document.", re: /\bdocument\./ },
  { id: "require(", re: /\brequire\s*\(/ },
  { id: "fs.", re: /(?<![\w$.])fs\./ }, // 裸 fs. 全局；options.fs. 依赖注入不算
];

const violations = [];
const exemptions = [];
let importCount = 0;

function allowlisted(r, lineText, lineNo, key) {
  const hit = ALLOWLIST.find((a) => a.file === r && (a.kind === "import" ? a.pattern.test(key) : a.pattern.test(lineText)));
  if (hit) exemptions.push(`${r}:${lineNo}（${hit.reason}）`);
  return !!hit;
}

for (const abs of files) {
  const r = rel(abs);
  const src = readFileSync(abs, "utf8");
  const pkg = pkgOf(r);

  // ---- import 图检查 ----
  for (const { source, line } of importsOf(src)) {
    importCount++;
    const lineText = src.split("\n")[line - 1] || "";
    if (source.startsWith(".")) {
      const targetRel = rel(resolve(dirname(abs), source));
      const targetPkg = pkgOf(targetRel);
      if (pkg === "model" && targetPkg && targetPkg !== "model") {
        violations.push(`${r}:${line}  model 不得 import 兄弟包 packages/${targetPkg}（${source}）`);
      } else if (ALLOWED_CROSS[pkg] && targetPkg && targetPkg !== pkg && !ALLOWED_CROSS[pkg].includes(targetPkg) && !allowlisted(r, lineText, line, source)) {
        // 跨包边表（spec 09 T0/T5）：不在允许集内的跨包方向一律违规
        violations.push(`${r}:${line}  packages/${pkg} 只允许 import ${ALLOWED_CROSS[pkg].map((t) => t === "vendor" ? "../vendor" : "../" + t).join(" / ")}（实际指向 packages/${targetPkg}：${source}）`);
      } else if (!pkg && r.startsWith("editor/") && (targetRel.startsWith("packages/server/") || targetRel.startsWith("packages/cli/") || targetRel === "packages/server" || targetRel === "packages/cli")) {
        violations.push(`${r}:${line}  editor 不得 import packages/server、packages/cli（${source}）`);
      }
      // 规则 6（spec W1.5）：editor 只准经包级入口（packages/<pkg>/index.js）消费引擎，
      // 深路径自契约 4 起不保证稳定（3.0 移除）
      if (!pkg && r.startsWith("editor/") && targetRel.startsWith("packages/")) {
        const m = targetRel.match(/^packages\/([^/]+)\/(.+)$/);
        if (m && m[2] !== "index.js") {
          violations.push(`${r}:${line}  editor 不得深路径 import packages/${m[1]}/${m[2]}，请走包级入口 packages/${m[1]}/index.js（契约 4）`);
        }
      }
      // packages 内文件不得反向 import editor/（依赖方向只允许 editor → packages）
      if (pkg && targetRel.startsWith("editor/")) {
        violations.push(`${r}:${line}  packages/${pkg} 不得 import editor/（${source}）`);
      }
    } else {
      // 非相对来源检查仅针对双端包（model/writer/renderer；server/cli 是 Node 专用，天然用 node:）：
      // node: 一律禁（非 vendor、非 headless）；裸来源（Node 内置/第三方）登记豁免才放行
      if (DUAL_END_PKGS.has(pkg) && !inVendor(r) && !inHeadless(r)) {
        if (source.startsWith("node:")) {
          violations.push(`${r}:${line}  packages/${pkg} 出现 node: import 来源（${source}）`);
        } else if (!allowlisted(r, lineText, line, source)) {
          violations.push(`${r}:${line}  packages/${pkg} 出现非相对 import 来源（${source}；零依赖项目应为相对路径，Node 内置请走依赖注入）`);
        }
      }
    }
  }

  // ---- 环境全局检查（仅双端包；vendor 与 headless 豁免；renderer 允许浏览器全局）----
  if (DUAL_END_PKGS.has(pkg) && !inVendor(r) && !inHeadless(r)) {
    const isRenderer = pkg === "renderer";
    const stripped = stripComments(src);
    const lines = stripped.split("\n");
    for (let n = 0; n < lines.length; n++) {
      for (const { id, re } of ENV_PATTERNS) {
        if (isRenderer && (id === "window." || id === "document.")) continue; // DOM 是 renderer 的输出目标
        if (!re.test(lines[n])) continue;
        if (allowlisted(r, lines[n], n + 1, id)) continue;
        violations.push(`${r}:${n + 1}  packages/${pkg} 出现环境全局 ${id}（${lines[n].trim().slice(0, 80)}）`);
      }
    }
  }
}

// ---- 追加规则 5：包级 barrel 不得 import editor/（纯增量，spec 01 T5）----
// 既存分支（packages 内文件不得反向 import editor/）会覆盖同一违规，这里对包级入口
// 再显式断言一次（入口是对外契约面，值得单独可见）：命中时两条规则各报一行。
const BARREL_RE = /^packages\/(?:index\.js|[^/]+\/index\.js)$/;
const barrels = files.filter((abs) => BARREL_RE.test(rel(abs)));
for (const abs of barrels) {
  const r = rel(abs);
  for (const { source, line } of importsOf(readFileSync(abs, "utf8"))) {
    if (!source.startsWith(".")) continue;
    const targetRel = rel(resolve(dirname(abs), source));
    if (targetRel === "editor" || targetRel.startsWith("editor/")) {
      violations.push(`${r}:${line}  packages/ 包级 barrel 不得 import editor/（${source}）`);
    }
  }
}

// ---- 汇总 ----
console.log(`dep-graph: 扫描 ${files.length} 个文件，${importCount} 处 import（含包级 barrel ${barrels.length} 个）`);
if (exemptions.length) {
  console.log(`  登记豁免 ${exemptions.length} 处：`);
  for (const e of exemptions) console.log(`    - ${e}`);
}
if (violations.length) {
  console.error(`\n✗ 依赖方向/环境全局违规 ${violations.length} 处：`);
  for (const v of violations) console.error(`  ${v}`);
  process.exit(1);
}
console.log("✓ 依赖方向与环境全局检查通过");
