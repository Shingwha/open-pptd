// packages/model/theme-library.js — theme library core (pure, browser + Node).
// Three layers: built-in snapshots (DEFAULT_THEME + 10 palettes expanded to complete
// themes), user themes stored through an injected adapter (ThemeStore is the environment-
// free factory), and applyTheme (replaces the three theme blocks, keeps referenced tokens
// and reports `preserved`). No node:* / DOM; public methods return cloned values so callers
// cannot mutate built-in snapshots or the store.

import { DEFAULT_THEME, THEME_PALETTES } from "./theme-presets.js";

/** Theme file schema version written to user themes. */
export const THEME_FILE_VERSION = 1;

/** Reserved prefix for built-in theme ids; user themes may never use it. */
export const BUILTIN_THEME_PREFIX = "builtin:";

/** Canonical color token order used by the editor color list (16 stored keys; accent1/2 alias primary/accent in charts). */
export const STANDARD_COLOR_KEYS = Object.freeze([
  "primary", "accent", "bg", "text", "muted", "line", "success", "warning", "danger",
  "primarySoft", "primaryTint", "primaryDeep",
  "accent3", "accent4", "accent5", "accent6",
]);

const HEX_RE = /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const TOKEN_KEY_RE = /^[A-Za-z][A-Za-z0-9_-]*$/;
const STYLE_REF_KEY_RE = /^(style|textStyle)$/i;
const COLOR_REF_KEY_RE = /color|fill/i;
const USER_ID_RE = /^[A-Za-z0-9\u4e00-\u9fff][A-Za-z0-9._\-\u4e00-\u9fff]{0,119}$/;

/** Coded theme error shared by the core, the Node store and the HTTP API. */
export class ThemeError extends Error {
  /**
   * @param {string} code ERR_THEME_* stable code
   * @param {string} message human-readable message (Chinese, user-facing)
   * @param {object} [details] optional structured fields
   */
  constructor(code, message, details = {}) {
    super(message);
    this.name = "ThemeError";
    this.code = code;
    Object.assign(this, details);
  }
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const v of Object.values(value)) deepFreeze(v);
  return Object.freeze(value);
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 8);
}

/** Replace path-hostile characters so an id can be a file name on every OS. */
function sanitizeId(raw, fallback) {
  let id = typeof raw === "string" ? raw.trim() : "";
  id = id.replace(/[^A-Za-z0-9._\-\u4e00-\u9fff]+/g, "-").replace(/^[.\-]+|[.\-]+$/g, "");
  id = id.slice(0, 120);
  if (!id || id === "." || id === "..") id = fallback;
  if (id.startsWith(BUILTIN_THEME_PREFIX)) id = `user-${id.slice(BUILTIN_THEME_PREFIX.length)}`;
  if (id.startsWith("builtin-")) id = `user-${id.slice("builtin-".length)}`;
  return id;
}

/** New unique user id (also used when an import has no usable id). */
function generatedUserId(name = "") {
  const base = sanitizeId(name, "theme");
  return `user-${Date.now().toString(36)}-${base.slice(0, 40)}-${randomSuffix()}`;
}

/** Built-in theme snapshots (default + 10 palettes), deep-frozen and read-only. */
function buildBuiltinThemes() {
  const themes = [
    {
      version: THEME_FILE_VERSION,
      id: `${BUILTIN_THEME_PREFIX}default`,
      name: "默认主题",
      description: "官方默认主题（咨询蓝配色 + 默认文字/表格样式）",
      builtin: true,
      colors: clone(DEFAULT_THEME.colors),
      textStyles: clone(DEFAULT_THEME.textStyles),
      tableStyles: clone(DEFAULT_THEME.tableStyles),
    },
  ];
  for (const [key, palette] of Object.entries(THEME_PALETTES)) {
    themes.push({
      version: THEME_FILE_VERSION,
      id: `${BUILTIN_THEME_PREFIX}${key}`,
      name: palette.name,
      description: `内置配色 ${key}`,
      builtin: true,
      colors: clone(palette.colors),
      textStyles: clone(DEFAULT_THEME.textStyles),
      tableStyles: clone(DEFAULT_THEME.tableStyles),
    });
  }
  return deepFreeze(themes);
}

