// ============================================================================
// theme.js — 主题令牌系统（第二版统一样式来源）
// ----------------------------------------------------------------------------
// 原则：任何元素未显式设置的样式，一律从主题取；局部只存"覆盖"。
// 渲染器（DOM）与 writer（OOXML）共享本模块：渲染取 hex，导出映射 schemeClr。
//
// 主题 = 语义色板 + 字体 + 文字样式 + 表格样式 + 图表样式。
// 图表系列色、表格表头/斑马纹都从语义色板派生 → 换主题全页联动。
// 主题数据（默认 + 预设）在 theme-presets.js，本模块只做解析/合并逻辑。
// ============================================================================

import { DEFAULT_THEME, THEME_PRESETS } from "./theme-presets.js";
export { DEFAULT_THEME, THEME_PRESETS } from "./theme-presets.js";


const HEX_RE = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/**
 * 深合并：用 input 覆盖 defaults（保留未提供项）。
 * input 为字符串时视为主题 key（THEME_PRESETS 键名），找不到则回退默认并告警。
 */
export function normalizeTheme(input) {
  const base = JSON.parse(JSON.stringify(DEFAULT_THEME));
  if (!input) return base;
  if (typeof input === "string") {
    const key = input;
    input = THEME_PRESETS[key] || null;
    if (!input) {
      console.warn(`[theme] 未知主题「${key}」，回退默认`);
      return base;
    }
  }
  return deepMerge(base, input);
}

function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    const sv = source[key];
    if (sv && typeof sv === "object" && !Array.isArray(sv)) {
      if (!target[key] || typeof target[key] !== "object" || Array.isArray(target[key])) {
        target[key] = {};
      }
      deepMerge(target[key], sv);
    } else {
      target[key] = sv;
    }
  }
  return target;
}

/**
 * 解析颜色：支持 "$key" 主题引用、#RRGGBB、#RRGGBBAA。
 * 未知主题键 → 黑色并告警（宽容，不崩溃）。
 */
/** 颜色向目标色混合：t=0 保持原色，t=1 纯目标色。 */
function mixColor(hex, target, t) {
  const m = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(m)) return hex;
  const n = parseInt(m, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const tr = (parseInt(target.slice(1, 3), 16) || 0), tg = (parseInt(target.slice(3, 5), 16) || 0), tb = (parseInt(target.slice(5, 7), 16) || 0);
  const mix = (c, tc) => Math.round(c + (tc - c) * t);
  return "#" + [mix(r, tr), mix(g, tg), mix(b, tb)].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
}

// 派生色令牌（基于主题色板动态计算，渲染与导出共用）
const DERIVED_TOKENS = {
  // primary 混 28% 黑：封面/结尾深底
  "$primary-deep": (c) => mixColor(c.primary, "#000000", 0.28),
  // primary 混 94% 白：浅色底（卡片/条）
  "$primary-soft": (c) => mixColor(c.primary, "#FFFFFF", 0.94),
  "$primary-tint": (c) => mixColor(c.primary, "#FFFFFF", 0.88),
};

// 令牌 + 两位 hex 透明度：$primary20 = primary @ 20/255 alpha
const TOKEN_ALPHA_RE = /^\$([a-zA-Z-]+)([0-9a-fA-F]{2})$/;

/**
 * 解析颜色：支持 "$key" 主题引用、#RRGGBB、#RRGGBBAA。
 * 匹配顺序：完整键名优先（如 $muted，避免被透明度变体拆成 $mut+ed 误匹配），
 * 键名不存在再尝试透明度变体（$primary20 → $primary @ 20/255）。
 * 未知主题键 → 黑色并告警（宽容，不崩溃）。
 */
