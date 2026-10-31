// ============================================================================
// cli/assets.js — `assets`: bundled assets, theme library and user font library
// ----------------------------------------------------------------------------
//   assets list [--json]
//   assets sync [all|fonts|icons] [--from <zip>] [--json]
//   assets clean [--json]
//   assets themes list|import|export|delete|apply [--json]
//   assets fonts  list|import|remove [--json]
//
// Asset zip sources (GitHub Releases, produced by pack-release):
//   https://github.com/Shingwha/open-pptd/releases/latest/download/open-pptd-icons-v<ver>.zip
//   https://github.com/Shingwha/open-pptd/releases/latest/download/open-pptd-fonts-v<ver>.zip
// Missing zip (404) → fall back to the per-file downloader (cli/download.js).
// Verification: SHA256SUMS when available, otherwise structural (ZIP + extension).
// **The registry never enters assets/**: any registry.json entry is dropped at extraction.
// Theme/font library IO lives in the Node adapters (server/theme-store.js,
// server/font-library.js); this file formats output and, for `themes apply`, does
// the explicit deck write (atomic, only deck.theme is touched).
// Human text goes to stderr; --json prints a single line on stdout.
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
import { CliError, jsonLine } from "./errors.js";

const RELEASES = "https://github.com/Shingwha/open-pptd/releases/latest/download";
const human = (m) => console.error(m);

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

/** Download one asset zip and extract it to home. */
async function syncTargetFromRelease(target) {
  const def = ASSET_TARGETS[target];
  const name = def.zipName();
  let bytes;
  try {
    bytes = await fetchBytes(`${RELEASES}/${name}`);
  } catch (err) {
    return { ok: false, target, reason: `${name} 下载失败（${err.message}）` };
  }
  const sha = await verifySha256(name, bytes);
  if (sha === false) return { ok: false, target, reason: `${name} SHA256 校验失败` };
  try {
    const { files } = extractZipTo(bytes, def.dest(), { verifyExt: def.ext });
    return { ok: true, target, files: files.length, sha, name };
  } catch (err) {
    return { ok: false, target, reason: `${name} 解压/校验失败（${err.message}）` };
  }
}

/** Offline import: extract from a local zip (no network). */
function syncTargetFromZip(target, zipPath) {
  if (!existsSync(zipPath)) throw new CliError("ERR_NOT_FOUND", `zip 不存在: ${zipPath}`);
  const def = ASSET_TARGETS[target];
  const bytes = readFileSync(zipPath);
  const { files } = extractZipTo(bytes, def.dest(), { verifyExt: def.ext });
  return { ok: true, target, files: files.length, name: zipPath };
}

// ---------------------------------------------------------------------------
// Argument helpers
// ---------------------------------------------------------------------------
const VALUED = new Set(["-o", "--out", "--from", "--deck", "--family", "--key", "--file", "--license", "--url"]);

function positionals(args) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (VALUED.has(a)) {
      i += 1; // skip the option's value
      continue;
    }
    if (a === "-") {
      out.push(a); // themes import - reads stdin
      continue;
    }
    if (a.startsWith("-")) continue;
    out.push(a);
  }
  return out;
}

function positional(args) {
  return positionals(args)[0] || null;
}

function optValue(args, name) {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : null;
}

function flagValue(args, name) {
  const hit = args.find((a) => a.startsWith(name + "="));
  return hit ? hit.slice(name.length + 1) : optValue(args, name);
}

// ---------------------------------------------------------------------------
// list / sync / clean
// ---------------------------------------------------------------------------
async function collectListFacts() {
  const fontReg = readFontRegistry();
  const iconReg = readIconRegistry();
  const f = fontReadyInfo(fontReg);
  const ic = iconReadyInfo(iconReg);
  let themes = { builtin: 0, user: 0 };
  let userFonts = 0;
  try {
    const list = await createFileThemeStore().list();
    themes = { builtin: list.filter((t) => t.builtin).length, user: list.filter((t) => !t.builtin).length };
  } catch (err) {
    human(`⚠ 主题库读取失败: ${err.message}`);
  }
  try {
    const fonts = await createFileFontLibrary().list();
    userFonts = fonts.filter((x) => x.source === "user" || x.source === "url").length;
  } catch (err) {
    human(`⚠ 字体库读取失败: ${err.message}`);
  }
  return {
    ok: true,
    home: paths.home,
    fonts: { ready: f.ready, total: f.total, bytes: dirSize(paths.fonts), dir: paths.fonts },
    icons: { ready: ic.ready, total: ic.total, bytes: dirSize(paths.icons), dir: paths.icons },
    themes: { ...themes, dir: paths.themes },
    userFonts: { count: userFonts, dir: paths.userFonts },
    registry: { fontsVersion: fontReg.version, faVersion: iconReg.faVersion, readonly: true },
  };
}

