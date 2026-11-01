// server/theme-store.js — Node storage adapter for the theme library (Node-only)
// User themes: <home>/themes/<id>.json (default ~/.open-pptd/themes). The pure factory
// (model/theme-library.js) owns list/read/save/import/export semantics; this file only
// does file IO: one pretty-printed JSON file per theme, atomic write (same-volume
// rename), id validation before touching a path (no separators / `..`), and corrupt
// JSON files are skipped by list() and reported as ERR_THEME_STORE on read().

import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { paths, atomicWriteFile } from "../paths.js";
import { ThemeError, createThemeStore, isUserThemeId } from "../model/theme-library.js";

/** Paths of the Node theme store for a home dir. */
export function themeStorePaths({ home = paths.home } = {}) {
  return { home, dir: join(home, "themes") };
}

function assertThemeId(id) {
  if (!isUserThemeId(id)) {
    throw new ThemeError("ERR_THEME_ID", `主题 id 不合法: ${String(id)}（禁止路径分隔符/..）`, { id });
  }
}

/**
 * Create the file-backed ThemeStore.
 * @param {object} [options]
 * @param {string} [options.home] home override (tests)
 * @returns {ReturnType<typeof createThemeStore>}
 */
export function createFileThemeStore({ home = paths.home } = {}) {
  const { dir } = themeStorePaths({ home });
  const fileOf = (id) => join(dir, `${id}.json`);

  async function listRaw() {
    if (!existsSync(dir)) return [];
    const out = [];
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".json")) continue;
      const p = join(dir, name);
      try {
        out.push(JSON.parse(readFileSync(p, "utf8")));
      } catch (err) {
        console.warn(`[themes] 跳过无法解析的用户主题 ${name}: ${err.message}`);
      }
    }
    return out;
  }

  async function readRaw(id) {
    assertThemeId(id);
    const p = fileOf(id);
    let text;
    try {
      text = readFileSync(p, "utf8");
    } catch (err) {
      if (err?.code === "ENOENT") return null;
      throw new ThemeError("ERR_THEME_STORE", `主题读取失败: ${err.message}`, { id });
    }
    try {
      return JSON.parse(text);
    } catch (err) {
      throw new ThemeError("ERR_THEME_STORE", `用户主题 JSON 损坏: ${id}（${err.message}）`, { id });
    }
  }

  async function writeRaw(theme) {
    assertThemeId(theme?.id);
    atomicWriteFile(fileOf(theme.id), `${JSON.stringify(theme, null, 2)}\n`, { tmpDir: join(home, "tmp") });
  }

  async function removeRaw(id) {
    assertThemeId(id);
    const p = fileOf(id);
    if (!existsSync(p)) return false;
    try {
      rmSync(p, { force: true });
      return true;
    } catch (err) {
      throw new ThemeError("ERR_THEME_STORE", `主题删除失败: ${err.message}`, { id });
    }
  }

  return createThemeStore({ listRaw, readRaw, writeRaw, removeRaw });
}
