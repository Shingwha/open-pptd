// ============================================================================
// style.js — text style inheritance chain (shared by renderer and writer, single implementation)
// ----------------------------------------------------------------------------
// Inheritance chain (PPTD spec): run inline > paragraph > content field > $style
// theme reference > default. Both the renderer and the exporter call
// computeBaseStyle + mergeRunStyle so preview == export.
// ============================================================================

import { resolveTextStyle } from "./theme.js";

export function pickDefined(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null) out[k] = v;
  }
  return out;
}

/**
 * Compute the baseline style of a text element = merge($style theme config,
 * direct content fields). Direct content fields win over the theme reference.
 *
 * Font rules:
 *  - explicit `style: "$title"` etc. -> use that token's font (component font)
 *  - plain elements with no style reference (explicit-field form) -> inherit the
 *    $body font (body component font, e.g. when the deck declares fonts.body),
 *    otherwise fall back to the default font — this keeps the component font
 *    effective on every page
 */
export function computeBaseStyle(theme, content) {
  const fromTheme = resolveTextStyle(theme, content?.style);
  if (!content?.style && !content?.fontFamily && theme.textStyles?.body?.fontFamily) {
    fromTheme.fontFamily = theme.textStyles.body.fontFamily;
  }
  const direct = {
    color: content?.color,
    fontSize: content?.fontSize,
    fontFamily: content?.fontFamily,
    bold: content?.bold,
    italic: content?.italic,
    backgroundColor: content?.backgroundColor,
    lineHeight: content?.lineHeight,
    lineHeightPx: content?.lineHeightPx,
    letterSpacing: content?.letterSpacing,
    marginTop: content?.marginTop,
    // Text decorations (official TextContent): gradient applies to the text itself, shadow is a text shadow
    gradient: content?.gradient,
    shadow: content?.shadow,
    // content.align = [horizontal, vertical]; horizontal alignment maps to textAlign (preview == export)
    textAlign: Array.isArray(content?.align) ? content.align[0] : undefined,
  };
  return { ...fromTheme, ...pickDefined(direct) };
}

/** Final run style = baseline + paragraph style + run inline style (later overrides earlier); any layer may be omitted. */
export function mergeRunStyle(base, paraStyle, runStyle) {
  return { ...base, ...pickDefined(paraStyle ?? {}), ...pickDefined(runStyle ?? {}) };
}