async function assetsList(args) {
  const json = args.includes("--json");
  const facts = await collectListFacts();
  if (json) {
    jsonLine(facts);
    return true;
  }
  human("open-pptd 资源状态\n");
  human(`  home        ${facts.home}`);
  human(`  fonts       ${facts.fonts.ready} / ${facts.fonts.total} 就绪 · ${(facts.fonts.bytes / 1024 / 1024).toFixed(1)} MB（${facts.fonts.dir}）`);
  human(`  icons       ${facts.icons.ready} / ${facts.icons.total} 就绪 · ${(facts.icons.bytes / 1024 / 1024).toFixed(2)} MB（${facts.icons.dir}）`);
  human(`  themes      ${facts.themes.builtin} 内置 · ${facts.themes.user} 我的（${facts.themes.dir}）`);
  human(`  user fonts  ${facts.userFonts.count} 种（${facts.userFonts.dir}）`);
  human(`  registry    包内只读（fonts v${facts.registry.fontsVersion} · FA ${facts.registry.faVersion}），永不被 home 遮蔽`);
  human("\n  安装：node bin/open-pptd.js assets sync [icons|fonts|all]    离线：--from <zip>");
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

async function assetsSync(args) {
  const json = args.includes("--json");
  const target = ["icons", "fonts", "all"].includes(args[0]) ? args[0] : "all";
  const targets = target === "all" ? ["icons", "fonts"] : [target];
  const fromZip = flagValue(args, "--from");
  ensureHome();

  const results = [];
  for (const t of targets) {
    if (fromZip) {
      try {
        const r = syncTargetFromZip(t, fromZip);
        results.push({ ...r, source: "zip" });
        if (!json) human(`✓ ${t} 离线导入 → ${ASSET_TARGETS[t].dest()}（${r.files} 个文件）`);
      } catch (err) {
        results.push({ ok: false, target: t, reason: err.message, source: "zip" });
        if (!json) human(`✗ ${t} 离线导入失败: ${err.message}`);
      }
      continue;
    }
    if (!json) human(`▸ ${t}：尝试 release 资产包…`);
    const r = await syncTargetFromRelease(t);
    if (r.ok) {
      results.push({ ...r, source: "release" });
      if (!json) human(`✓ ${t} ← ${r.name}（${r.files} 个文件）${r.sha === null ? "（无 SHA256SUMS，已结构性校验）" : ""}`);
      continue;
    }
    if (!json) human(`  ! ${r.reason}；回退逐文件下载器`);
    try {
      await fallbackDownload(t);
      results.push({ ok: true, target: t, source: "fallback" });
      if (!json) human(`✓ ${t} 逐文件下载完成`);
    } catch (err) {
      results.push({ ok: false, target: t, reason: err.message, source: "fallback" });
      if (!json) human(`✗ ${t} 逐文件下载失败: ${err.message}`);
    }
  }

  const ok = results.every((r) => r.ok);
  if (json) jsonLine({ ok, target, results });
  if (!ok) process.exitCode = 1;
  return true;
}

function assetsClean(args) {
  const json = args.includes("--json");
  const cleaned = [];
  for (const dir of [paths.cache, paths.tmp]) {
    if (!existsSync(dir)) continue;
    let n = 0;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      try {
        rmSync(join(dir, e.name), { recursive: true, force: true });
        n++;
      } catch {
        /* in use → skip */
      }
    }
    cleaned.push({ dir, count: n });
    if (!json) human(`✓ 已清 ${dir}（${n} 项）`);
  }
  if (json) jsonLine({ ok: true, cleaned });
  else human("（cache/ 与 tmp/ 可整目录安全删除；assets/ 与 config.json 未动）");
  return true;
}

// ---------------------------------------------------------------------------
// themes
// ---------------------------------------------------------------------------
const CARD_KEYS = ["primary", "accent", "accent3", "accent4", "accent5", "accent6"];

function printPreserved(preserved) {
  human(`  保留：颜色 ${preserved.colors.length} · 文字样式 ${preserved.textStyles.length} · 表格样式 ${preserved.tableStyles.length}`);
  if (preserved.colors.length) human(`  颜色令牌：${preserved.colors.join(", ")}`);
  if (preserved.textStyles.length) human(`  文字样式：${preserved.textStyles.join(", ")}`);
  if (preserved.tableStyles.length) human(`  表格样式：${preserved.tableStyles.join(", ")}`);
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
      /* one unreadable page should not block a theme preview */
    }
  }
  return { ...(manifest && typeof manifest === "object" ? manifest : {}), pages };
}

