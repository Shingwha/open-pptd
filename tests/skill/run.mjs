// ============================================================================
// tests/skill/run.mjs — skill knowledge-pack lint + kit fragment assembly
// ----------------------------------------------------------------------------
// Asserts:
//   1. SKILL.md frontmatter, 8–12 KB size, internal links, 3.0-only commands
//   2. references/ structure and kits/{kit.md,theme.md,pages,fragments}
//   3. no complete deck / calibration demo / executable scripts in skill/
//   4. every kit fragment is parseable single-page YAML with owned bounds,
//      unique element ids, no missing media, and registry-known fonts
//   5. each kit's fragments assemble into a temp project, then `check` and
//      `build --format pptx` report 0 errors (warnings are recorded only)
//   6. no links into the main repo docs/ tree
//   7. the release skill zip (tests/skill/zip.mjs): entries, SHA256SUMS
// Usage: node tests/skill/run.mjs
// ============================================================================

import {
  readFileSync,
  readdirSync,
  statSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { load as loadYaml } from "../../packages/model/vendor/js-yaml.mjs";
import { skillZipTests } from "./zip.mjs";
import { check as ok, results, walk } from "../lib/test-utils.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SKILL = join(ROOT, "skill");
const BIN = join(ROOT, "bin", "open-pptd.js");

function rel(p) {
  return relative(ROOT, p).split(sep).join("/");
}

const allSkillFiles = walk(SKILL);
const mdFiles = allSkillFiles.filter((f) => f.endsWith(".md"));

// ---------------------------------------------------------------- 1. SKILL.md
const skillPath = join(SKILL, "SKILL.md");
const skillText = readFileSync(skillPath, "utf8");
const skillSize = statSync(skillPath).size;
ok("SKILL.md 大小 8–12KB", skillSize >= 8 * 1024 && skillSize <= 12 * 1024, `${skillSize} B`);
ok("SKILL.md frontmatter name", /^---\r?\n[\s\S]*?^name:\s*open-pptd\s*$/m.test(skillText));
ok("SKILL.md frontmatter description", /^---\r?\n[\s\S]*?^description:/m.test(skillText));

// Internal markdown links resolve (all skill markdown, not only SKILL.md).
let broken = [];
for (const file of mdFiles) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const target = m[1].split("#")[0];
    if (!target || /^https?:|^mailto:/.test(target)) continue;
    const abs = resolve(dirname(file), target);
    if (!existsSync(abs)) broken.push(`${rel(file)} -> ${m[1]}`);
  }
}
ok("markdown 内部链接可解析", broken.length === 0, broken.slice(0, 3).join("; "));

// 3.0 command surface only: no `open-pptd <2.x command>`.
const oldCmd = /\bopen-pptd\s+(serve|export|export-project|render|ensure|paths|gallery|fonts|icons)\b/i;
const oldHits = allSkillFiles.filter((f) => oldCmd.test(readFileSync(f, "utf8"))).map(rel);
ok("无 2.x 命令", oldHits.length === 0, oldHits.slice(0, 3).join(", "));
ok("无主仓 docs 链接", !allSkillFiles.some((f) => readFileSync(f, "utf8").includes("docs/")), "");

// ------------------------------------------------------- 2. refs and kits
const REFS = ["format", "elements", "charts", "design", "quality", "shapes", "images"];
const missingRefs = REFS.filter((r) => !existsSync(join(SKILL, "references", `${r}.md`)));
ok("references 7 篇齐全", missingRefs.length === 0, missingRefs.join(", "));
for (const r of REFS) {
  ok(`SKILL.md 索引 references/${r}.md`, skillText.includes(`references/${r}.md`));
}

const KITS = ["academic", "business-review", "consulting-report", "brand-proposal", "lecture", "poster"];
const SYSTEM = {
  academic: "academic",
  "business-review": "executive",
  "consulting-report": "executive",
  "brand-proposal": "editorial",
  lecture: "instructional",
  poster: "editorial",
};
// Canvas per kit: decks are 960×540; poster is a single A-series page (1:√2),
// written larger so type sizes in the fragment are print sizes, not deck sizes.
const CANVAS = {
  default: [960, 540],
  poster: [1191, 1684],
};
const sizes = { "design.md": [10 * 1024, 15 * 1024], "images.md": [6 * 1024, 12 * 1024] };
for (const [name, [min, max]] of Object.entries(sizes)) {
  const size = statSync(join(SKILL, "references", name)).size;
  ok(`references/${name} 大小`, size >= min && size <= max, `${size} B`);
}
ok("kits/README.md 存在", existsSync(join(SKILL, "kits", "README.md")));