/** Immutable built-in theme snapshots, in display order (default first, then palettes). */
export const BUILTIN_THEMES = buildBuiltinThemes();

/** @param {string} id @returns {boolean} */
export function isBuiltinThemeId(id) {
  return typeof id === "string" && id.startsWith(BUILTIN_THEME_PREFIX);
}

/** @returns {Array<object>} cloned built-in snapshots (safe to mutate). */
export function listBuiltinThemes() {
  return clone(BUILTIN_THEMES);
}

/**
 * Validate + normalize a ThemeFile.
 *
 * Lenient-by-design normalization: unknown fields are dropped, invalid color
 * entries are skipped, missing textStyles/tableStyles fall back to the default
 * theme, and a missing/unsafe id is generated. A theme with no usable colors at
 * all is invalid (ERR_THEME_INVALID), as is an unsupported version.
 *
 * @param {object|string} input ThemeFile object or a JSON string
 * @param {object} [options]
 * @param {boolean} [options.forImport] import semantics: force a non-builtin id
 * @returns {object} normalized ThemeFile (new object)
 */
export function normalizeThemeFile(input, { forImport = false } = {}) {
  let raw = input;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch (err) {
      throw new ThemeError("ERR_THEME_INVALID", `主题 JSON 解析失败: ${err.message}`);
    }
  }
  if (!isPlainObject(raw)) {
    throw new ThemeError("ERR_THEME_INVALID", "主题必须是 JSON 对象");
  }
  const version = raw.version == null ? THEME_FILE_VERSION : raw.version;
  if (version !== THEME_FILE_VERSION) {
    throw new ThemeError("ERR_THEME_INVALID", `不支持的主题版本 ${String(version)}（仅支持 ${THEME_FILE_VERSION}）`, { version });
  }
  if (!isPlainObject(raw.colors)) {
    throw new ThemeError("ERR_THEME_INVALID", "主题缺少 colors 对象");
  }
  const colors = {};
  for (const [key, value] of Object.entries(raw.colors)) {
    if (!TOKEN_KEY_RE.test(key)) continue;
    if (typeof value !== "string" || !HEX_RE.test(value)) continue;
    colors[key] = value;
  }
  if (!Object.keys(colors).length) {
    throw new ThemeError("ERR_THEME_INVALID", "主题 colors 中没有合法的 #RRGGBB/#RRGGBBAA 颜色");
  }
  let textStyles = isPlainObject(raw.textStyles) ? clone(raw.textStyles) : clone(DEFAULT_THEME.textStyles);
  let tableStyles = isPlainObject(raw.tableStyles) ? clone(raw.tableStyles) : clone(DEFAULT_THEME.tableStyles);
  // Drop non-object style entries (never partially normalize the style payload).
  textStyles = Object.fromEntries(Object.entries(textStyles).filter(([, v]) => isPlainObject(v)));
  tableStyles = Object.fromEntries(Object.entries(tableStyles).filter(([, v]) => isPlainObject(v)));

  const hadBuiltinFlag = raw.builtin === true;
  const rawId = typeof raw.id === "string" ? raw.id.trim() : "";
  const id = forImport || hadBuiltinFlag || isBuiltinThemeId(rawId)
    ? sanitizeId(rawId.replace(/^builtin:/i, ""), generatedUserId(raw.name))
    : sanitizeId(rawId, generatedUserId(raw.name));
  const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : id;
  const out = { version: THEME_FILE_VERSION, id, name };
  if (typeof raw.description === "string" && raw.description.trim()) out.description = raw.description.trim();
  out.builtin = false;
  out.colors = colors;
  out.textStyles = textStyles;
  out.tableStyles = tableStyles;
  return out;
}

