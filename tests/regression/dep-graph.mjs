// ============================================================================
// tests/regression/dep-graph.mjs — dependency direction + environment globals static scan (v3 P0, CI-enforced)
// ----------------------------------------------------------------------------
// Scans every .js/.mjs under packages/ and editor/ for imports and source, asserting:
//   1. packages/model must not import any sibling package (another directory under packages/);
//   2. the allowed cross-package import edge table (spec 09 T0/T5, three-stage render pipeline):
//        writer   → model | vendor | measure
//        renderer → model | vendor | layout
//        layout   → model | measure
//        measure  → model
//      Any other cross-package direction is a violation. The table includes vendor (the neutral
//      shared vendor area, e.g. echarts.mjs); "exists means checked": a missing target package
//      directory is not an error (the edge table lands first, packages follow).
//   3. editor/ must not import packages/server or packages/cli (built at P1; the rule is written early);
//   4. environment globals (vendor/ subdirectories exempt):
//      - packages/model, packages/writer: forbid window./document./require(/bare fs./node: sources
//        (dual-end packages: the Node CLI path must not carry browser globals and the browser path
//        must not carry Node globals);
//      - packages/renderer (outside headless): DOM is its output target (v3 §3 "renderer still emits
//        DOM"), so window./document. are allowed; require(/bare fs./node: sources stay forbidden to
//        keep Node APIs out of the browser preview path.
//      - packages/measure, packages/layout (new pipeline packages): dual-end pure functions with no
//        headless exemption — forbid window./document./require(/bare fs./node: (same tier as model/writer).
//      - packages/renderer/headless/: Node-only subdirectory (headless screenshot path), exempt from
//        environment-global and node: import checks, but still bound by the import graph rules (must
//        not import editor/).
//   5. package barrels (packages/index.js and packages/*/index.js) must not import editor/
//      (spec 01 T5: the package entry is the "contract 4" public face; dependencies only flow editor → packages).
// Usage: node tests/regression/dep-graph.mjs (prints offending file and line, non-zero exit on failure)
// ============================================================================

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// ---- Intentional existing exemptions (registered one by one; new ones need a reason) ----
const ALLOWLIST = [
  {
    file: "packages/writer/pptx.js",
    pattern: /\bdocument\./,
    reason: "downloadPptx browser download helper (browser-only call, the Node export path never reaches it)",
  },
  {
    file: "packages/model/font-registry.js",
    pattern: /^path$/,
    kind: "import",
    reason: "lazy path import in the Node fontDir branch (dependency injection; the browser path uses fetch)",
  },
];

// ---- Collect files to scan ----
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
const inHeadless = (r) => r.startsWith("packages/renderer/headless/"); // Node-only subdirectory (headless screenshot path)
// Dual-end packages (run in both browser and Node, must stay environment-pure); server/cli are
// Node-only and are not bound by the environment-global / node: source rules
const DUAL_END_PKGS = new Set(["model", "writer", "renderer", "measure", "layout"]);
// Allowed cross-package import edges (spec 09 T0/T5 target state; model is handled separately as "no sibling imports")
const ALLOWED_CROSS = {
  writer: ["model", "vendor", "measure"],
  renderer: ["model", "vendor", "layout"],
  layout: ["model", "measure"],
  measure: ["model"],
};
const pkgOf = (r) => (r.startsWith("packages/") ? r.split("/")[1] : null);