const registry = JSON.parse(readFileSync(join(ROOT, "assets/fonts/registry.json"), "utf8"));
const knownFonts = new Set([
  ...(registry.fonts || []).map((f) => f.family),
  ...(registry.systemFonts || []).map((f) => f.family),
]);

const themes = {
  academic: {
    primary: "#8C3B36", accent: "#B5715C", bg: "#F7F3E8", text: "#27231F", muted: "#7A7168",
    line: "#DED5C4", success: "#3D7A4E", warning: "#B4872D", danger: "#B3362E",
    primarySoft: "#F2E7E3", primaryTint: "#E5CFC7", primaryDeep: "#4A1F1C",
    accent3: "#6E7F6A", accent4: "#8A6E4B", accent5: "#5C6B72", accent6: "#9C6B5A",
  },
  "business-review": {
    primary: "#123B2F", accent: "#B08D3E", bg: "#F7F3E8", text: "#1E2A26", muted: "#6E7A72",
    line: "#DCD6C8", success: "#3D7A4E", warning: "#B4872D", danger: "#B3362E",
    primarySoft: "#E8EFEA", primaryTint: "#CFDDD4", primaryDeep: "#0B241C",
    accent3: "#6E7F6A", accent4: "#8A6E4B", accent5: "#5C6B72", accent6: "#9C6B5A",
  },
  "consulting-report": {
    primary: "#1E3B33", accent: "#C15F3C", bg: "#F6F1E7", text: "#1D2521", muted: "#6E7A72",
    line: "#DCD3C4", success: "#3D7A4E", warning: "#B4872D", danger: "#B3362E",
    primarySoft: "#E7EDE9", primaryTint: "#CDDCD3", primaryDeep: "#10231D",
    accent3: "#6E7F6A", accent4: "#8A6E4B", accent5: "#5C6B72", accent6: "#9C6B5A",
  },
  "brand-proposal": {
    primary: "#0038B8", accent: "#2F5FD0", bg: "#F7F5EF", text: "#101010", muted: "#6E6C66",
    line: "#D8D7D2", success: "#2A7D4F", warning: "#B4872D", danger: "#B3362E",
    primarySoft: "#E8EDF8", primaryTint: "#CBD8F0", primaryDeep: "#001F66",
    accent3: "#6E7F6A", accent4: "#8A6E4B", accent5: "#5C6B72", accent6: "#9C6B5A",
  },
  lecture: {
    primary: "#1F6B5C", accent: "#4C9A86", bg: "#FBFAF6", text: "#1F2421", muted: "#6B726C",
    line: "#DEDCD3", success: "#3D7A4E", warning: "#B4872D", danger: "#B3362E",
    primarySoft: "#E8F0EC", primaryTint: "#CBDDD6", primaryDeep: "#0E3A31",
    accent3: "#6E7F6A", accent4: "#8A6E4B", accent5: "#5C6B72", accent6: "#9C6B5A",
  },
  poster: {
    primary: "#14504A", accent: "#B2542D", bg: "#F7F4EC", text: "#161616", muted: "#6C675E",
    line: "#DAD2C4", success: "#3D7A4E", warning: "#B4872D", danger: "#B3362E",
    primarySoft: "#E6EFEC", primaryTint: "#C8DCD6", primaryDeep: "#08302B",
    accent3: "#6E7F6A", accent4: "#8A6E4B", accent5: "#5C6B72", accent6: "#9C6B5A",
  },
};

