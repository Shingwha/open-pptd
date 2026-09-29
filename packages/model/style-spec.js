// ============================================================================
// model/style-spec.js — element style spec (single source of truth for renderer and writer)
// ----------------------------------------------------------------------------
// The same DSL spec is defined once here; each consumer only makes a thin
// "spec -> target format" projection:
//   - packages/renderer -> CSS / SVG attributes
//   - packages/writer   -> OOXML elements
// No literal mapping tables may be written again on the consumer side
// (historically dash/fill/border/align each had 4~8 copies).
// ============================================================================

// ---- Element types (canonical list; registry.js registration keys, validate.js known types) ----
export const ELEMENT_TYPES = ["text", "shape", "line", "image", "icon", "table", "chart"];

// ---- Dash styles (Border.style / LineStyle, references/pptd.md) ----
// One definition, three projections: css = SVG stroke-dasharray; cssBorder = CSS
// border-style / ECharts lineStyle.type; ooxml = a:prstDash val.
export const DASH_STYLES = {
  dash: { css: "6 4", cssBorder: "dashed", ooxml: "dash" },
  dot: { css: "2 3", cssBorder: "dotted", ooxml: "dot" },
};

/** Border.style -> projection object; solid/unknown -> null. */
export function dashSpec(style) {
  return DASH_STYLES[style] || null;
}

// ---- Arrow types (Line.arrow, references/pptd.md) ----
// One table, two projections: ooxml = a:headEnd/tailEnd@type value; renderer draws the SVG as the same-named shape.
export const ARROW_TYPES = {
  arrow: "triangle",
  stealth: "stealth",
  diamond: "diamond",
  oval: "oval",
};

/** Arrow type -> OOXML headEnd/tailEnd type value; unknown falls back to triangle. */
export function ooxmlArrow(type) {
  return ARROW_TYPES[type] || "triangle";
}

// ---- Fill (FillSpec: string color / {type:solid} / {type:gradient} / {type:image}) ----
/**
 * FillSpec normalization -> discriminated union:
 *   { type: "solid", color } | { type: "gradient", ... } | { type: "image", ... } | null
 * Tolerates two legacy forms: a bare color string, and a { color } object without
 * type (treated as solid). Gradient/image objects pass through untouched (many
 * fields, consumers pick what they need); invalid input returns null.
 */
export function normalizeFill(fill) {
  if (!fill) return null;
  if (typeof fill === "string") return { type: "solid", color: fill };
  if (typeof fill !== "object") return null;
  if (fill.type === "solid" || fill.type === "gradient" || fill.type === "image") return fill;
  if (fill.type == null && fill.color != null) return { type: "solid", color: fill.color }; // legacy {color} form
  return null;
}

// ---- Border (BorderSpec -> four sides) ----
/** Default cell border (when nothing in the whole inheritance chain is set): 1px black solid on all four sides. */
export const DEFAULT_CELL_BORDER = { style: "solid", width: 1, color: "#000000" };

/**
 * BorderSpec -> four sides { top, right, bottom, left }:
 *   undefined (unset along the whole chain) -> default 1px black on all sides;
 *   null -> no sides at all (explicit clear);
 *   two-element array [vertical, horizontal]; four-element array [top, right,
 *   bottom, left] (clockwise); a single Border -> same on all four sides.
 * A side value is a Border object or null (that side has no border).
 */
export function borderSides(spec) {
  if (spec === undefined) {
    return { top: DEFAULT_CELL_BORDER, right: DEFAULT_CELL_BORDER, bottom: DEFAULT_CELL_BORDER, left: DEFAULT_CELL_BORDER };
  }
  if (spec === null) return { top: null, right: null, bottom: null, left: null };
  if (Array.isArray(spec)) {
    if (spec.length === 2) return { top: spec[0], bottom: spec[0], left: spec[1], right: spec[1] }; // [vertical, horizontal]
    if (spec.length === 4) return { top: spec[0], right: spec[1], bottom: spec[2], left: spec[3] }; // [top, right, bottom, left]
  }
  return { top: spec, right: spec, bottom: spec, left: spec };
}

// ---- Horizontal alignment (align[0], references/pptd.md §TextContent) ----
const H_ALIGN_CSS = { left: "left", center: "center", right: "right", justify: "justify", distributed: "justify" };

/** Horizontal alignment -> CSS text-align value; unknown -> null. distributed has no
 *  native CSS equivalent, so it maps to justify and the consumer must add
 *  text-align-last:justify (see cssTextAlignLast). */
export function cssTextAlign(align) {
  return H_ALIGN_CSS[align] || null;
}

/** distributed alignment also needs text-align-last:justify (otherwise the last line is not stretched). */
export function cssTextAlignLast(align) {
  return align === "distributed" ? "justify" : null;
}

// ---- Horizontal alignment / vertical anchor -> OOXML (single shared table for a:pPr@algn and a:bodyPr/tcPr@anchor) ----
const H_ALIGN_OOXML = { left: "l", center: "ctr", right: "r", justify: "just", distributed: "dist" };
const V_ANCHOR_OOXML = { top: "t", middle: "ctr", bottom: "b" };

/** Horizontal alignment -> a:pPr@algn value; unknown -> null. */
export function ooxmlTextAlign(align) {
  return H_ALIGN_OOXML[align] || null;
}

/** Vertical alignment -> anchor value; unknown -> null (the consumer decides its own default). */
export function ooxmlAnchor(align) {
  return V_ANCHOR_OOXML[align] || null;
}

// ---- List indent (ol/ul: text left edge = level-1 indent, bullet hangs inside the indent band) ----
// Preview padding-left and export marL/indent=-marL come from here (the two sides
// once used different, unequal values).
export const LIST_INDENT = 18; // pt/px

// ---- Shadow (ShadowSpec: { color?, blur?, offset?: [x, y] }, positive offset points down) ----
/** Shadow offset -> [dx, dy] (default [0, 0]); returns null when there is no shadow. */
export function shadowOffset(shadow) {
  if (!shadow) return null;
  const [dx = 0, dy = 0] = shadow.offset || [0, 0];
  return [dx, dy];
}

// Single-source defaults (the only default on both sides): black, no blur, zero
// offset. Three competing sets used to exist (preview box/drop with 0.3 alpha black
// + 6px blur, preview text with no default, export black + 0 blur), so the same
// shadow looked different in preview and export, and a preview text shadow without
// color produced invalid CSS that the browser then dropped entirely.
export const SHADOW_DEFAULTS = { color: "#000000", blur: 0, offset: [0, 0] };

/** Fill ShadowSpec defaults -> { dx, dy, blur, color }; returns null when there is no shadow. */
export function effectiveShadow(shadow) {
  const offset = shadowOffset(shadow);
  if (!offset) return null;
  return {
    dx: offset[0],
    dy: offset[1],
    blur: shadow.blur ?? SHADOW_DEFAULTS.blur,
    color: shadow.color || SHADOW_DEFAULTS.color,
  };
}
