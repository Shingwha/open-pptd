// ============================================================================
// cli/assets.js — assets subcommand: install everything in one request (replaces per-file downloads)
// ----------------------------------------------------------------------------
//   assets list                                   status (what is installed, version, size, libraries)
//   assets sync [icons|fonts|all] [--from <zip>]  download → verify → extract to home/assets
//   assets clean                                  clear cache/ and tmp/ (safe to delete wholesale)
//   assets themes list|import|export|delete|apply theme library (W6; built-ins read-only)
//   assets fonts  list|import|remove              global user font library (W6)
//
// Asset zip sources (GitHub Releases, produced by pack-release):
//   https://github.com/Shingwha/open-pptd/releases/latest/download/open-pptd-icons-v<ver>.zip
//   https://github.com/Shingwha/open-pptd/releases/latest/download/open-pptd-fonts-v<ver>.zip
// Missing zip (404) → fall back to the per-file downloader (cli/download.js) with a clear notice.
// Verification: prefer SHA256SUMS (same release), otherwise structural (valid ZIP + expected extension).
// **The registry never enters assets/**: any registry.json entry is dropped at extraction.
// Theme/font library IO lives in the Node adapters (server/theme-store.js,
// server/font-library.js); this file only formats CLI output.
// ============================================================================

import { existsSync, readFileSync, rmSync, readdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import * as yaml from "../model/vendor/js-yaml.mjs";
import { applyTheme } from "../model/theme-library.js";
import { paths, ensureHome, atomicWriteFile, dirSize, isRegistryPath, resolveResourceFile } from "../paths.js";
import { readFontRegistry, readIconRegistry, fontReadyInfo, iconReadyInfo, packageVersion } from "./resource-status.js";
import { downloadFonts, downloadIcons } from "./download.js";
import { createFileThemeStore } from "../server/theme-store.js";
import { createFileFontLibrary, fontLibraryPaths } from "../server/font-library.js";

const RELEASES = "https://github.com/Shingwha/open-pptd/releases/latest/download";

/** Asset target definitions: zip name / extraction dest / expected extension. */
export const ASSET_TARGETS = {
  icons: { zipName: () => `open-pptd-icons-v${packageVersion()}.zip`, dest: () => paths.icons, ext: /\.svg$/i },
  fonts: { zipName: () => `open-pptd-fonts-v${packageVersion()}.zip`, dest: () => paths.fonts, ext: /\.(ttf|otf)$/i },
};

// ---------------------------------------------------------------------------
// Minimal ZIP reader (store + deflate; node:zlib inflateRaw)
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

/** Safe relative path (rejects absolute paths / .. / drive letters). */
function safeRelPath(name) {
  const n = String(name).replace(/\\/g, "/");
  if (!n || n.startsWith("/") || /^[a-zA-Z]:/.test(n)) return null;
  const parts = n.split("/").filter((p) => p && p !== ".");
  if (parts.some((p) => p === "..")) return null;
  return parts.join("/");
}

/**
 * Extract a ZIP into a dir (drop registry.json entries; traversal-safe; atomic writes).
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
    if (isRegistryPath(rel)) continue; // the registry never enters assets/
    const dest = join(destDir, rel);
    if (!dest.startsWith(destDir)) continue; // second traversal guard
    atomicWriteFile(dest, e.data);
    files.push(rel);
    if (verifyExt && verifyExt.test(rel)) matched++;
  }
  if (verifyExt && matched < 1) throw new Error("ZIP 内容与目标不符（未找到期望的资产文件）");
  return { files, matched };
}

// ---------------------------------------------------------------------------
// Download + SHA256 verification
// ---------------------------------------------------------------------------
// Timeout note: this is a single-request budget for one release zip (connect + body together).
// It is intentionally not merged with cli/download.js's two-stage per-file timeouts (connect
// 10s, then a separate body budget with mirror-health tracking): unifying would change the
// granularity and the failure-classification behavior of the per-file downloader.
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

/** Try to fetch and verify the release's SHA256SUMS; null when unavailable (caller degrades). */
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
 * Download one asset zip and extract it to home.
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

/** Offline import: extract from a local zip (no network). */
function syncTargetFromZip(target, zipPath) {
  if (!existsSync(zipPath)) throw new Error(`zip 不存在: ${zipPath}`);
  const def = ASSET_TARGETS[target];
  const bytes = readFileSync(zipPath);
  const { files } = extractZipTo(bytes, def.dest(), { verifyExt: def.ext });
  return { ok: true, files: files.length, name: zipPath };
}

// ---------------------------------------------------------------------------
// Subcommands
// ---------------------------------------------------------------------------
async function assetsList() {
  const fontReg = readFontRegistry();
  const iconReg = readIconRegistry();
  const f = fontReadyInfo(fontReg);
  const ic = iconReadyInfo(iconReg);
  let themeCounts = { builtin: 0, user: 0 };
  let userFontCount = 0;
  try {
    const themes = await createFileThemeStore().list();
    themeCounts = { builtin: themes.filter((t) => t.builtin).length, user: themes.filter((t) => !t.builtin).length };
  } catch (err) {
    console.warn(`⚠ 主题库读取失败: ${err.message}`);
  }
  try {
    const fonts = await createFileFontLibrary().list();
    userFontCount = fonts.filter((x) => x.source === "user" || x.source === "url").length;
  } catch (err) {
    console.warn(`⚠ 字体库读取失败: ${err.message}`);
  }
  console.log("open-pptd 资源状态\n");
  console.log(`  home        ${paths.home}`);
  console.log(`  fonts       ${f.ready} / ${f.total} 就绪 · ${(dirSize(paths.fonts) / 1024 / 1024).toFixed(1)} MB（${paths.fonts}）`);
  console.log(`  icons       ${ic.ready} / ${ic.total} 就绪 · ${(dirSize(paths.icons) / 1024 / 1024).toFixed(2)} MB（${paths.icons}）`);
  console.log(`  themes      ${themeCounts.builtin} 内置 · ${themeCounts.user} 我的（${paths.themes}）`);
  console.log(`  user fonts  ${userFontCount} 种（${paths.userFonts}）`);
  console.log(`  registry    包内只读（fonts v${fontReg.version} · FA ${iconReg.faVersion}），永不被 home 遮蔽`);
  console.log(`\n  安装：node bin/open-pptd.js assets sync [icons|fonts|all]    离线：--from <zip>`);
}

// ---------------------------------------------------------------------------
// W6: theme library subcommands (built-ins read-only; user themes in home)
// ---------------------------------------------------------------------------
const CARD_KEYS = ["primary", "accent", "accent3", "accent4", "accent5", "accent6"];

function positional(args) {
  const valued = new Set(["-o", "--out", "--from", "--deck", "--family", "--key", "--file", "--license", "--url"]);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (valued.has(a)) {
      i += 1; // skip the option's value
      continue;
    }
    if (!a.startsWith("--")) return a;
  }
  return null;
}

