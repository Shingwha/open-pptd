// Stable skill knowledge-pack checks: frontmatter, links, core references, scenario files, and release zip integrity.
// Avoids hardcoded palette values, file counts, machine timing, and renderer-specific pixels.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { skillZipTests } from "./zip.mjs";
import { check as ok, results, walk } from "../lib/test-utils.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SKILL = join(ROOT, "skill");
const allSkillFiles = walk(SKILL);
const mdFiles = allSkillFiles.filter((file) => file.endsWith(".md"));
const rel = (path) => relative(ROOT, path).split(sep).join("/");

const skillText = readFileSync(join(SKILL, "SKILL.md"), "utf8");
ok("SKILL.md frontmatter name", /^---\r?\n[\s\S]*?^name:\s*open-pptd\s*$/m.test(skillText));
ok("SKILL.md frontmatter description", /^---\r?\n[\s\S]*?^description:/m.test(skillText));

const broken = [];
for (const file of mdFiles) {
  const text = readFileSync(file, "utf8");
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const target = match[1].split("#")[0];
    if (!target || /^https?:|^mailto:/.test(target)) continue;
    if (!existsSync(resolve(dirname(file), target))) broken.push(`${rel(file)} -> ${match[1]}`);
  }
}
ok("markdown 内部链接可解析", broken.length === 0, broken.slice(0, 3).join("; "));

const coreRefs = ["pptd", "design", "shapes"];
for (const name of coreRefs) {
  const ref = `references/${name}.md`;
  ok(`${ref} 存在`, existsSync(join(SKILL, ref)));
  ok(`SKILL.md 索引 ${ref}`, skillText.includes(ref));
}

const categoriesDir = join(SKILL, "references", "slides_categories");
const categoryEntries = readdirSync(categoriesDir, { withFileTypes: true });
const categoryFiles = categoryEntries
  .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
  .map((entry) => entry.name)
  .sort();
ok("slides_categories 含场景 Markdown", categoryFiles.length > 0, `${categoryFiles.length}`);
ok(
  "slides_categories 不含 README、子目录或非 Markdown 文件",
  categoryEntries.every((entry) => entry.isFile() && entry.name.endsWith(".md")),
  categoryEntries.map((entry) => entry.name).join(", ")
);

const forbidden = allSkillFiles.filter((file) =>
  /\.(?:mjs|cjs|js|ts|py|sh|ps1|bat|cmd|pptx|pptd|page|png|jpe?g|gif|webp|mp4|zip|ttf|otf)$/i.test(file)
);
ok("skill 仅含文本知识包", forbidden.length === 0, forbidden.slice(0, 3).map(rel).join(", "));

skillZipTests(ok, { root: ROOT });

const failed = results.filter((result) => !result.pass).length;
console.log(`\n结果: ${results.length - failed}/${results.length} 通过${failed ? " ❌" : " ✅"}`);
process.exit(failed ? 1 : 0);