export function resolveColor(theme, color) {
  if (color == null) return null;
  if (typeof color !== "string") return null;
  if (color.startsWith("$")) {
    if (DERIVED_TOKENS[color]) {
      const base = DERIVED_TOKENS[color](theme.colors);
      return base;
    }
    const key = color.slice(1);
    if (key === "series") {
      return theme.colors.series;
    }
    const value = theme.colors[key];
    if (value != null) return value;
    const alphaMatch = color.match(TOKEN_ALPHA_RE);
    if (alphaMatch) {
      const base = resolveColor(theme, `$${alphaMatch[1]}`);
      if (base && /^#[0-9a-fA-F]{6}$/.test(base)) return base + alphaMatch[2].toUpperCase();
    }
    console.warn(`[theme] unknown color token: ${color}`);
    return "#000000";
  }
  return HEX_RE.test(color) ? color : null;
}

/** 字体组件槽（7 键 + latin/ea 默认字体）。 */
export const FONT_SLOT_KEYS = ["latin", "ea", "title", "subtitle", "body", "caption", "quote", "table", "chart"];

/**
 * 字体资源表：deck.fonts 中除组件槽外的任意键 = 字体资源声明。
 * 组件槽字符串值 / 元素级 fontFamily 字符串先查资源表（key → family），命中取 family。
 * 带 file/url 的资源在导出时嵌入（writer/font.js collectFontSpecs）。
 */
export function parseFontResources(fonts) {
  const out = {};
  if (!fonts || typeof fonts !== "object") return out;
  const slots = new Set(FONT_SLOT_KEYS);
  for (const [key, v] of Object.entries(fonts)) {
    if (slots.has(key) || !v || typeof v !== "object") continue;
    const family = v.family || v.name;
    if (typeof family !== "string" || !family) continue;
    out[key] = {
      family,
      file: typeof v.file === "string" ? v.file : null,
      url: typeof v.url === "string" ? v.url : null,
      subset: !!v.subset,
    };
  }
  return out;
}

/** 解析字体：字符串或 {latin, ea} → {latin, ea}（未指定侧回退默认）。
 * 字符串形式（如 "KaiTi"）= 中西文统一用该字体：latin+ea 双槽同写——
 * OOXML 中文字符走 ea 槽，只写 latin 会导致中文回退默认字体。
 * 字符串先查主题字体资源表（资源 key → family）。
 * 对象形式 {latin, ea} 为显式分工（如 {latin: SimHei, ea: FangSong}），原样保留。 */
export function resolveFont(theme, font) {
  if (font && typeof font === "object") {
    return {
      latin: font.latin || theme.fonts.latin,
      ea: font.ea || theme.fonts.ea,
    };
  }
  if (typeof font === "string" && font) {
    const res = theme.fontResources?.[font];
    const name = res?.family || font;
    return { latin: name, ea: name };
  }
  return { latin: theme.fonts.latin, ea: theme.fonts.ea };
}

/**
 * 归一化 deck 级字体声明（manifest `fonts` 字段）→ 字符串字体名映射。
 *
 * 支持两层：
 *   - 默认字体：latin / ea（兜底，所有未指定组件使用）
 *   - 组件字体：title / subtitle / body / caption / quote（文字样式令牌）、
 *     table（表格）、chart（图表）——只覆盖对应组件，其余回退默认
 *
 * 扩展点（未来）：字体项可升级为对象 { name, source: "system" | "web" | "embedded",
 * url?, weight? } —— 网络字体加载（编辑器 HTML link/face）、PPT 嵌入字体（writer
 * 打包字体文件 + OOXML 声明）都只在上游扩展，渲染/writer 继续消费字符串名，签名不变。
 */
export function normalizeFonts(fonts) {
  if (!fonts) return null;
  if (typeof fonts === "string" && fonts) return { latin: fonts, ea: fonts };
  if (typeof fonts !== "object") return null;
  const resources = parseFontResources(fonts);
  const resolve = (v) => {
    if (typeof v === "string" && v) return resources[v]?.family || v; // 资源 key → family
    if (v && typeof v === "object") return v.family || v.name || null;
    return null;
  };
  const out = {};
  for (const key of FONT_SLOT_KEYS) {
    const v = resolve(fonts[key]);
    if (v) out[key] = v;
  }
  if (out.latin && !out.ea) out.ea = out.latin;
  return Object.keys(out).length ? out : null;
}

// 组件字体键 → 主题内目标位置（textStyles / tableStyles / chartStyles）
const FONT_SLOTS = {
  title: (t) => t.textStyles.title,
  subtitle: (t) => t.textStyles.subtitle,
  body: (t) => t.textStyles.body,
  caption: (t) => t.textStyles.caption,
  quote: (t) => t.textStyles.quote,
  table: (t) => t.tableStyles,
  chart: (t) => t.chartStyles,
};

/**
 * deck 级字体声明覆盖主题：latin/ea 设默认字体，组件键写入对应样式槽
 * （textStyles.$X.fontFamily / tableStyles.fontFamily / chartStyles.fontFamily）。
 * 无声明则保持主题默认（微软雅黑）。
 */
export function mergeFonts(theme, fonts) {
  theme.fontResources = parseFontResources(fonts);
  const f = normalizeFonts(fonts);
  if (!f) return theme;
  if (f.latin || f.ea) {
    theme.fonts = { latin: f.latin || theme.fonts.latin, ea: f.ea || theme.fonts.ea };
  }
  for (const [key, slot] of Object.entries(FONT_SLOTS)) {
    if (f[key]) slot(theme).fontFamily = f[key];
  }
  return theme;
}

/**
 * 解析文字样式：接受 "$title" 引用、TextStyleConfig 对象或 null。
 * 返回"已解析为具体值"的样式对象（color 已解析为 hex 或保留主题引用，
 * 供渲染器使用；writer 另行判断是否 schemeClr）。
 */
export function resolveTextStyle(theme, styleRef) {
  let config = {};
  if (typeof styleRef === "string" && styleRef.startsWith("$")) {
    const key = styleRef.slice(1);
    config = theme.textStyles[key] || {};
    if (!theme.textStyles[key]) console.warn(`[theme] unknown textStyle: ${styleRef}`);
  } else if (styleRef && typeof styleRef === "object") {
    config = styleRef;
  }
  return { ...config };
}

/** 主题系列色（图表）：显式 series 色板或 theme 默认。 */
export function resolveSeriesColors(theme) {
  const token = theme.chartStyles.seriesColors;
  if (Array.isArray(token)) return token;
  if (typeof token === "string" && token.startsWith("$")) {
    return theme.colors.series || [];
  }
  return theme.colors.series || [];
}

/** 颜色向白色混合：t=0 原色，t=1 纯白。 */
export function tintColor(hex, t) {
  const n = parseInt(hex.replace("#", ""), 16);
  if (Number.isNaN(n)) return hex;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const mix = (c) => Math.round(c + (255 - c) * t);
  return "#" + [mix(r), mix(g), mix(b)].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** 表格样式（解析后的具体值；边框/斑马纹默认派生自主题 primary，跟随主题）。 */
export function resolveTableStyle(theme) {
  const t = theme.tableStyles;
  const primary = resolveColor(theme, t.headerFill) || "#002E5D";
  return {
    headerFill: primary,
    headerColor: resolveColor(theme, t.headerColor),
    headerBold: !!t.headerBold,
    // 边框 = primary 浅色调（可见且与主题协调）；可用显式值覆盖
    zebraFill: t.zebraFill ? resolveColor(theme, t.zebraFill) : tintColor(primary, 0.93),
    borderColor: t.borderColor ? resolveColor(theme, t.borderColor) : tintColor(primary, 0.78),
    // 表格字体：组件级（deck fonts.table / 主题 tableStyles.fontFamily），缺省 = 主题默认字体
    fontFamily: t.fontFamily || null,
    cellPadding: t.cellPadding ?? 4,
  };
}
