// Release skill zip contract: derive kit entries from the source tree instead of hardcoding them.
// Checks packaging, safe contents, uniqueness, non-empty entries, and SHA256SUMS.

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

/**
 * @param {(name: string, cond: boolean, detail?: string) => void} ok
 * @param {{root?: string}} [opts]
 */
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
    ok(`skill zip: dist/${zipName} 存在`, existsSync(zipPath));

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

    const sourceKits = readdirSync(join(root, "skill", "kits"), { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md") && entry.name !== "README.md")
      .map((entry) => `open-pptd/kits/${entry.name}`);
    const required = [
      "open-pptd/SKILL.md",
      "open-pptd/README.md",
      "open-pptd/references/design.md",
      "open-pptd/references/themes.md",
      ...sourceKits,
    ];
    const missing = required.filter((name) => !has(name));
    ok("skill zip: 入口、核心 references 与源 kits 齐全", missing.length === 0, missing.slice(0, 4).join(", "));

    const packedKits = names.filter((name) => name.startsWith("open-pptd/kits/"));
    ok(
      "skill zip: kits 保持拍平且无额外条目",
      packedKits.length === sourceKits.length && packedKits.every((name) => sourceKits.includes(name)),
      packedKits.slice(0, 4).join(", ")
    );

    const forbidden = names.filter((name) =>
      /^open-pptd\/(tests|demo|media|examples|scripts|docs|\.git|skill)\//i.test(name) ||
      /\.(mjs|js|cjs|ts|py|sh|ps1|bat|cmd|pptx|pptd|page|png|jpe?g|gif|webp|mp4|zip|ttf|otf|svg)$/i.test(name)
    );
    ok("skill zip: 无 tests/demo/媒体/脚本/页面文件", forbidden.length === 0, forbidden.slice(0, 4).join(", "));

    const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
    ok("skill zip: 无重复条目", duplicates.length === 0, duplicates.slice(0, 3).join(", "));

    const sumsPath = join(dist, "SHA256SUMS");
    let sumsOk = false;
    let sumsDetail = "SHA256SUMS 缺失";
    if (existsSync(sumsPath) && existsSync(zipPath)) {
      const lines = readFileSync(sumsPath, "utf8").split(/\r?\n/).filter(Boolean);
      const line = lines.find((item) => item.endsWith(`  ${zipName}`));
      const actual = sha256(zipPath);
      const recorded = line ? line.split(/\s+/)[0] : "";
      sumsOk = Boolean(line) && recorded === actual;
      sumsDetail = line ? `recorded ${recorded.slice(0, 12)}… actual ${actual.slice(0, 12)}…` : `未列出 ${zipName}`;
    }
    ok("skill zip: SHA256SUMS 含该 zip 且哈希匹配", sumsOk, sumsDetail);

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
