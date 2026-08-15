#!/usr/bin/env node
// ============================================================================
// pack-release.mjs — 按「运行时白名单」把 skill 打包为发布 zip
// ----------------------------------------------------------------------------
// 产物: dist/open-pptd-v<version>.zip，顶层目录 open-pptd/，
//       解压到 skills 文件夹即得 <skills 文件夹>/open-pptd/。
//
// 白名单是发布内容的单一事实来源：tests/、docs/、examples/、.github/、
// scripts/、图标源文件与 .gitignore 一律不进包；字体文件本体不入包
// （约 155MB，装好后经 CLI 按需下载）。
//
// 文件清单取自 git ls-files（仅 git 跟踪文件，本地未跟踪杂物不会混入）。
// zip 容器自建：结构同 editor/writer/zip.js（复用其 crc32），压缩方法用
// deflate；已压缩内容（如 minified js）自动退回 store，避免负收益。
//
// 用法: npm run pack
// ============================================================================

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";
import { crc32, encodeUtf8 } from "../editor/writer/zip.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ---- 白名单：发布 zip 包含的文件/目录 ----
const WHITELIST = [
  "README.md",
  "README.en.md",
  "SKILL.md",
  "index.html",
  "package.json",
  "bin",
  "lib",
  "editor",
  "references",
  "assets/fonts/registry.json",
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

// ---- 收集 git 跟踪文件（限白名单路径）----
const tracked = execSync(`git ls-files -- ${WHITELIST.join(" ")}`, { cwd: ROOT, encoding: "utf8" })
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean)
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

// ---- deflate 版最小 zip 写入器（布局与 editor/writer/zip.js 完全一致）----
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

// ---- 打包 ----
const zip = buildZip(files);
const outDir = path.join(ROOT, "dist");
mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, `open-pptd-v${version}.zip`);
writeFileSync(outPath, zip);

const rawTotal = files.reduce((s, f) => s + f.data.length, 0);
const mb = (n) => (n / 1024 / 1024).toFixed(2);
console.log(`✓ ${outPath}`);
console.log(`  ${files.length} 个文件，${mb(rawTotal)}MB → 压缩后 ${mb(zip.length)}MB`);
