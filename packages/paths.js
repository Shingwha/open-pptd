// ============================================================================
// packages/paths.js — resource and config path resolution (contract 5, see docs/embedding.md §5)
// ----------------------------------------------------------------------------
// Rules (owned by this file; downstream only consumes, never builds dir names itself):
//   · read three levels: $OPEN_PPTD_HOME → ~/.open-pptd → <package root>/assets (first hit wins)
//   · write one level: always write home (npm/pnpm install dirs may be read-only;
//     in-package resources are permanently read-only)
//   · registry.json is version-coupled with the code → resourceRoots.registry has a single
//     root (the package root); home never shadows it
//
// Node-only module (consumed by CLI / local serve / the downstream Host half), never in the
// browser path; the browser still requests assets/** site-root-relative, resolved by
// server/static.js multi-root logic, so the browser branches of font-registry.js / icon-fa.js
// stay untouched.
// ============================================================================

import { existsSync, mkdirSync, writeFileSync, renameSync, rmSync, statSync, readdirSync } from "node:fs";
import os from "node:os";
import { join, dirname, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Package root (the dir holding contract.json / package.json / assets). */
export const PACKAGE_ROOT = resolve(__dirname, "..");

/**
 * In-package registry dirs (registry.json only; version-coupled with the code, so home never
 * shadows them). These are also the in-package fallback roots for font/icon bytes (the package
 * ships only registry.json there; large bytes live in home). Single source for cli/export.js and
 * cli/resource-status.js — downstream must not rebuild these paths itself.
 */
export const FONT_REGISTRY_DIR = join(PACKAGE_ROOT, "assets", "fonts");
export const ICON_REGISTRY_DIR = join(PACKAGE_ROOT, "assets", "icons");

/**
 * Resource home: `$OPEN_PPTD_HOME` first (used verbatim; Node does not expand `~`),
 * otherwise `os.homedir()/.open-pptd`.
 * @returns {string}
 */
export function openPptdHome() {
  const env = process.env.OPEN_PPTD_HOME;
  if (env && String(env).trim()) return String(env).trim();
  return join(os.homedir(), ".open-pptd");
}

/** home and the resource dirs (evaluated once at module load, reflecting OPEN_PPTD_HOME at that time). */
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
 * Read-side resolution chain (order is priority, first hit wins):
 *   fonts / icons: home first → in-package read-only fallback (zero migration for existing installs)
 *   registry     : **single root only** — the package root (version-coupled; home never shadows)
 */
export const resourceRoots = Object.freeze({
  fonts: Object.freeze([paths.fonts, FONT_REGISTRY_DIR]),
  icons: Object.freeze([paths.icons, ICON_REGISTRY_DIR]),
  registry: Object.freeze([PACKAGE_ROOT]),
});

/**
 * Idempotently create the home dir tree (assets/{fonts,icons}, cli, state, cache, tmp).
 * EACCES/EPERM throw a clear error (the caller decides the read-only degrade).
 * @returns {string} home path
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
 * Find the first hit file across candidate roots, in order (three-level read).
 * @param {"fonts"|"icons"|"registry"} kind
 * @param {string} [rel] path relative to a root (e.g. "SmileySans-Oblique.ttf" / "assets/fonts/registry.json")
 * @returns {string|null} absolute path
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
 * Is a resource-relative path the version-coupled registry manifest (`registry.json`)?
 * The registry always resolves from the package root only (home never shadows it); this is the
 * single-source predicate shared by server/static.js (URL resolution) and cli/assets.js (zip
 * extraction must drop any registry.json entry).
 * @param {string} rel path relative to a resource root (e.g. "fonts/registry.json")
 * @returns {boolean}
 */
export function isRegistryPath(rel) {
  return /(^|\/)registry\.json$/i.test(String(rel || ""));
}

/**
 * Atomic write: write `tmp/<random>.part` first, then same-volume `rename()` to the target.
 * Concurrent downloads of the same file never leave a half-written target (the reader
 * always sees complete or old bytes).
 * @param {string} destPath absolute target path
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
      try { rmSync(part, { force: true }); } catch { /* a cleanup failure does not block the retry */ }
    }
  }
  throw lastErr;
}

/** Clean leftover .part files in tmp/ (crash residue); returns the count removed. */
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
  } catch { /* tmp unreadable → skip */ }
  return n;
}

/**
 * CLI runtime root lookup (downstream reuses the same engine-locating logic; PATH is not searched):
 *   `OPEN_PPTD_CLI` → `~/.open-pptd/cli/current` → null
 */
export function resolveCliRoot() {
  const env = process.env.OPEN_PPTD_CLI;
  if (env && String(env).trim()) return String(env).trim();
  if (existsSync(paths.cliCurrent)) return paths.cliCurrent;
  return null;
}

/** Package root containing contract.json (synonym of PACKAGE_ROOT; contract-surface name). */
export function contractRoot() {
  return PACKAGE_ROOT;
}

/** Directory size in bytes (skipping unreadable entries); used for the doctor / assets list size facts. */
export function dirSize(dir) {
  let total = 0;
  try {
    if (!existsSync(dir)) return 0;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) total += dirSize(p);
      else {
        try { total += statSync(p).size; } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }
  return total;
}