/**
 * Create a ThemeStore over an injected storage adapter (factory; no IO here).
 *
 * Adapter contract:
 *   listRaw(): Promise<ThemeFile[]>          parsed user themes (invalid files may be skipped)
 *   readRaw(id): Promise<ThemeFile|null>     one parsed user theme
 *   writeRaw(theme): Promise<void>           atomic write of a normalized user theme
 *   removeRaw(id): Promise<boolean>          true when a file was removed
 *
 * @param {{listRaw:Function,readRaw:Function,writeRaw:Function,removeRaw:Function}} adapter
 * @returns {{list:Function,read:Function,save:Function,remove:Function,import:Function,export:Function}}
 */
export function createThemeStore(adapter) {
  if (!adapter || typeof adapter.listRaw !== "function" || typeof adapter.readRaw !== "function"
    || typeof adapter.writeRaw !== "function" || typeof adapter.removeRaw !== "function") {
    throw new TypeError("createThemeStore 需要 {listRaw,readRaw,writeRaw,removeRaw} 适配器");
  }

  async function userThemes() {
    let raw;
    try {
      raw = await adapter.listRaw();
    } catch {
      return [];
    }
    const out = [];
    for (const item of raw || []) {
      try {
        out.push(normalizeThemeFile(item));
      } catch {
        /* invalid stored theme: skip it instead of breaking the whole library */
      }
    }
    return out;
  }

  async function list() {
    const users = await userThemes();
    return [...listBuiltinThemes(), ...users];
  }

  async function read(id) {
    if (typeof id !== "string" || !id) return null;
    if (isBuiltinThemeId(id)) {
      const hit = BUILTIN_THEMES.find((t) => t.id === id);
      return hit ? clone(hit) : null;
    }
    let raw;
    try {
      raw = await adapter.readRaw(id);
    } catch {
      return null;
    }
    if (!raw) return null;
    try {
      return normalizeThemeFile(raw);
    } catch {
      return null;
    }
  }

  async function save(theme) {
    const rawId = typeof theme?.id === "string" ? theme.id.trim() : "";
    if (theme?.builtin === true || isBuiltinThemeId(rawId)) {
      throw new ThemeError("ERR_THEME_BUILTIN_READONLY", `内置主题 ${rawId || theme?.name || ""} 只读，不能覆盖`, { id: rawId });
    }
    const normalized = normalizeThemeFile(theme);
    await adapter.writeRaw(normalized);
    return clone(normalized);
  }

  async function remove(id) {
    if (typeof id !== "string" || !id) {
      throw new ThemeError("ERR_THEME_ID", "缺少主题 id");
    }
    if (isBuiltinThemeId(id) || BUILTIN_THEMES.some((t) => t.id === id)) {
      throw new ThemeError("ERR_THEME_BUILTIN_READONLY", `内置主题 ${id} 只读，不能删除`, { id });
    }
    const removed = await adapter.removeRaw(id);
    if (!removed) throw new ThemeError("ERR_THEME_NOT_FOUND", `主题不存在: ${id}`, { id });
  }

  async function importTheme(json) {
    const candidate = normalizeThemeFile(json, { forImport: true });
    const taken = new Set((await list()).map((t) => t.id));
    let id = candidate.id;
    let n = 2;
    while (taken.has(id)) {
      id = `${candidate.id}-${n}`;
      n += 1;
    }
    candidate.id = id;
    await adapter.writeRaw(candidate);
    return clone(candidate);
  }

  async function exportTheme(id) {
    const theme = await read(id);
    if (!theme) throw new ThemeError("ERR_THEME_NOT_FOUND", `主题不存在: ${id}`, { id });
    return `${JSON.stringify(theme, null, 2)}\n`;
  }

  return { list, read, save, remove, import: importTheme, export: exportTheme };
}

// Deck reference scanning

/**
 * Walk the deck and collect theme references:
 *   - color tokens: `$key` in fields whose key matches /color|fill/i
 *   - style references: `$key` in fields named `style` / `textStyle`
 * Page backgrounds and element subtrees (including arrays such as table rows and
 * chart series) are scanned; unknown `extra` payloads are ignored, matching
 * validate.js.
 * @param {object|Array} deckOrPages deck object ({pages}) or a page array
 * @returns {{colors:Set<string>, textStyles:Set<string>, tableStyles:Set<string>}}
 */
