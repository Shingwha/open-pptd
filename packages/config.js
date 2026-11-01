// packages/config.js — user-level config (Contract 3.0 entry open-pptd/config)
// config.json lives in `paths.home` and carries a `version` field users may edit.
// readConfig() merges defaults per version (missing version → 1); writeConfig() is a
// shallow merge write-back that keeps unknown keys and is atomic (tmp → rename).
// Config is read and written in home only; the package never contains user config.

import { readFileSync, mkdirSync, writeFileSync, renameSync, rmSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { paths } from "./paths.js";

/** Current config schema version (filled in with this value when missing). */
export const CONFIG_VERSION = 1;

/** Default config (register new keys here; downstream reads on demand, unknown keys are preserved). */
export const DEFAULT_CONFIG = Object.freeze({
  version: CONFIG_VERSION,
  // Whether an export preflight auto-fetches missing fonts by default. The CLI never reads
  // this: downloads are explicit (`build --fetch` / `assets sync`), so CI/agent envs never
  // trigger tens of MB of downloads.
  autoFetch: false,
});

/**
 * Read config: missing/corrupt file → defaults; per-version migration (missing version → 1).
 * @returns {object} merged config (including unknown keys)
 */
export function readConfig() {
  let raw = {};
  try {
    const parsed = JSON.parse(readFileSync(paths.config, "utf8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) raw = parsed;
  } catch {
    raw = {}; // missing file or corrupt JSON → defaults (no throw; the doctor/export chain must not break on a damaged config)
  }
  const cfg = { ...DEFAULT_CONFIG, ...raw };
  if (typeof cfg.version !== "number") cfg.version = CONFIG_VERSION;
  return cfg;
}

/**
 * Shallow merge write-back (keeping unknown keys), atomic.
 * @param {object} patch
 * @returns {object} the full config after write-back
 */
export function writeConfig(patch = {}) {
  const next = { ...readConfig(), ...patch };
  const dest = paths.config;
  mkdirSync(dirname(dest), { recursive: true });
  const tmp = join(dirname(dest), `.config.${process.pid.toString(36)}${Date.now().toString(36)}.tmp`);
  try {
    writeFileSync(tmp, JSON.stringify(next, null, 2) + "\n", "utf8");
    renameSync(tmp, dest);
  } catch (err) {
    try { if (existsSync(tmp)) rmSync(tmp, { force: true }); } catch { /* a cleanup failure must not mask the original error */ }
    throw err;
  }
  return next;
}
