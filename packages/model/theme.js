// ============================================================================
// theme.js — theme token system (strictly aligned with official PPTD Theme)
// ----------------------------------------------------------------------------
// Official structure (references/pptd.md §3 Theme):
//   Theme = { colors: Record<string, Color>, textStyles: Record<string, TextStyleConfig>,
//             tableStyles: Record<string, TableStyleConfig> }
// Principle: any style an element does not set explicitly is taken from the theme;
// locals only store overrides. The renderer (DOM) and the writer (OOXML) share this
// module: the renderer takes hex, the export maps to schemeClr.
//
// Non-official extensions (kept; official editors ignore them leniently):
//   - deck.fonts font resource table ({key: {family, url/file, subset}}) -> this editor's font embedding
//   - TextContent.style / Cell.textStyle / Table.style all reference by official "$key" string
// ============================================================================

import { DEFAULT_THEME, THEME_PALETTES } from "./theme-presets.js";
import { TABLE_FONT_SIZE } from "./table.js";
import { parseFontResources } from "./font.js";
export { DEFAULT_THEME, THEME_PALETTES } from "./theme-presets.js";

const HEX_RE = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/**
 * Normalize a theme: deep-merge over the default theme (official structure).
 * An official theme is always an object (references/pptd.md §Theme). Compatible with
 * legacy v1 string keys: a hit among the built-in presets (THEME_PALETTES, e.g. "tech")
 * takes its colors plus the default textStyles/tableStyles; an unknown key warns and
 * falls back to the default theme (no longer silent, so "theme: blue" cannot quietly
 * become the default palette).
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
 * Resolve a color: supports "$key" theme colors references, #RRGGBB and #RRGGBBAA.
 * Unknown theme key -> black plus a warning (lenient, never throws).
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
 * Apply a color preset: preset keys win, other custom color keys already on the deck
 * are kept. AI-generated decks often define $gold/$paper etc. in theme.colors and
 * pages reference them; replacing the whole set would turn every such reference into
 * an unknown color token falling back to black.
 * @param {object} currentColors existing colors (keys outside the preset are kept)
 * @param {object} presetColors  preset colors (its keys take precedence)
 * @returns {object} the composed new colors
 */
export function mergePaletteColors(currentColors, presetColors) {
  const out = { ...(presetColors || {}) };
  for (const [k, v] of Object.entries(currentColors || {})) {
    if (!(k in out)) out[k] = v;
  }
  return out;
}

/**
 * Resolve a font: string or {latin, ea} -> {latin, ea} (an unspecified side falls
 * back to the default "Microsoft YaHei").
 * The string form (e.g. "KaiTi") means one font for both Latin and CJK: latin+ea are
 * written to both slots — CJK characters go through the ea slot in OOXML, so writing
 * only latin makes CJK fall back to the default font.
 * A string first looks up the theme font resource table (resource key -> family).
 * The object form {latin, ea} is an explicit split (official FontFamily) and is kept as is.
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

/** Official default font (Style Priority default: fontFamily = "Microsoft YaHei", system-provided, declared but never embedded). */
export const DEFAULT_FONT = "Microsoft YaHei";

/**
 * Chart series color cycle (official §3.1 "Theme.colors theme color cycle"):
 * same semantics as the PPTX theme slots (writer/parts.js themeColorSlots) —
 * accent1/2 are fixed to primary/accent, accent3-6 use the same fallback chain.
 * Returns a 6-color hex array, consumed cyclically in series order.
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
  return vals.map((v) => resolveColor(theme, v) || v); // keep the raw value when resolution fails (lenient consumers)
}

/**
 * Attach the deck-level font declarations (extension field) to the theme: only the
 * font resource table (fontResources) is parsed. The v1 component slots
 * (fonts.title/body/… strings) are deprecated (the official equivalent is
 * theme.textStyles.<key>.fontFamily); legacy projects get a warning and the entries
 * are ignored.
 */
export function mergeFonts(theme, fonts) {
  theme.fontResources = parseFontResources(fonts);
  if (!fonts || typeof fonts !== "object") return theme;
  const v1Slots = ["latin", "ea", "title", "subtitle", "body", "caption", "quote", "table", "chart"];
  for (const key of v1Slots) {
    // Only a string value is a v1 leftover (a v1 slot holds a font-name string);
    // v2 resource declarations are objects and do not warn
    if (typeof fonts[key] === "string") {
      console.warn(`[theme] deck.fonts.${key} 组件槽已废弃（官方用 theme.textStyles.<key>.fontFamily），已忽略`);
    }
  }
  return theme;
}

/**
 * deck -> render theme (the combined entry of normalizeTheme + deck.fonts):
 * the single expression shared by editor load/undo snapshots and gallery loading.
 */
