#!/usr/bin/env node
// ============================================================================
// pack-release.mjs — 按「运行时白名单」把 skill 打包为发布 zip
// ----------------------------------------------------------------------------
// 产物（dist/）：
//   open-pptd-v<version>.zip         运行时（顶层目录 open-pptd/，解压到 skills 即用）
//   open-pptd-icons-v<version>.zip   图标全量（solid/regular/brands/*.svg，不含 registry.json）
//   open-pptd-fonts-v<version>.zip   字体全量（*.ttf，不含 registry.json）
//   install.ps1 / install.sh         安装脚本副本（release 页可直接下载）
//   SHA256SUMS                       覆盖以上全部 zip
//
// 白名单是运行时发布内容的单一事实来源：tests/、docs/、examples/、.github/、
// scripts/、图标源文件与 .gitignore 一律不进包；字体文件本体不入包
// （约 155MB，装好后经 CLI 按需下载）。
// 内容面（技能文档与知识库）已迁至独立技能仓 open-pptd-skill，本包只发运行时；
// contract.json 入包（契约清单，供仓 3 与契约测试读取）。
//
// 资源本体（assets/fonts/*.ttf、assets/icons/{solid,regular,brands}/*.svg）不入 git，
// 故资产 zip 以**本地工作树实际存在的文件**为准：本体缺失（如 CI）时跳过对应 zip
// 并打印明确警告，绝不因此失败（CI 上产 runtime zip + SHA256SUMS 即为合法产物）。
//
// 文件清单取自 git ls-files（仅 git 跟踪文件，本地未跟踪杂物不会混入）。
// zip 容器自建：结构同 packages/writer/zip.js（复用其 crc32），压缩方法用
// deflate；已压缩内容（如 minified js）自动退回 store，避免负收益。
//
// 用法: npm run pack
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

// ---- 白名单：发布 zip 包含的文件/目录 ----
const WHITELIST = [
  "README.md",
  "README.en.md",
  "index.html",
  "package.json",
  "contract.json",
  "bin",
  "editor",
  "packages",
  "assets/fonts/registry.json",
  "assets/icons/registry.json",
];

// 前置检查：白名单条目必须存在
const missing = WHITELIST.filter((p) => !existsSync(path.join(ROOT, p)));
if (missing.length) {
  console.error(`✗ 白名单条目缺失: ${missing.join(", ")}`);
  process.exit(1);
}

// 工作树不干净时提醒（zip 内容取自当前工作树状态）
try {
  const dirty = execSync("git status --porcelain", { cwd: ROOT, encoding: "utf8" }).trim();
  if (dirty) {
    console.log("! 工作树有未提交改动，zip 打包的是当前工作树状态而非最近提交");
  }
} catch {
  /* 无 git 环境时跳过 */
}

// ---- 收集文件（限白名单路径）----
// git ls-files --cached --others：已跟踪 + 未跟踪但未被 ignore 的工作树文件
// （重构搬移后新目录尚未 git add 也要入包；工作树已删除的文件按 existsSync 剔除）
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

// ---- deflate 版最小 zip 写入器（布局与 packages/writer/zip.js 完全一致）----
function dosDateTime(date) {
  const year = Math.max(date.getFullYear(), 1980); // DOS 时间从 1980 起
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
    local.writeUInt32LE(0x04034b50, 0); // 本地文件头签名
    local.writeUInt16LE(20, 4); // 所需版本
    local.writeUInt16LE(0x0800, 6); // 标志: 文件名 UTF-8
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(mtime.time, 10);
    local.writeUInt16LE(mtime.date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(raw, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28); // extra 长度
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
    rec.writeUInt32LE(0x02014b50, 0); // 中央目录签名
    rec.writeUInt16LE(20, 4); // 制作版本
    rec.writeUInt16LE(20, 6); // 所需版本
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
    rec.writeUInt16LE(0, 34); // 起始盘号
    rec.writeUInt16LE(0, 36); // 内部属性
    rec.writeUInt32LE(0, 38); // 外部属性
    rec.writeUInt32LE(c.localOffset, 42);
    c.nameBytes.copy(rec, 46);
    chunks.push(rec);
    cdSize += rec.length;
  }

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // EOCD 签名
  eocd.writeUInt16LE(entries.length, 8); // 本盘条目数
  eocd.writeUInt16LE(entries.length, 10); // 总条目数
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(cdStart, 16);
  eocd.writeUInt16LE(0, 20); // comment 长度
  chunks.push(eocd);

  return Buffer.concat(chunks);
}

const outDir = path.join(ROOT, "dist");
mkdirSync(outDir, { recursive: true });
const mb = (n) => (n / 1024 / 1024).toFixed(2);
const produced = []; // { file, entries }

// ---- 1) 运行时 zip（白名单 ∪ contract.json）----
const runtimePath = path.join(outDir, `open-pptd-v${version}.zip`);
writeFileSync(runtimePath, buildZip(files));
produced.push(runtimePath);
const rawTotal = files.reduce((s, f) => s + f.data.length, 0);
console.log(`✓ ${runtimePath}`);
console.log(`  ${files.length} 个文件，${mb(rawTotal)}MB → 压缩后 ${mb(statSync(runtimePath).size)}MB`);

// ---- 2) 资产 zip：以本地工作树实际存在的本体为准，缺失则跳过（不失败）----
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

// 图标：assets/icons/{solid,regular,brands}/**/*.svg（不含 registry.json；保持目录结构，
// 条目名相对 assets/icons → solid/…、regular/…、brands/…，install 脚本解到 assets/icons）
const iconsRoot = path.join(ROOT, "assets", "icons");
const iconEntries = walkFiles(iconsRoot)
  .filter((p) => p.endsWith(".svg"))
  .map((p) => ({ rel: path.relative(iconsRoot, p).split(path.sep).join("/"), abs: p }))
  .sort((a, b) => a.rel.localeCompare(b.rel))
  .map(({ rel, abs }) => ({ name: rel, data: readFileSync(abs), mtime: statSync(abs).mtime }));
packAssets("图标资产包", `open-pptd-icons-v${version}.zip`, iconEntries);

// 字体：assets/fonts/*.ttf（不含 registry.json；条目名 = 文件名，install 脚本解到 assets/fonts）
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

// ---- 3) 安装脚本副本（release 页可直接下载）----
for (const s of ["install.ps1", "install.sh"]) {
  const src = path.join(ROOT, s);
  if (!existsSync(src)) {
    console.warn(`! 跳过 ${s}：仓库根未找到`);
    continue;
  }
  copyFileSync(src, path.join(outDir, s));
  console.log(`✓ ${path.join(outDir, s)}`);
}

// ---- 4) SHA256SUMS（覆盖全部产出 zip）----
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
