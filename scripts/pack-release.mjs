#!/usr/bin/env node
// scripts/pack-release.mjs — build release zips into dist/ (runtime, skill, icons, fonts, install scripts, SHA256SUMS).
// File lists come from git ls-files restricted to WHITELIST; the zip layout matches packages/writer/zip.js
// (reusing crc32/dosDateTime, deflate with store fallback). Asset zips are built only from bodies present
// in the working tree and are skipped with a warning when missing (CI-safe).
// The skill pack is written twice: open-pptd-skill-v<ver>.zip plus the stable open-pptd-skill.zip alias
// (same bytes) so the latest-download URL never changes; SHA256SUMS lists both.
// Usage: npm run pack [-- --only skill]; tests/skill/zip.mjs uses --only skill.

import { execSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";
import { crc32, dosDateTime } from "../packages/writer/zip.js";
import { encodeUtf8 } from "../packages/model/bytes.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Whitelist: the single source of truth for runtime release contents.
const WHITELIST = [
  "README.md",
  "README.zh-CN.md",
  "index.html",
  "package.json",
  "contract.json",
  "bin",
  "editor",
  "packages",
  "skill",
  "assets/fonts/registry.json",
  "assets/icons/registry.json",
];

// Preflight: every whitelist entry must exist
const missing = WHITELIST.filter((p) => !existsSync(path.join(ROOT, p)));
if (missing.length) {
  console.error(`✗ 白名单条目缺失: ${missing.join(", ")}`);
  process.exit(1);
}

// Warn when the working tree is dirty (zip contents come from the current working tree)
try {
  const dirty = execSync("git status --porcelain", { cwd: ROOT, encoding: "utf8" }).trim();
  if (dirty) {
    console.log("! 工作树有未提交改动，zip 打包的是当前工作树状态而非最近提交");
  }
} catch {
  /* skip when git is unavailable */
}

// Collect files (restricted to whitelist paths): git ls-files --cached --others lists tracked
// and untracked-but-not-ignored working-tree files; entries deleted on disk are dropped below.
const tracked = execSync(`git ls-files --cached --others --exclude-standard -- ${WHITELIST.join(" ")}`, { cwd: ROOT, encoding: "utf8" })
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean)
  .filter((rel) => existsSync(path.join(ROOT, rel)))
  .sort();
if (!tracked.length) {
  console.error("✗ 未找到任何白名单文件（git ls-files 为空）");
  process.exit(1);
}

const version = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")).version;
const files = tracked.map((rel) => {
  const abs = path.join(ROOT, rel);
  return { name: `open-pptd/${rel}`, data: readFileSync(abs), mtime: statSync(abs).mtime };
});

// Minimal deflate zip writer; layout identical to packages/writer/zip.js.
function buildZip(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const e of entries) {
    const nameBytes = Buffer.from(encodeUtf8(e.name));
    const raw = e.data.length;
    const deflated = deflateRawSync(e.data, { level: 9 });
    const useDeflate = deflated.length < raw;
    const payload = useDeflate ? deflated : e.data;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(e.data);
    const mtime = dosDateTime(e.mtime);

    const local = Buffer.alloc(30 + nameBytes.length);
    local.writeUInt32LE(0x04034b50, 0); // local file header signature
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // flags: filename UTF-8
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(mtime.time, 10);
    local.writeUInt16LE(mtime.date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(raw, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28); // extra length
    nameBytes.copy(local, 30);
    chunks.push(local, payload);

    central.push({
      nameBytes,
      crc,
      raw,
      comp: payload.length,
      method,
      localOffset: offset,
      time: mtime.time,
      date: mtime.date,
    });
    offset += local.length + payload.length;
  }

  const cdStart = offset;
  let cdSize = 0;
  for (const c of central) {
    const rec = Buffer.alloc(46 + c.nameBytes.length);
    rec.writeUInt32LE(0x02014b50, 0); // central directory signature
    rec.writeUInt16LE(20, 4); // version made by
    rec.writeUInt16LE(20, 6); // version needed
    rec.writeUInt16LE(0x0800, 8);
    rec.writeUInt16LE(c.method, 10);
    rec.writeUInt16LE(c.time, 12);
    rec.writeUInt16LE(c.date, 14);
    rec.writeUInt32LE(c.crc, 16);
    rec.writeUInt32LE(c.comp, 20);
    rec.writeUInt32LE(c.raw, 24);
    rec.writeUInt16LE(c.nameBytes.length, 28);
    rec.writeUInt16LE(0, 30); // extra
    rec.writeUInt16LE(0, 32); // comment
    rec.writeUInt16LE(0, 34); // disk number start
    rec.writeUInt16LE(0, 36); // internal attributes
    rec.writeUInt32LE(0, 38); // external attributes
    rec.writeUInt32LE(c.localOffset, 42);
    c.nameBytes.copy(rec, 46);
    chunks.push(rec);
    cdSize += rec.length;
  }

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // EOCD signature
  eocd.writeUInt16LE(entries.length, 8); // entries on this disk
  eocd.writeUInt16LE(entries.length, 10); // total entries
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(cdStart, 16);
  eocd.writeUInt16LE(0, 20); // comment length
  chunks.push(eocd);

  return Buffer.concat(chunks);
}

