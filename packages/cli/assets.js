// ============================================================================
// cli/assets.js — assets 子命令：一次请求装全量（替代逐文件下载）
// ----------------------------------------------------------------------------
//   assets list                              状态（装了哪些、版本、体积）
//   assets sync [icons|fonts|all] [--from <zip>]  下载 → 校验 → 解压到 home/assets
//   assets clean                             清 cache/ 与 tmp/（可整目录安全删除）
//
// 资产 zip 源（GitHub Releases，由 A4 的 pack-release 产出）：
//   https://github.com/Shingwha/open-pptd/releases/latest/download/open-pptd-icons-v<ver>.zip
//   https://github.com/Shingwha/open-pptd/releases/latest/download/open-pptd-fonts-v<ver>.zip
// zip 缺失（404）→ 回退逐文件下载器（cli/download.js）并明确提示。
// 校验：优先 SHA256SUMS（同 release），缺失则结构性校验（ZIP 完整 + 期望扩展名）。
// **注册表永不进 assets/**：解压时丢弃任何 registry.json 条目。
// ============================================================================

import { existsSync, readFileSync, rmSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { paths, PACKAGE_ROOT, ensureHome, atomicWriteFile, dirSize } from "../paths.js";
import { readFontRegistry, readIconRegistry, fontReadyInfo, iconReadyInfo } from "./resource-status.js";
import { downloadFonts, downloadIcons } from "./download.js";

const RELEASES = "https://github.com/Shingwha/open-pptd/releases/latest/download";

/** 包版本（资产 zip 名带版本号）。 */
function packageVersion() {
  try {
    return JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8")).version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/** 资产目标定义：zip 名 / 解压落点 / 期望扩展名。 */
export const ASSET_TARGETS = {
  icons: { zipName: () => `open-pptd-icons-v${packageVersion()}.zip`, dest: () => paths.icons, ext: /\.svg$/i },
  fonts: { zipName: () => `open-pptd-fonts-v${packageVersion()}.zip`, dest: () => paths.fonts, ext: /\.(ttf|otf)$/i },
};

// ---------------------------------------------------------------------------
// 极简 ZIP 读取（store + deflate；node:zlib inflateRaw）
// ---------------------------------------------------------------------------
/** @returns {Array<{name:string, data:Buffer}>} */
export function readZipEntries(bytes) {
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0 && eocd < 0; i--) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) eocd = i;
  }
  if (eocd < 0) throw new Error("不是有效的 ZIP（未找到 EOCD）");
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entryCount = dv.getUint16(eocd + 10, true);
  const cdOffset = dv.getUint32(eocd + 16, true);
  const out = [];
  let off = cdOffset;
  for (let i = 0; i < entryCount; i++) {
    if (bytes[off] !== 0x50 || bytes[off + 1] !== 0x4b || bytes[off + 2] !== 0x01 || bytes[off + 3] !== 0x02) {
      throw new Error("Central Directory 解析失败（ZIP 损坏）");
    }
    const method = dv.getUint16(off + 10, true);
    const compSize = dv.getUint32(off + 20, true);
    const nameLen = dv.getUint16(off + 28, true);
    const extraLen = dv.getUint16(off + 30, true);
    const commentLen = dv.getUint16(off + 32, true);
    const localOff = dv.getUint32(off + 42, true);
    const name = Buffer.from(bytes.subarray(off + 46, off + 46 + nameLen)).toString("utf8");
    const nameLenL = dv.getUint16(localOff + 26, true);
    const extraLenL = dv.getUint16(localOff + 28, true);
    const dataStart = localOff + 30 + nameLenL + extraLenL;
    const raw = bytes.subarray(dataStart, dataStart + compSize);
    let data;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) data = inflateRawSync(raw);
    else throw new Error(`不支持的压缩方式 method=${method}（${name}）`);
    out.push({ name, data });
    off += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** 安全相对路径（拒绝绝对路径 / .. / 盘符）。 */
function safeRelPath(name) {
  const n = String(name).replace(/\\/g, "/");
  if (!n || n.startsWith("/") || /^[a-zA-Z]:/.test(n)) return null;
  const parts = n.split("/").filter((p) => p && p !== ".");
  if (parts.some((p) => p === "..")) return null;
  return parts.join("/");
}

/**
 * 解压 ZIP 到目录（丢弃 registry.json 条目；防路径穿越；原子写）。
 * @returns {{files:string[], matched:number}}
 */
export function extractZipTo(bytes, destDir, { verifyExt = null } = {}) {
  const files = [];
  let matched = 0;
  ensureHome();
  for (const e of readZipEntries(bytes)) {
    if (e.name.endsWith("/")) continue;
    const rel = safeRelPath(e.name);
    if (!rel) continue;
    if (/(^|\/)registry\.json$/i.test(rel)) continue; // 注册表永不进 assets/
    const dest = join(destDir, rel);
    if (!dest.startsWith(destDir)) continue; // 二次防穿越
    atomicWriteFile(dest, e.data);
    files.push(rel);
    if (verifyExt && verifyExt.test(rel)) matched++;
  }
  if (verifyExt && matched < 1) throw new Error("ZIP 内容与目标不符（未找到期望的资产文件）");
  return { files, matched };
}

// ---------------------------------------------------------------------------
// 下载 + SHA256 校验
// ---------------------------------------------------------------------------
async function fetchBytes(url, timeoutMs = 60000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

/** 尝试取同 release 的 SHA256SUMS 并校验；不可得则返回 null（调用方降级）。 */
async function verifySha256(name, bytes) {
  try {
    const sums = (await fetchBytes(`${RELEASES}/SHA256SUMS`, 15000)).toString("utf8");
    const line = sums.split(/\r?\n/).find((l) => l.trim().endsWith(name));
    if (!line) return null;
    const expected = line.trim().split(/\s+/)[0].toLowerCase();
    const actual = createHash("sha256").update(bytes).digest("hex");
    return expected === actual;
  } catch {
    return null;
  }
}

/**
 * 下载单个资产 zip 并解压到 home。
 * @returns {Promise<{ok:boolean, files?:number, reason?:string}>}
 */
async function syncTargetFromRelease(target) {
  const def = ASSET_TARGETS[target];
  const name = def.zipName();
  let bytes;
  try {
    bytes = await fetchBytes(`${RELEASES}/${name}`);
  } catch (err) {
    return { ok: false, reason: `${name} 下载失败（${err.message}）` };
  }
  const sha = await verifySha256(name, bytes);
  if (sha === false) return { ok: false, reason: `${name} SHA256 校验失败` };
  try {
    const { files } = extractZipTo(bytes, def.dest(), { verifyExt: def.ext });
    return { ok: true, files: files.length, sha, name };
  } catch (err) {
    return { ok: false, reason: `${name} 解压/校验失败（${err.message}）` };
  }
}

/** 离线导入：从本地 zip 解压（不做网络）。 */
function syncTargetFromZip(target, zipPath) {
  if (!existsSync(zipPath)) throw new Error(`zip 不存在: ${zipPath}`);
  const def = ASSET_TARGETS[target];
  const bytes = readFileSync(zipPath);
  const { files } = extractZipTo(bytes, def.dest(), { verifyExt: def.ext });
  return { ok: true, files: files.length, name: zipPath };
}

// ---------------------------------------------------------------------------
// 子命令
// ---------------------------------------------------------------------------
function assetsList() {
  const fontReg = readFontRegistry();
  const iconReg = readIconRegistry();
  const f = fontReadyInfo(fontReg);
  const ic = iconReadyInfo(iconReg);
  console.log("open-pptd 资源状态\n");
  console.log(`  home        ${paths.home}`);
  console.log(`  fonts       ${f.ready} / ${f.total} 就绪 · ${(dirSize(paths.fonts) / 1024 / 1024).toFixed(1)} MB（${paths.fonts}）`);
  console.log(`  icons       ${ic.ready} / ${ic.total} 就绪 · ${(dirSize(paths.icons) / 1024 / 1024).toFixed(2)} MB（${paths.icons}）`);
  console.log(`  registry    包内只读（fonts v${fontReg.version} · FA ${iconReg.faVersion}），永不被 home 遮蔽`);
  console.log(`\n  安装：node bin/open-pptd.js assets sync [icons|fonts|all]    离线：--from <zip>`);
}

async function assetsSync(args) {
  const target = ["icons", "fonts", "all"].includes(args[0]) ? args[0] : "all";
  const targets = target === "all" ? ["icons", "fonts"] : [target];
  const fromIdx = args.indexOf("--from");
  const fromZip = fromIdx >= 0 ? args[fromIdx + 1] : null;
  ensureHome();

  for (const t of targets) {
    if (fromZip) {
      try {
        const r = syncTargetFromZip(t, fromZip);
        console.log(`✓ ${t} 离线导入 → ${ASSET_TARGETS[t].dest()}（${r.files} 个文件）`);
      } catch (err) {
        console.error(`✗ ${t} 离线导入失败: ${err.message}`);
        process.exitCode = 1;
      }
      continue;
    }
    console.log(`▸ ${t}：尝试 release 资产包…`);
    const r = await syncTargetFromRelease(t);
    if (r.ok) {
      console.log(`✓ ${t} ← ${r.name}（${r.files} 个文件）${r.sha === null ? "（无 SHA256SUMS，已结构性校验）" : ""}`);
      continue;
    }
    console.log(`  ! ${r.reason}；回退逐文件下载器`);
    await fallbackDownload(t);
  }
  return true;
}

async function fallbackDownload(t) {
  if (t === "fonts") {
    const reg = readFontRegistry();
    await downloadFonts(reg, "all");
  } else {
    const reg = readIconRegistry();
    await downloadIcons(reg, { force: false });
  }
}

function assetsClean() {
  for (const dir of [paths.cache, paths.tmp]) {
    if (!existsSync(dir)) continue;
    let n = 0;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      try {
        rmSync(join(dir, e.name), { recursive: true, force: true });
        n++;
      } catch { /* 占用则跳过 */ }
    }
    console.log(`✓ 已清 ${dir}（${n} 项）`);
  }
  console.log("（cache/ 与 tmp/ 可整目录安全删除；assets/ 与 config.json 未动）");
}

/** assets 子命令入口。 */
export async function runAssets(args) {
  const sub = args[0] || "list";
  if (sub === "list") {
    assetsList();
    return true;
  }
  if (sub === "sync") return assetsSync(args.slice(1));
  if (sub === "clean") {
    assetsClean();
    return true;
  }
  return false;
}
