// ============================================================================
// packages/paths.js — 资源与配置路径解析（契约 5，见 docs/embedding.md §5）
// ----------------------------------------------------------------------------
// 规则（本文件独占，下游只消费、不自己拼目录名）：
//   · 读三级：$OPEN_PPTD_HOME → ~/.open-pptd → <包根>/assets（首个命中即用）
//   · 写一级：永远写 home（npm/pnpm 安装目录可能只读，包内资源永久只读）
//   · registry.json 与代码版本耦合 → resourceRoots.registry 只有一根（包根），
//     home 永不遮蔽它
//
// 本模块 Node 专用（CLI / 本地 serve / 下游 Host 半边消费），不进浏览器链路；
// 浏览器端仍按「站点根相对」请求 assets/**，由 server/static.js 的多根解析落地，
// 因此 font-registry.js / icon-fa.js 的浏览器分支保持零改动。
// ============================================================================

import { existsSync, mkdirSync, writeFileSync, renameSync, rmSync, statSync, readdirSync } from "node:fs";
import os from "node:os";
import { join, dirname, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** 包根（含 contract.json / package.json / assets 的目录）。 */
export const PACKAGE_ROOT = resolve(__dirname, "..");

/**
 * 资源根目录：`$OPEN_PPTD_HOME` 优先（原样使用，Node 不展开 `~`），
 * 否则 `os.homedir()/.open-pptd`。
 * @returns {string}
 */
export function openPptdHome() {
  const env = process.env.OPEN_PPTD_HOME;
  if (env && String(env).trim()) return String(env).trim();
  return join(os.homedir(), ".open-pptd");
}

/** home 与各资源目录（模块加载时求值一次，反映当时的 OPEN_PPTD_HOME）。 */
export const paths = Object.freeze({
  home: openPptdHome(),
  assets: join(openPptdHome(), "assets"),
  fonts: join(openPptdHome(), "assets", "fonts"),
  icons: join(openPptdHome(), "assets", "icons"),
  cli: join(openPptdHome(), "cli"),
  cliCurrent: join(openPptdHome(), "cli", "current"),
  config: join(openPptdHome(), "config.json"),
  state: join(openPptdHome(), "state"),
  cache: join(openPptdHome(), "cache"),
  tmp: join(openPptdHome(), "tmp"),
});

/**
 * 读侧解析链（顺序即优先级，首个命中即用）：
 *   fonts / icons：home 优先 → 包内只读回退（现有安装零迁移）
 *   registry     ：**【只有一根】** 包根（版本耦合，home 永不遮蔽）
 */
export const resourceRoots = Object.freeze({
  fonts: Object.freeze([paths.fonts, join(PACKAGE_ROOT, "assets", "fonts")]),
  icons: Object.freeze([paths.icons, join(PACKAGE_ROOT, "assets", "icons")]),
  registry: Object.freeze([PACKAGE_ROOT]),
});

/**
 * 幂等创建 home 目录树（assets/{fonts,icons}、cli、state、cache、tmp）。
 * EACCES/EPERM 抛出明确错误（调用方决定只读降级）。
 * @returns {string} home 路径
 */
export function ensureHome() {
  const dirs = [paths.home, paths.assets, paths.fonts, paths.icons, paths.cli, paths.state, paths.cache, paths.tmp];
  try {
    for (const d of dirs) mkdirSync(d, { recursive: true });
  } catch (err) {
    if (err?.code === "EACCES" || err?.code === "EPERM") {
      throw new Error(`无法创建资源目录 ${paths.home}（权限不足 ${err.code}）；可用 OPEN_PPTD_HOME 指定其他位置`);
    }
    throw err;
  }
  return paths.home;
}

/**
 * 在候选根中按序找首个命中文件（读三级）。
 * @param {"fonts"|"icons"|"registry"} kind
 * @param {string} [rel] 根内相对路径（如 "SmileySans-Oblique.ttf" / "assets/fonts/registry.json"）
 * @returns {string|null} 绝对路径
 */
export function resolveResourceFile(kind, rel = "") {
  const roots = resourceRoots[kind] || [];
  for (const root of roots) {
    const p = rel ? join(root, rel) : root;
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * 原子落盘：先写 `tmp/<random>.part`，完成后同盘 `rename()` 到目标。
 * 并发下载同一文件不会留下半截目标文件（读侧永远看到完整字节或旧字节）。
 * @param {string} destPath 目标绝对路径
 * @param {Buffer|Uint8Array|string} bytes
 * @returns {string} destPath
 */
export function atomicWriteFile(destPath, bytes) {
  mkdirSync(dirname(destPath), { recursive: true });
  mkdirSync(paths.tmp, { recursive: true });
  let lastErr;
  for (let i = 0; i < 5; i++) {
    const part = join(
      paths.tmp,
      `.${basename(destPath)}.${process.pid.toString(36)}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.part`
    );
    try {
      if (existsSync(part)) continue;
      writeFileSync(part, bytes);
      renameSync(part, destPath);
      return destPath;
    } catch (err) {
      lastErr = err;
      try { rmSync(part, { force: true }); } catch { /* 清理失败不阻塞重试 */ }
    }
  }
  throw lastErr;
}

/** 清理 tmp/ 下的残留 .part（崩溃后遗症）；返回删除个数。 */
export function cleanTempParts() {
  let n = 0;
  try {
    if (existsSync(paths.tmp)) {
      for (const f of readdirSync(paths.tmp)) {
        if (f.endsWith(".part")) {
          try { rmSync(join(paths.tmp, f), { force: true }); n++; } catch { /* ignore */ }
        }
      }
    }
  } catch { /* tmp 不可读则跳过 */ }
  return n;
}

/**
 * CLI 运行时根定位（下游复用同一套引擎定位逻辑，不查 PATH）：
 *   `OPEN_PPTD_CLI` → `~/.open-pptd/cli/current` → null
 */
export function resolveCliRoot() {
  const env = process.env.OPEN_PPTD_CLI;
  if (env && String(env).trim()) return String(env).trim();
  if (existsSync(paths.cliCurrent)) return paths.cliCurrent;
  return null;
}

/** 含 contract.json 的包根（与 PACKAGE_ROOT 同义；契约面命名）。 */
export function contractRoot() {
  return PACKAGE_ROOT;
}

/** 目录体积（字节，忽略不可读项）；用于 doctor / assets list 的“体积”事实。 */
export function dirSize(dir) {
  let total = 0;
  try {
    if (!existsSync(dir)) return 0;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) total += dirSize(p);
      else {
        try { total += statSync(p).size; } catch { /* 忽略 */ }
      }
    }
  } catch { /* 忽略 */ }
  return total;
}
