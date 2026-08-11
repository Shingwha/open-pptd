// ============================================================================
// theme.js — 主题令牌系统（严格对齐官方 PPTD Theme）
// ----------------------------------------------------------------------------
// 官方结构（references/pptd.md §3 Theme）：
//   Theme = { colors: Record<string, Color>, textStyles: Record<string, TextStyleConfig>,
//             tableStyles: Record<string, TableStyleConfig> }
// 原则：任何元素未显式设置的样式，一律从主题取；局部只存"覆盖"。
// 渲染器（DOM）与 writer（OOXML）共享本模块：渲染取 hex，导出映射 schemeClr。
//
// 非官方扩展（保留，官方编辑器宽容忽略）：
//   - deck.fonts 字体资源表（{key: {family, url/file, subset}}）→ 本编辑器字体嵌入
//   - TextContent.style / Cell.textStyle / Table.style 均按官方字符串 "$key" 引用
// ============================================================================

import { DEFAULT_THEME, THEME_PALETTES } from "./theme-presets.js";
export { DEFAULT_THEME, THEME_PALETTES } from "./theme-presets.js";

const HEX_RE = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/**
 * 归一化主题：深合并默认主题（官方结构）。
 * 官方 theme 永远是对象（references/pptd.md §Theme）。兼容 v1 遗留字符串键：
 * 命中内置预设（THEME_PALETTES，如 "tech"）→ 取其 colors + 默认 textStyles/tableStyles；
 * 未知键 → 告警并回退默认主题（不再静默，避免 "theme: blue" 悄悄变成默认色）。
 */