function manifestFor(kit, pageNames) {
  const c = themes[kit];
  const [W, H] = CANVAS[kit] || CANVAS.default;
  const colors = Object.entries(c).map(([k, v]) => `    ${k}: "${v}"`).join("\n");
  return [
    "version: v2",
    `title: "${kit} fragment assembly"`,
    `size: [${W}, ${H}]`,
    "theme:",
    "  colors:",
    colors,
    "  textStyles:",
    '    title: {fontSize: 34, color: "$text", bold: true, lineHeight: 1.2}',
    '    subtitle: {fontSize: 18, color: "$muted", lineHeight: 1.4}',
    '    body: {fontSize: 16, color: "$text", lineHeight: 1.5}',
    '    caption: {fontSize: 10, color: "$muted", lineHeight: 1.35}',
    "  tableStyles:",
    "    default:",
    "      cellStyle: {fontSize: 13, color: \"$text\", border: {style: solid, width: 1, color: \"$line\"}}",
    '      firstRowStyle: {fill: {type: solid, color: "$primary"}, color: "#FFFFFF", bold: true}',
    "      bodyStyles:",
    '        - {fill: {type: solid, color: "$primarySoft"}}',
    '        - {fill: {type: solid, color: "$bg"}}',
    "pages:",
    ...pageNames.map((p) => `  - ${p}`),
    "",
  ].join("\n");
}

function cli(args) {
  const r = spawnSync(process.execPath, [BIN, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 180000,
  });
  return { status: r.status ?? 1, stdout: r.stdout || "", stderr: r.stderr || "" };
}

function jsonLine(stdout) {
  const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
  try {
    return JSON.parse(lines[lines.length - 1]);
  } catch {
    return null;
  }
}

function collectFonts(node, out) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) collectFonts(item, out);
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === "fontFamily") {
      if (typeof value === "string") out.add(value);
      else if (value && typeof value === "object") {
        for (const v of Object.values(value)) if (typeof v === "string") out.add(v);
      }
    }
    collectFonts(value, out);
  }
}