export function collectThemeReferences(deckOrPages) {
  const pages = Array.isArray(deckOrPages) ? deckOrPages : deckOrPages?.pages || [];
  const colors = new Set();
  const textStyles = new Set();
  const tableStyles = new Set();
  const visitValue = (key, value) => {
    if (typeof value !== "string" || !value.startsWith("$") || value.length < 2) return;
    const token = value.slice(1);
    if (STYLE_REF_KEY_RE.test(key)) textStyles.add(token);
    else if (COLOR_REF_KEY_RE.test(key)) colors.add(token);
  };
  const walk = (obj) => {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) {
      for (const item of obj) if (item && typeof item === "object") walk(item);
      return;
    }
    for (const [key, value] of Object.entries(obj)) {
      if (key === "extra") continue;
      if (typeof value === "string") visitValue(key, value);
      else if (value && typeof value === "object") walk(value);
    }
  };
  for (const page of pages) {
    if (!page || typeof page !== "object") continue;
    if (page.background) walk(page.background);
    for (const el of page.elements || []) walk(el);
  }
  return { colors, textStyles, tableStyles };
}

/** All `$color` references inside a style block (used to keep style-internal refs resolving). */
function collectStyleColorRefs(styles, out = new Set()) {
  if (!styles || typeof styles !== "object") return out;
  for (const [key, value] of Object.entries(styles)) {
    if (typeof value === "string") {
      if (value.startsWith("$") && value.length > 1 && COLOR_REF_KEY_RE.test(key)) out.add(value.slice(1));
    } else if (value && typeof value === "object") {
      collectStyleColorRefs(value, out);
    }
  }
  return out;
}

/**
 * Count `$token` color references in a deck (0 when unused). Used by the custom
 * color delete guard: a referenced token must be warned/blocked.
 * @param {object} deck
 * @param {string} token token key, with or without a leading `$`
 * @returns {number}
 */
export function colorTokenUsage(deck, token) {
  const key = String(token || "").replace(/^\$/, "");
  if (!key) return 0;
  const pages = Array.isArray(deck) ? deck : deck?.pages || [];
  let count = 0;
  const walk = (obj) => {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) {
      for (const item of obj) if (item && typeof item === "object") walk(item);
      return;
    }
    for (const [k, value] of Object.entries(obj)) {
      if (k === "extra") continue;
      if (typeof value === "string") {
        if (value === `$${key}` && COLOR_REF_KEY_RE.test(k)) count += 1;
      } else if (value && typeof value === "object") walk(value);
    }
  };
  for (const page of pages) {
    if (!page || typeof page !== "object") continue;
    if (page.background) walk(page.background);
    for (const el of page.elements || []) walk(el);
  }
  return count;
}

/**
 * List every color token of a theme for the color pickers: standard keys in
 * canonical order, then custom tokens in insertion order.
 * @param {object} theme
 * @returns {Array<{key:string,value:string,standard:boolean}>}
 */
export function listColorTokens(theme) {
  const colors = theme?.colors && typeof theme.colors === "object" ? theme.colors : {};
  const out = [];
  const seen = new Set();
  for (const key of STANDARD_COLOR_KEYS) {
    if (colors[key] != null) {
      out.push({ key, value: colors[key], standard: true });
      seen.add(key);
    }
  }
  for (const [key, value] of Object.entries(colors)) {
    if (seen.has(key)) continue;
    out.push({ key, value, standard: false });
  }
  return out;
}

/**
 * Add or edit a custom color token. Pure: returns a new theme object.
 * @param {object} theme
 * @param {string} key
 * @param {string} value #RRGGBB / #RRGGBBAA
 * @returns {object}
 */