// --only skill: produce just the skill knowledge-pack zip.
const ONLY = (() => {
  const i = process.argv.indexOf("--only");
  if (i === -1) return null;
  const value = process.argv[i + 1];
  if (!value || value.startsWith("--")) {
    console.error("✗ --only 需要参数（当前仅支持 skill）");
    process.exit(1);
  }
  if (value !== "skill") {
    console.error(`✗ 未知的 --only 目标: ${value}（当前仅支持 skill）`);
    process.exit(1);
  }
  return value;
})();

const outDir = path.join(ROOT, "dist");
mkdirSync(outDir, { recursive: true });
const mb = (n) => (n / 1024 / 1024).toFixed(2);
const produced = [];

function logZip(outPath, count, raw) {
  console.log(`✓ ${outPath}`);
  console.log(`  ${count} 个文件，${mb(raw)}MB → 压缩后 ${mb(statSync(outPath).size)}MB`);
}

// 1) Runtime zip (whitelist files).
function packRuntime() {
  const runtimePath = path.join(outDir, `open-pptd-v${version}.zip`);
  writeFileSync(runtimePath, buildZip(files));
  produced.push(runtimePath);
  logZip(runtimePath, files.length, files.reduce((s, f) => s + f.data.length, 0));
}

// 2) Skill knowledge-pack zip: skill/{SKILL.md,README.md,references/**,kits/**}. Top level is
// open-pptd/ so unzipping into an agent's skills directory works directly; tests, demos,
// generated media, and executable scripts never enter this zip.
function collectSkillFiles() {
  const skillRoot = path.join(ROOT, "skill");
  const allowed = (rel) =>
    rel === "SKILL.md" || rel === "README.md" || rel.startsWith("references/") || rel.startsWith("kits/");
  const listed = execSync("git ls-files --cached --others --exclude-standard -- skill", { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((rel) => rel.replace(/^skill\//, ""))
    .filter(allowed)
    .filter((rel) => existsSync(path.join(skillRoot, rel)))
    .sort();
  if (!listed.length) {
    console.error("✗ skill 知识包为空（skill/{SKILL.md,README.md,references,kits} 未找到文件）");
    process.exit(1);
  }
  return listed.map((rel) => {
    const abs = path.join(skillRoot, rel);
    return { name: `open-pptd/${rel}`, data: readFileSync(abs), mtime: statSync(abs).mtime };
  });
}

function packSkill() {
  const entries = collectSkillFiles();
  const outPath = path.join(outDir, `open-pptd-skill-v${version}.zip`);
  writeFileSync(outPath, buildZip(entries));
  produced.push(outPath);
  logZip(outPath, entries.length, entries.reduce((s, e) => s + e.data.length, 0));
  // Stable alias for the latest-download URL: identical bytes, produced by the default run
  // and by `--only skill` alike; SHA256SUMS lists both names.
  const stablePath = path.join(outDir, "open-pptd-skill.zip");
  copyFileSync(outPath, stablePath);
  produced.push(stablePath);
  console.log(`✓ ${stablePath}（与版本 zip 同字节副本，latest 稳定链接）`);
}

// 3) Asset zips: bodies present in the working tree; missing bodies are skipped (no failure).
function walkFiles(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walkFiles(p));
    else if (ent.isFile()) out.push(p);
  }
  return out;
}

function packAssets(label, zipName, entries) {
  if (!entries.length) {
    console.warn(`! 跳过 ${label}：本地工作树无本体文件（CI/未下载时正常），不产 ${zipName}`);
    return;
  }
  const outPath = path.join(outDir, zipName);
  writeFileSync(outPath, buildZip(entries));
  produced.push(outPath);
  logZip(outPath, entries.length, entries.reduce((s, e) => s + e.data.length, 0));
}

function packAssetZips() {
  // icons: assets/icons/{solid,regular,brands}/**/*.svg (no registry.json; directory structure
  // preserved, entry names relative to assets/icons → solid/…, regular/…, brands/…; the install
  // script extracts to assets/icons)
  const iconsRoot = path.join(ROOT, "assets", "icons");
  const iconEntries = walkFiles(iconsRoot)
    .filter((p) => p.endsWith(".svg"))
    .map((p) => ({ rel: path.relative(iconsRoot, p).split(path.sep).join("/"), abs: p }))
    .sort((a, b) => a.rel.localeCompare(b.rel))
    .map(({ rel, abs }) => ({ name: rel, data: readFileSync(abs), mtime: statSync(abs).mtime }));
  packAssets("图标资产包", `open-pptd-icons-v${version}.zip`, iconEntries);

  // fonts: assets/fonts/*.ttf (no registry.json; entry name = file name; the install script
  // extracts to assets/fonts)
  const fontsRoot = path.join(ROOT, "assets", "fonts");
  const fontEntries = (existsSync(fontsRoot) ? readdirSync(fontsRoot, { withFileTypes: true }) : [])
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".ttf"))
    .map((e) => e.name)
    .sort()
    .map((name) => {
      const abs = path.join(fontsRoot, name);
      return { name, data: readFileSync(abs), mtime: statSync(abs).mtime };
    });
  packAssets("字体资产包", `open-pptd-fonts-v${version}.zip`, fontEntries);

  return { iconCount: iconEntries.length, fontCount: fontEntries.length };
}