function optValue(args, name) {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : null;
}

function emitJson(payload) {
  process.stdout.write(JSON.stringify(payload) + "\n");
}

function printPreserved(preserved) {
  console.log(`  保留：颜色 ${preserved.colors.length} · 文字样式 ${preserved.textStyles.length} · 表格样式 ${preserved.tableStyles.length}`);
  if (preserved.colors.length) console.log(`  颜色令牌：${preserved.colors.join(", ")}`);
  if (preserved.textStyles.length) console.log(`  文字样式：${preserved.textStyles.join(", ")}`);
  if (preserved.tableStyles.length) console.log(`  表格样式：${preserved.tableStyles.join(", ")}`);
}

function loadDeckForTheme(manifestPath) {
  const manifest = yaml.load(readFileSync(manifestPath, "utf8"));
  const baseDir = dirname(manifestPath);
  const pages = [];
  for (const rel of manifest?.pages || []) {
    const p = join(baseDir, String(rel));
    if (!existsSync(p)) continue;
    try {
      pages.push(yaml.load(readFileSync(p, "utf8")));
    } catch {
      /* one unreadable page should not block theme preview */
    }
  }
  return { ...(manifest && typeof manifest === "object" ? manifest : {}), pages };
}

async function assetsThemes(args) {
  const sub = args[0];
  const rest = args.slice(1);
  const json = rest.includes("--json");
  try {
    if (sub === "list") {
      const store = createFileThemeStore();
      const themes = await store.list();
      const builtin = themes.filter((t) => t.builtin).length;
      if (json) {
        emitJson({ ok: true, themes, counts: { builtin, user: themes.length - builtin } });
        return true;
      }
      console.log(`open-pptd 主题库（${builtin} 内置 · ${themes.length - builtin} 我的）\n`);
      for (const t of themes) {
        const swatches = CARD_KEYS.map((k) => t.colors?.[k]).filter(Boolean).join(" ");
        console.log(`  ${t.builtin ? "[内置]" : "[我的]"} ${t.id.padEnd(30)} ${String(t.name).padEnd(12)} ${swatches}`);
      }
      console.log(`\n  路径：${paths.themes}`);
      return true;
    }

    if (sub === "import") {
      const file = positional(rest) || optValue(rest, "--from");
      if (!file) throw Object.assign(new Error("用法: assets themes import <file.json|->"), { code: "ERR_THEME_ID" });
      const text = file === "-" ? readFileSync(0, "utf8") : readFileSync(file, "utf8");
      const theme = await createFileThemeStore().import(text);
      if (json) emitJson({ ok: true, theme });
      else console.log(`✓ 已导入主题「${theme.name}」→ ${theme.id}（${paths.themes}）`);
      return true;
    }

    if (sub === "export") {
      const id = positional(rest);
      if (!id) throw Object.assign(new Error("用法: assets themes export <id> [-o <file>]"), { code: "ERR_THEME_ID" });
      const text = await createFileThemeStore().export(id);
      const out = optValue(rest, "-o") || optValue(rest, "--out");
      if (out) {
        atomicWriteFile(out, text);
        if (json) emitJson({ ok: true, id, out });
        else console.log(`✓ 已导出主题 ${id} → ${out}`);
      } else if (json) {
        emitJson({ ok: true, id, json: text });
      } else {
        process.stdout.write(text);
      }
      return true;
    }

    if (sub === "delete" || sub === "remove") {
      const id = positional(rest);
      if (!id) throw Object.assign(new Error("用法: assets themes delete <id>"), { code: "ERR_THEME_ID" });
      await createFileThemeStore().remove(id);
      if (json) emitJson({ ok: true, id });
      else console.log(`✓ 已删除用户主题 ${id}`);
      return true;
    }

    if (sub === "apply") {
      const id = positional(rest);
      if (!id) throw Object.assign(new Error("用法: assets themes apply <id> [--deck <deck.pptd>] [-o <theme.json>]"), { code: "ERR_THEME_ID" });
      const store = createFileThemeStore();
      const themeFile = await store.read(id);
      if (!themeFile) throw Object.assign(new Error(`主题不存在: ${id}`), { code: "ERR_THEME_NOT_FOUND" });
      const deckPath = optValue(rest, "--deck");
      const deck = deckPath ? loadDeckForTheme(deckPath) : null;
      const result = applyTheme(deck?.theme || {}, themeFile, { deck });
      const out = optValue(rest, "-o") || optValue(rest, "--out");
      if (out) atomicWriteFile(out, `${JSON.stringify(result.theme, null, 2)}\n`);
      if (json) {
        emitJson({ ok: true, id, theme: result.theme, preserved: result.preserved, deck: deckPath || null });
      } else {
        console.log(`主题「${themeFile.name}」应用到 ${deckPath || "（未提供 --deck，纯替换预览）"}`);
        printPreserved(result.preserved);
        if (out) console.log(`  结果主题 → ${out}`);
        else console.log("  （仅预览；如需写入 deck，使用编辑器或 build --theme）");
      }
      return true;
    }

    return false;
  } catch (err) {
    if (json) emitJson({ ok: false, error: { code: err?.code || "ERR_THEME", message: err?.message || String(err) } });
    else console.error(`✗ ${err?.message || err}`);
    process.exitCode = 1;
    return true;
  }
}

