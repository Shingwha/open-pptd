// ============================================================================
// tests/docs/run.mjs — documentation gate (docs tree + references + README)
// ----------------------------------------------------------------------------
// Asserts:
//   1. docs/ contains only release-workflow.md and images/** (no embedding,
//      image-generation, archive, DSH or old spec docs)
//   2. no tracked/untracked text file references deleted docs (docs/embedding,
//      docs/image-generation, docs/archive, docs/specs, dsh-theme, dshSource);
//      CHANGELOG history and the active specs/ tree are exempt
//   3. README.md / README.zh-CN.md: version matches package.json, five commands,
//      skill zip / repo skill install, no external clone, no old command usage,
//      only docs/release-workflow.md is linked, docs/images/** still resolves
//   4. docs/release-workflow.md covers the skill zip, assets, test:docs/test:skill
//   5. package.json: version 3.0.0, test:docs script, files excludes skill/,
//      zero dependencies
//   6. tests/run-all.mjs registers this suite
// Usage: node tests/docs/run.mjs (npm run test:docs)
// ============================================================================

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join, resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SELF = "tests/docs/run.mjs";
const DOCS = join(ROOT, "docs");

let pass = 0;
let fail = 0;
function ok(name, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`PASS  ${name}${detail ? "  " + detail : ""}`);
  } else {
    fail++;
    console.log(`FAIL  ${name}${detail ? "  " + detail : ""}`);
  }
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

function rel(p) {
  return relative(ROOT, p).split(sep).join("/");
}

// ---------------------------------------------------------------- 1. docs tree
const docsFiles = walk(DOCS).map(rel).sort();
const unexpected = docsFiles.filter(
  (f) => f !== "docs/release-workflow.md" && !f.startsWith("docs/images/")
);
ok("docs/ 顶层只有 release-workflow.md + images/**", unexpected.length === 0, unexpected.slice(0, 5).join(", "));
ok("docs/release-workflow.md 存在", existsSync(join(DOCS, "release-workflow.md")));
const imageFiles = docsFiles.filter((f) => f.startsWith("docs/images/"));
ok("docs/images/** 保留", imageFiles.length >= 6, `${imageFiles.length} 个文件`);
for (const gone of ["docs/embedding.md", "docs/image-generation.md", "docs/archive", "docs/specs"]) {
  ok(`已删除 ${gone}`, !existsSync(join(ROOT, gone)));
}

// ------------------------------------------------- 2. deleted-doc references
// Pattern pieces are assembled so this file does not match its own scan.
const patterns = [
  { name: "docs/embedding", re: new RegExp("docs/" + "embedding") },
  { name: "docs/image-generation", re: new RegExp("docs/" + "image-generation") },
  { name: "docs/archive", re: new RegExp("docs/" + "archive") },
  { name: "docs/specs", re: new RegExp("docs/" + "specs") },
  { name: "dsh-theme", re: new RegExp("dsh-" + "theme") },
  { name: "dshSource", re: new RegExp("dsh" + "Source") },
];
const TEXT_EXT = /\.(md|mjs|cjs|js|json|ya?ml|html|css|ps1|sh|txt|page)$/i;
const EXEMPT = (f) => f.startsWith("specs/") || f === "CHANGELOG.md" || f === SELF;