// 4) Install-script copies (directly downloadable from the release page).
function packInstallScripts() {
  for (const s of ["install.ps1", "install.sh"]) {
    const src = path.join(ROOT, s);
    if (!existsSync(src)) {
      console.warn(`! 跳过 ${s}：仓库根未找到`);
      continue;
    }
    copyFileSync(src, path.join(outDir, s));
    console.log(`✓ ${path.join(outDir, s)}`);
  }
}

// 5) SHA256SUMS covering all produced zips.
function writeSums() {
  const sumsLines = produced
    .map((p) => path.basename(p))
    .sort()
    .map((name) => `${createHash("sha256").update(readFileSync(path.join(outDir, name))).digest("hex")}  ${name}`);
  const sumsPath = path.join(outDir, "SHA256SUMS");
  writeFileSync(sumsPath, sumsLines.join("\n") + "\n");
  console.log(`✓ ${sumsPath}（${sumsLines.length} 项）`);
}

let assetCounts = { iconCount: 0, fontCount: 0 };
if (!ONLY) {
  packRuntime();
  assetCounts = packAssetZips();
  packInstallScripts();
}
packSkill();
writeSums();
if (!ONLY && !assetCounts.iconCount && !assetCounts.fontCount) {
  console.warn("! 本次产出运行时 zip + skill zip（缺图标/字体本体）；CI 上这是合法产物，本机补全本体后可产六件套");
}