// ---------------------------------------------------------------------------
// W6: global user font library subcommands
// ---------------------------------------------------------------------------
async function assetsFonts(args) {
  const sub = args[0];
  const rest = args.slice(1);
  const json = rest.includes("--json");
  try {
    if (sub === "list") {
      const lib = createFileFontLibrary();
      const fonts = await lib.list({ includeSystem: true });
      const groups = { builtin: [], user: [], system: [] };
      for (const f of fonts) {
        if (f.source === "system") groups.system.push(f);
        else if (f.source === "builtin") groups.builtin.push(f);
        else groups.user.push(f);
      }
      if (json) {
        emitJson({
          ok: true,
          fonts,
          counts: { builtin: groups.builtin.length, user: groups.user.length, system: groups.system.length },
          userDir: fontLibraryPaths().userDir,
        });
        return true;
      }
      console.log(`open-pptd 字体库（内置 ${groups.builtin.length} · 我的 ${groups.user.length} · 系统 ${groups.system.length}）\n`);
      console.log("【我的字体】");
      if (!groups.user.length) console.log("  （空）用 assets fonts import <file.ttf> 导入");
      for (const f of groups.user) console.log(`  ✓ ${String(f.key).padEnd(14)} ${String(f.family).padEnd(28)} ${f.file}${f.subset ? " · 子集化" : ""}`);
      console.log("\n【内置字体】");
      for (const f of groups.builtin) {
        const ready = f.file && resolveResourceFile("fonts", f.file);
        console.log(`  ${ready ? "✓" : "✗"} ${String(f.key).padEnd(14)} ${String(f.family).padEnd(28)} ${f.file || ""}`);
      }
      if (groups.system.length) {
        console.log("\n【系统字体（仅声明不嵌入）】");
        for (const f of groups.system) console.log(`  ○ ${String(f.key).padEnd(12)} ${String(f.family).padEnd(24)} ${f.platform || ""}`);
      }
      console.log(`\n  用户字体路径：${fontLibraryPaths().userDir}`);
      return true;
    }

    if (sub === "import") {
      const url = optValue(rest, "--url");
      const file = positional(rest) || optValue(rest, "--from");
      const meta = {
        family: optValue(rest, "--family") || undefined,
        key: optValue(rest, "--key") || undefined,
        file: optValue(rest, "--file") || undefined,
        license: optValue(rest, "--license") || undefined,
        subset: rest.includes("--no-subset") ? false : undefined,
      };
      if (!url && !file) {
        throw Object.assign(new Error("用法: assets fonts import <file.ttf> | --url <https://...>"), { code: "ERR_FONT_INVALID" });
      }
      const lib = createFileFontLibrary();
      let font;
      if (url) {
        font = await lib.importUrl(url, meta);
      } else {
        meta.file ||= basename(file);
        font = await lib.importFile(new Uint8Array(readFileSync(file)), meta);
      }
      if (json) emitJson({ ok: true, font });
      else {
        console.log(`✓ 已导入字体「${font.family}」→ ${font.file}（${font.key}）`);
        console.log(`  路径：${join(fontLibraryPaths().userDir, font.file)} · ${(font.size / 1024 / 1024).toFixed(1)} MB`);
      }
      return true;
    }

    if (sub === "remove") {
      const ref = positional(rest);
      if (!ref) throw Object.assign(new Error("用法: assets fonts remove <key|family>"), { code: "ERR_FONT_NOT_FOUND" });
      const entry = await createFileFontLibrary().remove(ref);
      if (json) emitJson({ ok: true, key: entry.key, family: entry.family, warning: "引用该字体的项目将显示缺失（未扫描项目）" });
      else {
        console.log(`✓ 已删除用户字体「${entry.family}」（${entry.key}）`);
        console.log("  ⚠ 引用该字体的项目将显示缺失；未扫描项目（按需在项目中重新选择/导入）");
      }
      return true;
    }

    return false;
  } catch (err) {
    if (json) emitJson({ ok: false, error: { code: err?.code || "ERR_FONT", message: err?.message || String(err) } });
    else console.error(`✗ ${err?.message || err}`);
    process.exitCode = 1;
    return true;
  }
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
      } catch { /* in use → skip */ }
    }
    console.log(`✓ 已清 ${dir}（${n} 项）`);
  }
  console.log("（cache/ 与 tmp/ 可整目录安全删除；assets/ 与 config.json 未动）");
}

/** assets subcommand entry. */
export async function runAssets(args) {
  const sub = args[0] || "list";
  if (sub === "list") {
    await assetsList();
    return true;
  }
  if (sub === "sync") return assetsSync(args.slice(1));
  if (sub === "clean") {
    assetsClean();
    return true;
  }
  if (sub === "themes") return assetsThemes(args.slice(1));
  if (sub === "fonts") return assetsFonts(args.slice(1));
  return false;
}