let files = [];
try {
  files = execSync("git ls-files --cached --others --exclude-standard", { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((f) => TEXT_EXT.test(f))
    .filter((f) => !EXEMPT(f))
    .filter((f) => existsSync(join(ROOT, f)));
} catch {
  // Without git, fall back to a working-tree walk (dist/.git excluded by extension whitelist).
  files = walk(ROOT)
    .map(rel)
    .filter((f) => !f.startsWith(".git/") && !f.startsWith("specs/") && f !== "CHANGELOG.md" && f !== SELF)
    .filter((f) => TEXT_EXT.test(f));
}

const hits = [];
for (const file of files) {
  let text;
  try {
    text = readFileSync(join(ROOT, file), "utf8");
  } catch {
    continue;
  }
  if (text.includes("\u0000")) continue; // binary masquerading as text
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    for (const p of patterns) {
      if (p.re.test(lines[i])) hits.push(`${file}:${i + 1} ${p.name}`);
    }
  }
}
ok("全仓无已删文档/DSH 引用", hits.length === 0, hits.slice(0, 5).join(" | "));

// ---------------------------------------------------------------- 3. READMEs
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const version = pkg.version;
const readmes = ["README.md", "README.zh-CN.md"];
const FIVE = ["open", "build", "check", "assets", "doctor"];
const OLD = ["serve", "export", "export-project", "render", "ensure", "paths", "gallery", "fonts", "icons"];

for (const name of readmes) {
  const file = join(ROOT, name);
  const text = readFileSync(file, "utf8");
  const head = text.slice(0, 600);
  ok(`${name} 版本为 v${version}`, head.includes(`v${version}`));
  ok(
    `${name} 列出 5 命令`,
    FIVE.every((cmd) => new RegExp(`open-pptd\\s+${cmd}\\b`).test(text)),
    FIVE.filter((cmd) => !new RegExp(`open-pptd\\s+${cmd}\\b`).test(text)).join(", ")
  );
  ok(
    `${name} 写 skill zip 安装`,
    new RegExp(`open-pptd-skill-v\\d+\\.\\d+\\.\\d+\\.zip`).test(text) &&
      /(unzip|Expand-Archive)/.test(text)
  );
  ok(`${name} 支持主仓 skill/ 安装`, /cp -r skill/.test(text) && /skill\//.test(text));
  ok(
    `${name} 不引导 clone 外部技能仓`,
    !/git clone/i.test(text) && !/github\.com\/Shingwha\/open-pptd-skill/.test(text)
  );
  const oldUse = OLD.filter((cmd) => new RegExp(`open-pptd\\s+${cmd}\\b`, "i").test(text));
  ok(`${name} 无旧命令当前用法`, oldUse.length === 0, oldUse.join(", "));

  const docsLinks = [...text.matchAll(/\[[^\]]*\]\((docs\/[^)\s]+)\)/g)]
    .map((m) => m[1].split("#")[0])
    .filter(Boolean);
  ok(
    `${name} 只链接 docs/release-workflow.md`,
    docsLinks.every((l) => l === "docs/release-workflow.md"),
    docsLinks.filter((l) => l !== "docs/release-workflow.md").join(", ")
  );
  const imgs = [...text.matchAll(/<img\s+src="([^"]+)"/g)].map((m) => m[1]);
  ok(
    `${name} 图片仍走 docs/images/**`,
    imgs.length > 0 && imgs.every((src) => src.startsWith("docs/images/") && existsSync(join(ROOT, src))),
    `${imgs.length} 张`
  );
  ok(
    `${name} 不再承诺预览=导出像素级`,
    !/pixel for pixel|像素级一致/i.test(text)
  );
}

// ------------------------------------------------------ 4. release-workflow.md
const rw = readFileSync(join(ROOT, "docs/release-workflow.md"), "utf8");
ok("release-workflow 含 skill zip", /open-pptd-skill-v<版本>\.zip/.test(rw));
ok("release-workflow 含 test:docs / test:skill", /test:docs/.test(rw) && /test:skill/.test(rw));
ok(
  "release-workflow 资产清单齐全",
  ["open-pptd-v<版本>.zip", "open-pptd-icons-v<版本>.zip", "open-pptd-fonts-v<版本>.zip", "install.ps1", "SHA256SUMS"].every(
    (s) => rw.includes(s)
  )
);
const rwLinks = [...rw.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)]
  .map((m) => m[1].split("#")[0])
  .filter((t) => t && !/^https?:|^mailto:/.test(t));
const rwBroken = rwLinks.filter((t) => !existsSync(resolve(dirname(join(ROOT, "docs/release-workflow.md")), t)));
ok("release-workflow 相对链接可解析", rwBroken.length === 0, rwBroken.join(", "));

// ------------------------------------------------------------- 5. package.json
ok("package.json version 为 3.0.0", version === "3.0.0", version);
ok("package.json 有 test:docs", pkg.scripts?.["test:docs"] === "node tests/docs/run.mjs");
ok("package.json files 不含 skill", !(pkg.files || []).some((f) => f === "skill" || f.startsWith("skill/")));
ok("零依赖（无 dependencies/devDependencies）", !pkg.dependencies && !pkg.devDependencies);

// ---------------------------------------------------------------- 6. run-all
const runAll = readFileSync(join(ROOT, "tests/run-all.mjs"), "utf8");
ok("run-all 注册 docs 检查", runAll.includes("tests/docs/run.mjs"));

console.log(`\n结果: ${pass}/${pass + fail} 通过${fail ? " ❌" : " ✅"}`);
process.exit(fail ? 1 : 0);