// ---- Import extraction (static from / side-effect import / dynamic import()) ----
const IMPORT_RE = /(?:\bfrom|\bimport)\s*(?:\(\s*)?["']([^"']+)["']/g;

function importsOf(src) {
  const out = [];
  for (const m of src.matchAll(IMPORT_RE)) {
    const line = src.slice(0, m.index).split("\n").length;
    out.push({ source: m[1], line });
  }
  return out;
}

// ---- Comment stripping (preserves line numbers: comment text becomes spaces, strings/regex kept) ----
// Regex literals use a common heuristic: a / is a regex start when the previous significant char is
// an operator/bracket/keyword boundary.
function stripComments(src) {
  let out = "";
  let i = 0, state = null; // null | "'" | '"' | '`' | '//' | '/*' | 'regex'
  let last = ""; // previous significant char (distinguishes division from regex)
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

// ---- Environment global patterns ----
const ENV_PATTERNS = [
  { id: "window.", re: /\bwindow\./ },
  { id: "document.", re: /\bdocument\./ },
  { id: "require(", re: /\brequire\s*\(/ },
  { id: "fs.", re: /(?<![\w$.])fs\./ }, // bare fs. global; options.fs. is dependency injection
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

  // ---- import graph check ----
  for (const { source, line } of importsOf(src)) {
    importCount++;
    const lineText = src.split("\n")[line - 1] || "";
    if (source.startsWith(".")) {
      const targetRel = rel(resolve(dirname(abs), source));
      const targetPkg = pkgOf(targetRel);
      if (pkg === "model" && targetPkg && targetPkg !== "model") {
        violations.push(`${r}:${line}  model 不得 import 兄弟包 packages/${targetPkg}（${source}）`);
      } else if (ALLOWED_CROSS[pkg] && targetPkg && targetPkg !== pkg && !ALLOWED_CROSS[pkg].includes(targetPkg) && !allowlisted(r, lineText, line, source)) {
        // Cross-package edge table (spec 09 T0/T5): any direction outside the allowed set is a violation
        violations.push(`${r}:${line}  packages/${pkg} 只允许 import ${ALLOWED_CROSS[pkg].map((t) => t === "vendor" ? "../vendor" : "../" + t).join(" / ")}（实际指向 packages/${targetPkg}：${source}）`);
      } else if (!pkg && r.startsWith("editor/") && (targetRel.startsWith("packages/server/") || targetRel.startsWith("packages/cli/") || targetRel === "packages/server" || targetRel === "packages/cli")) {
        violations.push(`${r}:${line}  editor 不得 import packages/server、packages/cli（${source}）`);
      }
      // Rule 6 (spec W1.5): editor may only consume the engine through package entries
      // (packages/<pkg>/index.js); deep paths are not guaranteed stable since contract 4 (removed in 3.0)
      if (!pkg && r.startsWith("editor/") && targetRel.startsWith("packages/")) {
        const m = targetRel.match(/^packages\/([^/]+)\/(.+)$/);
        if (m && m[2] !== "index.js") {
          violations.push(`${r}:${line}  editor 不得深路径 import packages/${m[1]}/${m[2]}，请走包级入口 packages/${m[1]}/index.js（契约 4）`);
        }
      }
      // Files under packages/ must not import editor/ (dependencies only flow editor → packages)
      if (pkg && targetRel.startsWith("editor/")) {
        violations.push(`${r}:${line}  packages/${pkg} 不得 import editor/（${source}）`);
      }
    } else {
      // Non-relative sources are only checked for dual-end packages (model/writer/renderer; server/cli are
      // Node-only and legitimately use node:): node: is always forbidden (non-vendor, non-headless); a bare
      // source (Node builtin / third party) is allowed only when registered in the allowlist
      if (DUAL_END_PKGS.has(pkg) && !inVendor(r) && !inHeadless(r)) {
        if (source.startsWith("node:")) {
          violations.push(`${r}:${line}  packages/${pkg} 出现 node: import 来源（${source}）`);
        } else if (!allowlisted(r, lineText, line, source)) {
          violations.push(`${r}:${line}  packages/${pkg} 出现非相对 import 来源（${source}；零依赖项目应为相对路径，Node 内置请走依赖注入）`);
        }
      }
    }
  }

  // ---- Environment global check (dual-end packages only; vendor and headless exempt; renderer allows browser globals) ----
  if (DUAL_END_PKGS.has(pkg) && !inVendor(r) && !inHeadless(r)) {
    const isRenderer = pkg === "renderer";
    const stripped = stripComments(src);
    const lines = stripped.split("\n");
    for (let n = 0; n < lines.length; n++) {
      for (const { id, re } of ENV_PATTERNS) {
        if (isRenderer && (id === "window." || id === "document.")) continue; // DOM is renderer's output target
        if (!re.test(lines[n])) continue;
        if (allowlisted(r, lines[n], n + 1, id)) continue;
        violations.push(`${r}:${n + 1}  packages/${pkg} 出现环境全局 ${id}（${lines[n].trim().slice(0, 80)}）`);
      }
    }
  }
}

// ---- Extra rule 5: package barrels must not import editor/ (purely additive, spec 01 T5) ----
// The existing branch (files under packages/ must not import editor/) already covers the same
// violation; this asserts it once more explicitly for package entries (the public contract face,
// worth making separately visible): a hit reports one line per rule.
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

// ---- Summary ----
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