/** Replace the top-level `theme:` block in a manifest text (all other lines untouched). */
export function replaceThemeBlock(text, theme) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const block = yaml.dump({ theme }).replace(/\n$/, "").split("\n");
  const start = lines.findIndex((l) => /^theme\s*:/.test(l));
  if (start >= 0) {
    let end = start + 1;
    while (end < lines.length && !/^[A-Za-z_][\w-]*\s*:/.test(lines[end])) end++;
    lines.splice(start, end - start, ...block);
  } else {
    const pagesIdx = lines.findIndex((l) => /^pages\s*:/.test(l));
    if (pagesIdx >= 0) lines.splice(pagesIdx, 0, ...block, "");
    else {
      if (lines.length && lines[lines.length - 1] !== "") lines.push("");
      lines.push(...block);
    }
  }
  return lines.join(eol) + eol;
}

function writeDeckTheme(deckPath, theme) {
  const text = readFileSync(deckPath, "utf8");
  atomicWriteFile(deckPath, replaceThemeBlock(text, theme), { tmpDir: dirname(deckPath) });
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
        jsonLine({ ok: true, themes, counts: { builtin, user: themes.length - builtin } });
        return true;
      }
      human(`open-pptd 主题库（${builtin} 内置 · ${themes.length - builtin} 我的）\n`);
      for (const t of themes) {
        const swatches = CARD_KEYS.map((k) => t.colors?.[k]).filter(Boolean).join(" ");
        human(`  ${t.builtin ? "[内置]" : "[我的]"} ${t.id.padEnd(30)} ${String(t.name).padEnd(12)} ${swatches}`);
      }
      human(`\n  路径：${paths.themes}`);
      return true;
    }

    if (sub === "import") {
      const file = positional(rest) || flagValue(rest, "--from");
      if (!file) throw new CliError("ERR_USAGE", "用法: assets themes import <file.json|->");
      const text = file === "-" ? readFileSync(0, "utf8") : readFileSync(file, "utf8");
      const theme = await createFileThemeStore().import(text);
      if (json) jsonLine({ ok: true, theme });
      else human(`✓ 已导入主题「${theme.name}」→ ${theme.id}（${paths.themes}）`);
      return true;
    }

    if (sub === "export") {
      const pos = positionals(rest);
      const id = pos[0];
      if (!id) throw new CliError("ERR_USAGE", "用法: assets themes export <id> <file.json>");
      const text = await createFileThemeStore().export(id);
      const out = pos[1] || flagValue(rest, "-o") || flagValue(rest, "--out");
      if (out) {
        atomicWriteFile(out, text);
        if (json) jsonLine({ ok: true, id, out });
        else human(`✓ 已导出主题 ${id} → ${out}`);
      } else if (json) {
        jsonLine({ ok: true, id, json: text });
      } else {
        process.stdout.write(text);
      }
      return true;
    }

    if (sub === "delete") {
      const id = positional(rest);
      if (!id) throw new CliError("ERR_USAGE", "用法: assets themes delete <id>");
      await createFileThemeStore().remove(id);
      if (json) jsonLine({ ok: true, id });
      else human(`✓ 已删除用户主题 ${id}`);
      return true;
    }

    if (sub === "apply") {
      const pos = positionals(rest);
      const id = pos[0];
      const deckPath = pos[1] || flagValue(rest, "--deck");
      const dryRun = rest.includes("--dry-run");
      if (!id) throw new CliError("ERR_USAGE", "用法: assets themes apply <id> <deck.pptd> [--dry-run] [--json]");
      if (!deckPath) throw new CliError("ERR_USAGE", "assets themes apply 需要 deck.pptd（写 deck.theme）");
      if (!existsSync(deckPath)) throw new CliError("ERR_NOT_FOUND", `deck 不存在: ${deckPath}`);
      const themeFile = await createFileThemeStore().read(id);
      if (!themeFile) throw new CliError("ERR_THEME_NOT_FOUND", `主题不存在: ${id}`);
      const deck = loadDeckForTheme(deckPath);
      const result = applyTheme(deck?.theme || {}, themeFile, { deck });
      if (!dryRun) writeDeckTheme(deckPath, result.theme);
      if (json) {
        jsonLine({ ok: true, id, deck: deckPath, dryRun, written: !dryRun, preserved: result.preserved, theme: result.theme });
      } else {
        human(`主题「${themeFile.name}」${dryRun ? "预演（未写入）" : "已写入"} ${deckPath}`);
        printPreserved(result.preserved);
        if (dryRun) human("  --dry-run：deck 未修改；去掉该参数即原子写入 deck.theme");
        else human("  deck.theme 已替换（其余字段/citation 引用保持不变）");
      }
      return true;
    }

    return false;
  } catch (err) {
    if (json) jsonLine({ ok: false, error: { code: err?.code || "ERR_THEME", message: err?.message || String(err) } });
    else human(`✗ ${err?.message || err}`);
    process.exitCode = 1;
    return true;
  }
}

