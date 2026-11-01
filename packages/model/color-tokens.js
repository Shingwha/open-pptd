// packages/model/color-tokens.js — 颜色令牌工具（纯函数，浏览器 + Node 共用）。
// 3.2 删除主题库后保留的最小核心：标准令牌顺序、主题颜色列举、写入/删除与引用统计。
// 只操作 theme.colors；textStyles / tableStyles 一律原样保留。无 node:* / DOM 依赖。

/** 编辑器颜色列表使用的标准令牌顺序（16 个；accent1/2 在图表中固定映射 primary/accent）。 */
export const STANDARD_COLOR_KEYS = Object.freeze([
  "primary", "accent", "bg", "text", "muted", "line", "success", "warning", "danger",
  "primarySoft", "primaryTint", "primaryDeep",
  "accent3", "accent4", "accent5", "accent6",
]);

const HEX_RE = /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const TOKEN_KEY_RE = /^[A-Za-z][A-Za-z0-9_-]*$/;
const COLOR_REF_KEY_RE = /color|fill/i;

/** 带错误码的主题错误（颜色令牌校验失败统一使用 ERR_THEME_INVALID）。 */
export class ThemeError extends Error {
  /**
   * @param {string} code 稳定的错误码（ERR_THEME_*）
   * @param {string} message 用户可读的中文信息
   * @param {object} [details] 可选的结构化字段
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

/**
 * 统计 deck 中某个颜色令牌的 `$token` 引用数（未引用为 0）。
 * 扫描页面背景与元素子树（含表格行、图表系列等数组）；`extra` 负载忽略，与 validate.js 一致。
 * @param {object} deck
 * @param {string} token 令牌名，可带或不带前导 `$`
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
 * 列举主题的全部颜色令牌：标准 key 按固定顺序在前，自定义 key 按插入顺序在后。
 * @param {object} theme 标准 theme（{colors, textStyles, tableStyles}，可只传 {colors}）
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
 * 新增或修改颜色令牌。纯函数：返回新的 theme 对象，textStyles / tableStyles 原样保留。
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
 * 删除颜色令牌。仍被 deck 引用时阻止删除（调用方提示或要求显式确认）。
 * 纯函数：返回报告与新 theme；被阻止时 theme 保持不变。
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
