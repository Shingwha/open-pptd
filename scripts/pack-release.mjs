#!/usr/bin/env node
// ============================================================================
// pack-release.mjs — package the skill as release zips according to the runtime whitelist
// ----------------------------------------------------------------------------
// Artifacts (dist/):
//   open-pptd-v<version>.zip         runtime (top-level dir open-pptd/; unzip into skills and it works)
//   open-pptd-icons-v<version>.zip   full icons (solid/regular/brands/*.svg, no registry.json)
//   open-pptd-fonts-v<version>.zip   full fonts (*.ttf, no registry.json)
//   install.ps1 / install.sh         copies of the install scripts (directly downloadable from the release page)
//   SHA256SUMS                       covers all of the above zips
//
// The whitelist is the single source of truth for runtime release contents: tests/, docs/,
// examples/, .github/, scripts/, icon source files and .gitignore never enter the package;
// font files themselves do not enter the package (about 155MB; fetched on demand via CLI after
// install). Content surfaces (skill docs and knowledge base) have moved to the separate skill
// repo open-pptd-skill; this package ships runtime only. contract.json is included (contract
// manifest, read by repo 3 and the contract tests).
//
// Resource bodies (assets/fonts/*.ttf, assets/icons/{solid,regular,brands}/*.svg) are not
// committed to git, so asset zips are based on **files actually present in the local working
// tree**: when a body is missing (e.g. CI) the corresponding zip is skipped with a clear
// warning, never failing (on CI, producing the runtime zip + SHA256SUMS is a valid artifact).
//
// The file list comes from git ls-files (git-tracked files only; untracked local junk won't leak in).
// The zip container is built in-house: same layout as packages/writer/zip.js (reusing its crc32),
// with deflate compression; already-compressed content (e.g. minified js) falls back to store to
// avoid negative gains.
//
// Usage: npm run pack
// ============================================================================

import { execSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";
import { crc32 } from "../packages/writer/zip.js";
import { encodeUtf8 } from "../packages/model/bytes.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ---- Whitelist: files/dirs included in the release zip ----
const WHITELIST = [
  "README.md",
  "README.zh-CN.md",
  "index.html",
  "package.json",
  "contract.json",
  "bin",
  "editor",
  "packages",
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

// ---- Collect files (restricted to whitelist paths) ----
// git ls-files --cached --others: tracked + untracked-but-not-ignored working-tree files (new
// dirs from a refactor not yet git-added still enter the package; files deleted from the working
// tree are dropped by existsSync)
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

// ---- Minimal deflate zip writer (layout identical to packages/writer/zip.js) ----
function dosDateTime(date) {
  const year = Math.max(date.getFullYear(), 1980); // DOS time starts at 1980
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

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

const outDir = path.join(ROOT, "dist");
mkdirSync(outDir, { recursive: true });
const mb = (n) => (n / 1024 / 1024).toFixed(2);
const produced = []; // { file, entries }

// ---- 1) Runtime zip (whitelist ∪ contract.json) ----
const runtimePath = path.join(outDir, `open-pptd-v${version}.zip`);
writeFileSync(runtimePath, buildZip(files));
produced.push(runtimePath);
const rawTotal = files.reduce((s, f) => s + f.data.length, 0);
console.log(`✓ ${runtimePath}`);
console.log(`  ${files.length} 个文件，${mb(rawTotal)}MB → 压缩后 ${mb(statSync(runtimePath).size)}MB`);

// ---- 2) Asset zips: based on bodies actually present in the local working tree; skip when missing (no failure) ----
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
  const raw = entries.reduce((s, e) => s + e.data.length, 0);
  console.log(`✓ ${outPath}`);
  console.log(`  ${entries.length} 个文件，${mb(raw)}MB → 压缩后 ${mb(statSync(outPath).size)}MB`);
}

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

// ---- 3) Install-script copies (directly downloadable from the release page) ----
for (const s of ["install.ps1", "install.sh"]) {
  const src = path.join(ROOT, s);
  if (!existsSync(src)) {
    console.warn(`! 跳过 ${s}：仓库根未找到`);
    continue;
  }
  copyFileSync(src, path.join(outDir, s));
  console.log(`✓ ${path.join(outDir, s)}`);
}

// ---- 4) SHA256SUMS (covering all produced zips) ----
const sumsLines = produced
  .map((p) => path.basename(p))
  .sort()
  .map((name) => `${createHash("sha256").update(readFileSync(path.join(outDir, name))).digest("hex")}  ${name}`);
const sumsPath = path.join(outDir, "SHA256SUMS");
writeFileSync(sumsPath, sumsLines.join("\n") + "\n");
console.log(`✓ ${sumsPath}（${sumsLines.length} 项）`);
if (produced.length < 3) {
  console.warn("! 本次仅产出运行时 zip（缺图标/字体本体）；CI 上这是合法产物，本机补全本体后可产五件套");
}