// ---------------------------------------------------------------------------
// fonts (global user library)
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
        jsonLine({
          ok: true,
          fonts,
          counts: { builtin: groups.builtin.length, user: groups.user.length, system: groups.system.length },
          userDir: fontLibraryPaths().userDir,
        });
        return true;
      }
      human(`open-pptd 字体库（内置 ${groups.builtin.length} · 我的 ${groups.user.length} · 系统 ${groups.system.length}）\n`);
      human("【我的字体】");
      if (!groups.user.length) human("  （空）用 assets fonts import <file.ttf> 导入");
      for (const f of groups.user) human(`  ✓ ${String(f.key).padEnd(14)} ${String(f.family).padEnd(28)} ${f.file}${f.subset ? " · 子集化" : ""}`);
      human("\n【内置字体】");
      for (const f of groups.builtin) {
        const ready = f.file && resolveResourceFile("fonts", f.file);
        human(`  ${ready ? "✓" : "✗"} ${String(f.key).padEnd(14)} ${String(f.family).padEnd(28)} ${f.file || ""}`);
      }
      if (groups.system.length) {
        human("\n【系统字体（仅声明不嵌入）】");
        for (const f of groups.system) human(`  ○ ${String(f.key).padEnd(12)} ${String(f.family).padEnd(24)} ${f.platform || ""}`);
      }
      human(`\n  用户字体路径：${fontLibraryPaths().userDir}`);
      return true;
    }

    if (sub === "import") {
      const pos = positionals(rest);
      let url = flagValue(rest, "--url");
      let file = pos[0] || flagValue(rest, "--from");
      if (!url && file && /^https?:\/\//i.test(file)) {
        url = file;
        file = null;
      }
      if (!url && !file) throw new CliError("ERR_USAGE", "用法: assets fonts import <file.ttf|otf|https://...> [--family <name>]");
      const meta = {
        family: flagValue(rest, "--family") || undefined,
        key: flagValue(rest, "--key") || undefined,
        file: flagValue(rest, "--file") || undefined,
        license: flagValue(rest, "--license") || undefined,
        subset: rest.includes("--no-subset") ? false : undefined,
      };
      if (file && !existsSync(file)) throw new CliError("ERR_NOT_FOUND", `字体文件不存在: ${file}`);
      const lib = createFileFontLibrary();
      let font;
      if (url) {
        font = await lib.importUrl(url, meta);
      } else {
        meta.file ||= basename(file);
        font = await lib.importFile(new Uint8Array(readFileSync(file)), meta);
      }
      if (json) jsonLine({ ok: true, font });
      else {
        human(`✓ 已导入字体「${font.family}」→ ${font.file}（${font.key}）`);
        human(`  路径：${join(fontLibraryPaths().userDir, font.file)} · ${(font.size / 1024 / 1024).toFixed(1)} MB`);
      }
      return true;
    }

    if (sub === "remove") {
      const ref = positional(rest);
      if (!ref) throw new CliError("ERR_USAGE", "用法: assets fonts remove <key|family>");
      const entry = await createFileFontLibrary().remove(ref);
      if (json) jsonLine({ ok: true, key: entry.key, family: entry.family, warning: "引用该字体的项目将显示缺失（未扫描项目）" });
      else {
        human(`✓ 已删除用户字体「${entry.family}」（${entry.key}）`);
        human("  ⚠ 引用该字体的项目将显示缺失；未扫描项目（按需在项目中重新选择/导入）");
      }
      return true;
    }

    return false;
  } catch (err) {
    if (json) jsonLine({ ok: false, error: { code: err?.code || "ERR_FONT", message: err?.message || String(err) } });
    else human(`✗ ${err?.message || err}`);
    process.exitCode = 1;
    return true;
  }
}

/** assets subcommand entry. Returns false for an unknown subcommand (bin prints usage). */
export async function runAssets(args) {
  const sub = args[0] || "list";
  if (sub === "list") return assetsList(args.slice(1));
  if (sub === "sync") return assetsSync(args.slice(1));
  if (sub === "clean") return assetsClean(args.slice(1));
  if (sub === "themes") return assetsThemes(args.slice(1));
  if (sub === "fonts") return assetsFonts(args.slice(1));
  return false;
}
