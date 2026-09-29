// ============================================================================
// model/index.js — packages/model package barrel (contract entry 4, open-pptd/model)
// ----------------------------------------------------------------------------
// Pure re-export, zero logic: collapses 300+ deep paths into a stable entry point
// (see docs/embedding.md). The export surface follows
// docs/specs/ref/integration-plan.md appendix D.1, verified one by one against the
// real export names of each source file before being written down (PRESET_SHAPES
// comes from preset-geometry.data.js, ELEMENT_TYPES from style-spec.js — neither
// lives in model.js, D.1 lists names only, not files).
//
// Browser + Node: neither this file nor its transitive closure may contain node:* /
// fs / window. / document. (the Node branches of the font and icon registries use
// options.fs dependency injection, see the four existing dep-graph rules).
// ============================================================================

// ---- Parse and serialize (pptd-io.js) ----
export { parseDeck, serializeDeck } from "./pptd-io.js";

// ---- Data model (model.js) ----
export {
  createDeck,
  createPage,
  nextElementId,
  syncElementId,
  deckSize,
  PAGE_WIDTH,
  PAGE_HEIGHT,
  PAGE_TYPES,
  SUPPORTED_SHAPES,
  SHOT_READY_TITLE,
  SHOT_ERROR_TITLE,
} from "./model.js";

// ---- Element type registry (registry.js / style-spec.js) ----
export { registerType, getType, allTypes } from "./registry.js";
export { ELEMENT_TYPES } from "./style-spec.js";

// ---- Theme and colors (theme.js; DEFAULT_THEME/THEME_PALETTES are re-exported by theme.js) ----
export {
  resolveTheme,
  resolveColor,
  colorOr,
  resolveFont,
  normalizeTheme,
  resolveTableStyle,
  themeChartPalette,
  DEFAULT_THEME,
  DEFAULT_FONT,
  THEME_PALETTES,
  mergePaletteColors,
} from "./theme.js";

// ---- Validation (validate.js) ----
export { validateDeck, registerRule } from "./validate.js";

// ---- Traversal (walk.js) ----
export { walkElements, collectImageSrcs } from "./walk.js";

// ---- Preset shapes (preset-geometry.js / preset-geometry.data.js) ----
export { shapePaths, shapeMenuIcon } from "./preset-geometry.js";
export { PRESET_SHAPES } from "./preset-geometry.data.js";

// ---- SVG paths (svg-path.js: shared lexer + arity table for the renderer scaler and writer custGeom) ----
export { parseSvgPath, scaleSvgPath } from "./svg-path.js";

// ---- Table model (table.js: grid / merge & split / layout estimate / validation) ----
export {
  tableGrid,
  tryMerge,
  trySplit,
  normalizeCells,
  estimateTableLayout,
  validateDims,
} from "./table.js";

// ---- Font parsing (font.js: CSS font shorthand and font resource manifest) ----
export { parseFontInfo, parseFontResources } from "./font.js";

// ---- Vendored third party (versioned with the code, usable in browser and Node) ----
export * as yaml from "./vendor/js-yaml.mjs";

// ---- Chart namespace (all chart.js exports + chart/option builders) ----
// chart.js only re-exports metadata/resolve/layout helpers; buildChartOption lives in
// chart/option/index.js. The two are merged into a single chart namespace (D.1 requires
// chart to contain buildChartOption).
import * as chartCore from "./chart.js";
import * as chartOption from "./chart/option/index.js";
export const chart = { ...chartCore, ...chartOption };

// ---- Icon namespace (all public exports of icon-fa.js) ----
export * as icons from "./icon-fa.js";

// ---- Font registry namespace (all public exports of font-registry.js) ----
export * as fonts from "./font-registry.js";

// ---- Byte utility namespace (all public exports of bytes.js) ----
export * as bytes from "./bytes.js";

// ---- Flat re-exports of high-frequency names (coexist with the namespaces above; editor consumption side, avoids the ns. prefix) ----
export {
  CHART_META,
  CHART_TYPE_ORDER,
  DATA_LABEL_CONTENTS,
  NUMBER_FORMAT_CODES,
  colLetter,
  remapEncode,
  validateChartSeries,
} from "./chart.js";
export { loadIconRegistry, resolveIconName, fetchIconSvg, normalizeIconSvg } from "./icon-fa.js";
export { loadFontRegistry, findFont, fontFileUrl, fetchFontBytes } from "./font-registry.js";
export { bytesToBase64, base64ToBytes } from "./bytes.js";