export function setColorToken(theme, key, value) {
  if (!TOKEN_KEY_RE.test(String(key || ""))) {
    throw new ThemeError("ERR_THEME_INVALID", `颜色令牌名不合法: ${key}（字母开头，仅字母/数字/_/-）`);
  }
  if (typeof value !== "string" || !HEX_RE.test(value)) {
    throw new ThemeError("ERR_THEME_INVALID", `颜色值不合法: ${value}（需 #RRGGBB 或 #RRGGBBAA）`);
  }
  const out = clone(theme || {});
  out.colors = { ...(out.colors || {}), [key]: value };
  return out;
}

/**
 * Remove a color token. Referenced tokens are blocked: the caller warns or
 * forces after explicit confirmation. Pure: returns a report + new theme.
 * @param {object} theme
 * @param {string} key
 * @param {{deck?: object}} [options]
 * @returns {{blocked:boolean,usage:number,theme:object}}
 */
export function removeColorToken(theme, key, { deck = null } = {}) {
  const usage = deck ? colorTokenUsage(deck, key) : 0;
  const out = clone(theme || {});
  if (usage > 0) return { blocked: true, usage, theme: out };
  if (out.colors && Object.prototype.hasOwnProperty.call(out.colors, key)) delete out.colors[key];
  return { blocked: false, usage: 0, theme: out };
}

/**
 * Apply a theme snapshot to the current deck theme.
 *
 * colors/textStyles/tableStyles are replaced by the theme snapshot; every token/style
 * the deck still references but the new theme lacks is copied from the old theme (and
 * reported in `preserved`); unreferenced old entries are dropped; no deck -> a pure
 * replacement.
 * Color tokens referenced by the resulting style blocks are also kept when the
 * old theme provides them (a style must never dangle after switching themes).
 *
 * @param {object} currentTheme old deck theme ({colors,textStyles,tableStyles})
 * @param {object|string} themeFile ThemeFile / built-in snapshot / JSON string
 * @param {{deck?: object}} [options]
 * @returns {{theme:{colors:object,textStyles:object,tableStyles:object}, preserved:{colors:string[],textStyles:string[],tableStyles:string[]}}}
 */
export function applyTheme(currentTheme, themeFile, { deck = null } = {}) {
  const next = normalizeThemeFile(themeFile);
  const old = {
    colors: isPlainObject(currentTheme?.colors) ? clone(currentTheme.colors) : {},
    textStyles: isPlainObject(currentTheme?.textStyles) ? clone(currentTheme.textStyles) : {},
    tableStyles: isPlainObject(currentTheme?.tableStyles) ? clone(currentTheme.tableStyles) : {},
  };
  const colors = clone(next.colors);
  const textStyles = clone(next.textStyles);
  const tableStyles = clone(next.tableStyles);
  const preserved = { colors: [], textStyles: [], tableStyles: [] };
  const refs = deck ? collectThemeReferences(deck) : { colors: new Set(), textStyles: new Set(), tableStyles: new Set() };

  for (const token of refs.colors) {
    if (colors[token] === undefined && old.colors[token] !== undefined) {
      colors[token] = old.colors[token];
      preserved.colors.push(token);
    }
  }
  for (const token of refs.textStyles) {
    if (textStyles[token] !== undefined || tableStyles[token] !== undefined) continue;
    if (old.textStyles[token] !== undefined) {
      textStyles[token] = clone(old.textStyles[token]);
      preserved.textStyles.push(token);
    }
    if (old.tableStyles[token] !== undefined) {
      tableStyles[token] = clone(old.tableStyles[token]);
      preserved.tableStyles.push(token);
    }
  }
  // Keep the `$color` references inside the resulting style blocks resolvable.
  for (const token of collectStyleColorRefs({ textStyles, tableStyles })) {
    if (colors[token] !== undefined || old.colors[token] === undefined) continue;
    if (preserved.colors.includes(token)) continue;
    colors[token] = old.colors[token];
    preserved.colors.push(token);
  }
  return { theme: { colors, textStyles, tableStyles }, preserved };
}

/** Public id check helper (user theme file names); returns true for safe ids. */
export function isUserThemeId(id) {
  return typeof id === "string" && USER_ID_RE.test(id) && !id.includes("..") && !isBuiltinThemeId(id);
}