export function normalizeTheme(input) {
  const base = JSON.parse(JSON.stringify(DEFAULT_THEME));
  if (!input) return base;
  if (typeof input === "string") {
    const preset = THEME_PALETTES[input];
    if (preset) return { ...base, colors: { ...preset.colors } };
    console.warn(`[theme] 未知配色预设 "${input}"，已回退默认主题（可用: ${Object.keys(THEME_PALETTES).join(" / ")}）`);
    return base;
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
 * 解析颜色：支持 "$key" 主题 colors 引用、#RRGGBB、#RRGGBBAA。
 * 未知主题键 → 黑色并告警（宽容，不崩溃）。
 */
export function resolveColor(theme, color) {
  if (color == null) return null;
  if (typeof color !== "string") return null;
  if (color.startsWith("$")) {
    const key = color.slice(1);
    const value = theme.colors?.[key];
    if (value != null) return value;
    console.warn(`[theme] unknown color token: ${color}`);
    return "#000000";
  }
  return HEX_RE.test(color) ? color : null;
}

/**
 * 字体资源表：deck.fonts 的任意键 = 字体资源声明（{family, url/file, subset}）。
 * fontFamily 字符串先查资源表（key → family），命中取 family。
 * 带 file/url 的资源在导出时嵌入（writer/font.js collectFontSpecs）。
 */
export function parseFontResources(fonts) {
  const out = {};
  if (!fonts || typeof fonts !== "object") return out;
  for (const [key, v] of Object.entries(fonts)) {
    if (!v || typeof v !== "object") continue;
    const family = v.family || v.name;
    if (typeof family !== "string" || !family) continue;
    out[key] = {
      family,
      file: typeof v.file === "string" ? v.file : null,
      url: typeof v.url === "string" ? v.url : null,
      subset: v.subset == null ? null : !!v.subset, // null = 未显式指定（导出时取注册表建议）
    };
  }
  return out;
}

/**
 * 解析字体：字符串或 {latin, ea} → {latin, ea}（未指定侧回退默认 "Microsoft YaHei"）。
 * 字符串形式（如 "KaiTi"）= 中西文统一用该字体：latin+ea 双槽同写——
 * OOXML 中文字符走 ea 槽，只写 latin 会导致中文回退默认字体。
 * 字符串先查主题字体资源表（资源 key → family）。
 * 对象形式 {latin, ea} 为显式分工（官方 FontFamily），原样保留。
 */
export function resolveFont(theme, font) {
  if (font && typeof font === "object") {
    return {
      latin: font.latin || DEFAULT_FONT,
      ea: font.ea || DEFAULT_FONT,
    };
  }
  if (typeof font === "string" && font) {
    const res = theme.fontResources?.[font];
    const name = res?.family || font;
    return { latin: name, ea: name };
  }
  return { latin: DEFAULT_FONT, ea: DEFAULT_FONT };
}

/** 官方默认字体（Style Priority 默认值：fontFamily = "Microsoft YaHei"，系统自带、仅声明不嵌入）。 */
export const DEFAULT_FONT = "Microsoft YaHei";

/**
 * 图表系列色循环（官方 §3.1 "Theme.colors theme color cycle"）：
 * 与 PPTX 主题槽位（writer/parts.js themeColorSlots）同一语义——
 * accent1/2 固定 = primary/accent，accent3-6 走相同回退链。
 * 返回 6 色 hex 数组，按系列出现顺序循环取用。
 */
export function themeChartPalette(theme) {
  const c = theme?.colors || {};
  const get = (key, fb) => (c[key] != null ? c[key] : fb);
  const vals = [
    get("primary", DEFAULT_THEME.colors.primary),
    get("accent", DEFAULT_THEME.colors.accent),
    get("accent3", c.success || DEFAULT_THEME.colors.primary),
    get("accent4", c.warning || DEFAULT_THEME.colors.accent),
    get("accent5", c.danger || DEFAULT_THEME.colors.primary),
    get("accent6", c.primaryDeep || DEFAULT_THEME.colors.accent),
  ];
  return vals.map((v) => resolveColor(theme, v) || v); // 解析失败保留原值（消费端宽容）
}

/**
 * deck 级字体声明（扩展字段）挂到主题：只解析字体资源表（fontResources）。
 * v1 组件槽（fonts.title/body/… 字符串）已废弃（官方等价能力 = theme.textStyles
 * .<key>.fontFamily），遇旧项目警告并忽略。
 */
export function mergeFonts(theme, fonts) {
  theme.fontResources = parseFontResources(fonts);
  if (!fonts || typeof fonts !== "object") return theme;
  const v1Slots = ["latin", "ea", "title", "subtitle", "body", "caption", "quote", "table", "chart"];
  for (const key of v1Slots) {
    // 仅字符串值才是 v1 遗留（v1 槽 = 字体名字符串）；v2 资源声明是对象，不警告
    if (typeof fonts[key] === "string") {
      console.warn(`[theme] deck.fonts.${key} 组件槽已废弃（官方用 theme.textStyles.<key>.fontFamily），已忽略`);
    }
  }
  return theme;
}

/**
 * 解析文字样式：接受 "$key" 引用、TextStyleConfig 对象或 null。
 * 返回"已解析为具体值"的样式对象（color 保留主题引用，渲染器/writer 各自解析）。
 */
export function resolveTextStyle(theme, styleRef) {
  if (typeof styleRef === "string" && styleRef.startsWith("$")) {
    const key = styleRef.slice(1);
    if (!theme.textStyles?.[key]) console.warn(`[theme] unknown textStyle: ${styleRef}`);
    return { ...(theme.textStyles?.[key] || {}) };
  }
  if (styleRef && typeof styleRef === "object") {
    return { ...styleRef };
  }
  return {};
}

// ----------------------------------------------------------------------------
// 表格样式（官方 TableStyleConfig 解析与继承链）
// ----------------------------------------------------------------------------

/**
 * 解析表格样式引用：接受 "$key"（theme.tableStyles）、内联 TableStyleConfig 或 null。
 * 返回原始 TableStyleConfig（颜色保留 $ 引用）；null/未知 key → {}（消费端走官方默认值）。
 */
export function resolveTableStyle(theme, styleRef) {
  if (typeof styleRef === "string" && styleRef.startsWith("$")) {
    const key = styleRef.slice(1);
    if (!theme.tableStyles?.[key]) console.warn(`[theme] unknown tableStyle: ${styleRef}`);
    return theme.tableStyles?.[key] || {};
  }
  if (styleRef && typeof styleRef === "object") return styleRef;
  return {};
}

/**
 * 计算单元格最终样式（官方继承链，优先级低 → 高）：
 *   cellStyle 基底 → bodyStyles 循环（数据行，按数据行索引）→ 位置分类
 *   （firstRow/lastRow/firstColumn/lastColumn，rowOverColumn 仲裁，默认 true = 行优先）
 * 返回合并后的 CellStyle 具体字段（颜色保留 $ 引用，消费端 resolveColor）。
 * 单元格内联字段（C2 Cell 对象）优先级最高，本函数不涉及。
 */
export function resolveTableCellStyle(ts, r, c, rowCount, colCount) {
  const merged = {};
  const apply = (style) => {
    if (!style || typeof style !== "object") return;
    for (const [k, v] of Object.entries(style)) {
      // 只跳过 undefined，保留显式 null（BorderSpec 顶层 null = 四边清除语义，
      // 合并时若丢弃 null，border 会回落到默认 1px 黑边框）
      if (v !== undefined) merged[k] = v;
    }
  };
  // 1. 基底（最低优先级，先应用）
  apply(ts.cellStyle);
  // 2. 数据行斑马纹（排除首/末行，按数据行索引 r-1 循环）
  const isFirstRow = r === 0;
  const isLastRow = r === rowCount - 1;
  if (!isFirstRow && !isLastRow) {
    const dataIdx = r - 1;
    const body = (ts.bodyStyles || [])[dataIdx % Math.max(1, (ts.bodyStyles || []).length)];
    apply(body);
  }
  // 3. 位置分类样式（行 vs 列冲突时 rowOverColumn 仲裁，默认 true = 行优先）
  const isFirstCol = c === 0;
  const isLastCol = c === colCount - 1;
  const rowStyle = isFirstRow ? ts.firstRowStyle : isLastRow ? ts.lastRowStyle : null;
  const colStyle = isFirstCol ? ts.firstColumnStyle : isLastCol ? ts.lastColumnStyle : null;
  if (rowStyle && colStyle) {
    const rowWins = ts.rowOverColumn !== false; // 默认 true
    apply(rowWins ? rowStyle : colStyle);
  } else {
    apply(rowStyle);
    apply(colStyle);
  }
  return merged;
}