export function resolveTheme(deck) {
  return mergeFonts(normalizeTheme(deck?.theme), deck?.fonts);
}

/**
 * Resolve a text style: accepts a "$key" reference, a TextStyleConfig object or null.
 * Returns a style object "resolved to concrete values" (color keeps the theme
 * reference; the renderer and the writer each resolve it themselves).
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
// Table styles (official TableStyleConfig resolution and inheritance chain)
// ----------------------------------------------------------------------------

/**
 * Resolve a table style reference: accepts "$key" (theme.tableStyles), an inline
 * TableStyleConfig or null. Returns the raw TableStyleConfig (colors keep the $
 * reference); null/unknown key -> {} (consumers then use the official defaults).
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
 * Merge cell text styles (single source for the official inheritance chain; preview
 * cellFinal and export tcXml share this implementation):
 * Cell inline fields > Cell.textStyle reference > position class
 * (resolveTableCellStyle) > default.
 * lineHeightPx (fixed px) and lineHeight (multiplier) are returned as separate
 * fields with lineHeightPx taking precedence, and each side projects them itself
 * (CSS line-height / a:lnSpc). The merge logic used to be written twice, which
 * drifted easily.
 */
export function cellTextStyle(theme, ts, r, c, rowCount, colCount, cell) {
  const s = resolveTableCellStyle(ts, r, c, rowCount, colCount);
  const ref = resolveTextStyle(theme, cell?.textStyle);
  return {
    color: cell?.color ?? ref.color ?? s.color ?? "#000000",
    fontFamily: cell?.fontFamily ?? ref.fontFamily ?? s.fontFamily,
    fontSize: cell?.fontSize ?? ref.fontSize ?? s.fontSize ?? TABLE_FONT_SIZE,
    bold: !!(cell?.bold ?? ref.bold ?? s.bold),
    italic: !!(cell?.italic ?? ref.italic ?? s.italic),
    backgroundColor: cell?.backgroundColor ?? ref.backgroundColor ?? s.backgroundColor,
    lineHeightPx: cell?.lineHeightPx ?? ref.lineHeightPx ?? s.lineHeightPx ?? null,
    lineHeight: cell?.lineHeight ?? ref.lineHeight ?? s.lineHeight ?? 1,
    letterSpacing: cell?.letterSpacing ?? ref.letterSpacing ?? s.letterSpacing,
    marginTop: cell?.marginTop ?? ref.marginTop ?? s.marginTop,
  };
}

/**
 * Compute the final cell style (official inheritance chain, low -> high priority):
 *   cellStyle base -> bodyStyles cycle (data rows, by data-row index) -> position
 *   class (firstRow/lastRow/firstColumn/lastColumn, arbitrated by rowOverColumn,
 *   default true = rows win)
 * Returns the merged concrete CellStyle fields (colors keep the $ reference, the
 * consumer applies resolveColor). Cell inline fields (the C2 Cell object) have the
 * highest priority and are not part of this function.
 */
export function resolveTableCellStyle(ts, r, c, rowCount, colCount) {
  const merged = {};
  const apply = (style) => {
    if (!style || typeof style !== "object") return;
    for (const [k, v] of Object.entries(style)) {
      // Skip only undefined, keep explicit null (a top-level null BorderSpec means
      // "clear all four sides"; dropping null during the merge would make border fall
      // back to the default 1px black frame)
      if (v !== undefined) merged[k] = v;
    }
  };
  // 1. base (lowest priority, applied first)
  apply(ts.cellStyle);
  // 2. data-row zebra striping (excluding first/last row, cycling by data-row index r-1)
  const isFirstRow = r === 0;
  const isLastRow = r === rowCount - 1;
  if (!isFirstRow && !isLastRow) {
    const dataIdx = r - 1;
    const body = (ts.bodyStyles || [])[dataIdx % Math.max(1, (ts.bodyStyles || []).length)];
    apply(body);
  }
  // 3. position-class styles (row vs column conflict arbitrated by rowOverColumn, default true = rows win)
  const isFirstCol = c === 0;
  const isLastCol = c === colCount - 1;
  const rowStyle = isFirstRow ? ts.firstRowStyle : isLastRow ? ts.lastRowStyle : null;
  const colStyle = isFirstCol ? ts.firstColumnStyle : isLastCol ? ts.lastColumnStyle : null;
  if (rowStyle && colStyle) {
    const rowWins = ts.rowOverColumn !== false; // default true
    apply(rowWins ? rowStyle : colStyle);
  } else {
    apply(rowStyle);
    apply(colStyle);
  }
  return merged;
}
