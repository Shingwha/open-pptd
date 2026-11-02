// Release skill zip contract: derive scenario entries from the source tree instead of hardcoding them.
// Checks core documents, safe contents, stable alias, uniqueness, non-empty entries, and SHA256SUMS.

import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  rmdirSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { readZipEntries } from "../lib/unzip.js";

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function cleanup(dist, before, sumsBefore) {
  if (!existsSync(dist)) return;
  for (const name of readdirSync(dist)) {
    if (!before.has(name)) rmSync(join(dist, name), { force: true });
  }
  if (sumsBefore !== null) writeFileSync(join(dist, "SHA256SUMS"), sumsBefore);
  if (readdirSync(dist).length === 0) rmdirSync(dist);
}

/** @param {(name: string, cond: boolean, detail?: string) => void} ok */
export function skillZipTests(ok, opts = {}) {
  const root = opts.root || DEFAULT_ROOT;
  const dist = join(root, "dist");
  const before = new Set(existsSync(dist) ? readdirSync(dist) : []);
  const sumsBefore = existsSync(join(dist, "SHA256SUMS")) ? readFileSync(join(dist, "SHA256SUMS"), "utf8") : null;

  try {
    const pack = spawnSync(process.execPath, [join(root, "scripts", "pack-release.mjs"), "--only", "skill"], {
      cwd: root,
      encoding: "utf8",
      timeout: 180000,
    });
    ok(
      "skill zip: pack-release --only skill 退出 0",
      pack.status === 0,
      (pack.stderr || pack.stdout || "").trim().slice(-200)
    );

    const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
    const zipName = `open-pptd-skill-v${version}.zip`;
    const zipPath = join(dist, zipName);
    const stablePath = join(dist, "open-pptd-skill.zip");
    ok(`skill zip: dist/${zipName} 存在`, existsSync(zipPath));
    ok("skill zip: 稳定别名存在且同字节", existsSync(stablePath) && readFileSync(zipPath).equals(readFileSync(stablePath)));

    let entries = [];
    if (existsSync(zipPath)) {
      try {
        entries = readZipEntries(readFileSync(zipPath));
      } catch (err) {
        ok("skill zip: 可解析为 zip", false, err.message);
      }
    }
    const names = entries.map((entry) => entry.name);
    const has = (name) => names.includes(name);

    ok("skill zip: 条目非空", names.length > 0, `${names.length}`);
    ok("skill zip: 单一顶层 open-pptd/", names.length > 0 && names.every((name) => name.startsWith("open-pptd/")));

    const sourceCategories = readdirSync(join(root, "skill", "references", "slides_categories"), { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => `open-pptd/references/slides_categories/${entry.name}`);
    const required = [
      "open-pptd/SKILL.md",
      "open-pptd/README.md",
      "open-pptd/references/pptd.md",
      "open-pptd/references/design.md",
      "open-pptd/references/shapes.md",
      ...sourceCategories,
    ];
    const missing = required.filter((name) => !has(name));
    ok("skill zip: 入口、三大主文件与源 categories 齐全", missing.length === 0, missing.slice(0, 4).join(", "));

    const packedCategories = names.filter((name) => name.startsWith("open-pptd/references/slides_categories/"));
    ok(
      "skill zip: categories 与源文件一一对应",
      packedCategories.length === sourceCategories.length && packedCategories.every((name) => sourceCategories.includes(name)),
      packedCategories.slice(0, 4).join(", ")
    );

    const forbidden = names.filter((name) =>
      /^open-pptd\/(tests|demo|media|examples|scripts|docs|\.git|skill|kits)\//i.test(name) ||
      /\.(mjs|js|cjs|ts|py|sh|ps1|bat|cmd|pptx|pptd|page|png|jpe?g|gif|webp|mp4|zip|ttf|otf|svg)$/i.test(name)
    );
    ok("skill zip: 无 tests/demo/媒体/脚本/旧 kits", forbidden.length === 0, forbidden.slice(0, 4).join(", "));

    const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
    ok("skill zip: 无重复条目", duplicates.length === 0, duplicates.slice(0, 3).join(", "));

    const sumsPath = join(dist, "SHA256SUMS");
    const lines = existsSync(sumsPath) ? readFileSync(sumsPath, "utf8").split(/\r?\n/).filter(Boolean) : [];
    for (const name of [zipName, "open-pptd-skill.zip"]) {
      const line = lines.find((item) => item.endsWith(`  ${name}`));
      const actual = sha256(join(dist, name));
      const recorded = line ? line.split(/\s+/)[0] : "";
      ok(`skill zip: SHA256SUMS 含 ${name} 且匹配`, Boolean(line) && recorded === actual);
    }

    const empty = entries.filter((entry) => entry.size === 0).map((entry) => entry.name);
    ok("skill zip: 无空文件", empty.length === 0, empty.slice(0, 3).join(", "));
  } finally {
    cleanup(dist, before, sumsBefore);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let pass = 0;
  let fail = 0;
  const ok = (name, cond, detail = "") => {
    if (cond) {
      pass++;
      console.log(`PASS  ${name}${detail ? "  " + detail : ""}`);
    } else {
      fail++;
      console.log(`FAIL  ${name}${detail ? "  " + detail : ""}`);
    }
  };
  skillZipTests(ok, { root: DEFAULT_ROOT });
  console.log(`\n结果: ${pass}/${pass + fail} 通过${fail === 0 ? " ✅" : " ❌"}`);
  process.exit(fail === 0 ? 0 : 1);
}