const temps = [];
let warningTotal = 0;
for (const kit of KITS) {
  const dir = join(SKILL, "kits", kit);
  const kitText = readFileSync(join(dir, "kit.md"), "utf8");
  const themeText = readFileSync(join(dir, "theme.md"), "utf8");
  ok(`kit ${kit}: 文件齐全`, ["kit.md", "theme.md"].every((f) => existsSync(join(dir, f))));
  ok(`kit ${kit}: 体系 ${SYSTEM[kit]}`, kitText.includes("`" + SYSTEM[kit] + "`"));
  ok(`kit ${kit}: 反同质化`, /## Anti-homogenization/i.test(kitText));
  ok(`kit ${kit}: 2–3 主题方向`, ["## A.", "## B.", "## C."].every((h) => themeText.includes(h)));

  const pageDir = join(dir, "pages");
  const pages = readdirSync(pageDir).filter((f) => f.endsWith(".md"));
  ok(`kit ${kit}: 页面配方 ≥5`, pages.length >= 5, `${pages.length}`);
  ok(
    `kit ${kit}: 配方含变体`,
    pages.every((f) => /## Variants/i.test(readFileSync(join(pageDir, f), "utf8")))
  );

  const fragDir = join(dir, "fragments");
  const frags = readdirSync(fragDir).filter((f) => f.endsWith(".page")).sort();
  ok(`kit ${kit}: fragments ≥1`, frags.length >= 1, `${frags.length}`);

  const [W, H] = CANVAS[kit] || CANVAS.default;
  if (kit === "poster") {
    ok("kit poster: 单页画布非 16:9", Math.abs(W / H - 16 / 9) > 0.2 && H > W, `${W}×${H} (1:${(H / W).toFixed(3)})`);
    ok("kit poster: kit.md 声明不拉伸 16:9", /16:9/.test(kitText));
  }

  const tmp = mkdtempSync(join(tmpdir(), `pptd-skill-${kit}-`));
  temps.push(tmp);
  mkdirSync(join(tmp, "pages"), { recursive: true });
  const pageNames = [];

  for (const frag of frags) {
    const text = readFileSync(join(fragDir, frag), "utf8");
    let page = null;
    try {
      page = loadYaml(text);
    } catch (err) {
      ok(`fragment ${kit}/${frag} 可解析`, false, err.message);
      continue;
    }
    const elements = page?.elements;
    const ids = new Set();
    const fonts = new Set();
    collectFonts(page, fonts);
    let badBounds = "";
    let dup = "";
    let media = "";
    for (const el of elements || []) {
      if (ids.has(el.elementId)) dup = el.elementId;
      ids.add(el.elementId);
      const b = el.bounds;
      if (!Array.isArray(b) || b.length !== 4 || b.some((n) => typeof n !== "number")) {
        badBounds = el.elementId;
      } else if (b[0] < 0 || b[1] < 0 || b[2] <= 0 || b[3] <= 0 || b[0] + b[2] > W + 0.01 || b[1] + b[3] > H + 0.01) {
        badBounds = `${el.elementId} ${JSON.stringify(b)}`;
      }
      if (el.elementType === "image" && typeof el.src === "string" && !/^https?:/.test(el.src)) {
        media = el.src;
      }
    }
    const unknownFonts = [...fonts].filter((f) => !knownFonts.has(f));
    ok(
      `fragment ${kit}/${frag} YAML/几何/字体`,
      Array.isArray(elements) &&
        elements.length > 0 &&
        !badBounds &&
        !dup &&
        !media &&
        unknownFonts.length === 0 &&
        !("notes" in (page || {})),
      [badBounds && `bounds ${badBounds}`, dup && `duplicate ${dup}`, media && `media ${media}`,
        unknownFonts.length && `font ${unknownFonts.join(",")}`, page && "notes" in page && "notes"]
        .filter(Boolean)
        .join("; ")
    );

    const name = `pages/${frag}`;
    copyFileSync(join(fragDir, frag), join(tmp, name));
    pageNames.push(name);
  }

  writeFileSync(join(tmp, "deck.pptd"), manifestFor(kit, pageNames));
  const manifest = join(tmp, "deck.pptd");

  const check = cli(["check", manifest, "--json"]);
  const checkJson = jsonLine(check.stdout);
  if (!checkJson) {
    ok(`kit ${kit}: check JSON`, false, (check.stderr || check.stdout).slice(0, 200));
  } else {
    ok(`kit ${kit}: check 0 error`, checkJson.errors.length === 0,
      checkJson.errors.slice(0, 2).map((e) => `${e.rule}:${e.message}`).join("; "));
    warningTotal += checkJson.warnings.length;
    if (checkJson.warnings.length) {
      console.log(`      · check warnings ${checkJson.warnings.length}: ` +
        checkJson.warnings.slice(0, 2).map((w) => `${w.rule}:${w.message}`).join("; "));
    }
  }

  const out = join(tmp, "out.pptx");
  const build = cli(["build", manifest, "--format", "pptx", "-o", out, "--json"]);
  const buildJson = jsonLine(build.stdout);
  const buildOk = Boolean(buildJson?.ok) && existsSync(out) && build.status === 0;
  ok(`kit ${kit}: build pptx 0 error`, buildOk,
    buildJson ? `pages=${buildJson.pages} warnings=${(buildJson.warnings || []).length}` :
      (build.stderr || build.stdout).slice(0, 200));
  if (buildJson?.warnings?.length) {
    warningTotal += buildJson.warnings.length;
    console.log(`      · build warnings ${buildJson.warnings.length}: ` +
      buildJson.warnings.slice(0, 2).join("; "));
  }
}

// ------------------------------------------- 3. no deck / demo / executable
const forbidden = allSkillFiles.filter((f) =>
  /\.(pptd|pptx|mjs|js|py|sh|ps1|bat)$/i.test(f) || /calibration/i.test(f)
);
ok("skill 内无完整 deck/校准 demo/可执行脚本", forbidden.length === 0,
  forbidden.slice(0, 3).map(rel).join(", "));

for (const tmp of temps) rmSync(tmp, { recursive: true, force: true });

// ------------------------------------------------- 4. release skill zip
skillZipTests(ok, { root: ROOT });

const failed = results.filter((r) => !r.pass).length;
console.log(`\n结果: ${results.length - failed}/${results.length} 通过${failed === 0 ? " ✅" : " ❌"}（warnings recorded: ${warningTotal}）`);
process.exit(failed === 0 ? 0 : 1);
