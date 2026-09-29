// ============================================================================
// model/chart/title-legend.js — effective title/legend config (string | Config -> single form)
// ----------------------------------------------------------------------------
// Chart titles and axis titles share resolveTitleLike; legend on/off, position and font
// size share resolveLegend (single source for the official legendOffTypes default table;
// default position bottom — previously the writer's classic and chartex fallbacks
// disagreed: b vs t). A leaf module depending only on meta.
// ============================================================================

import { CHART_DEFAULTS } from "./meta.js";

/** Title-like config (official string | TitleConfig) -> effective form. */
export function resolveTitleLike(cfg, { fallbackFontFamily = null, defaultSize = CHART_DEFAULTS.titleSize } = {}) {
  const c = cfg && typeof cfg === "object" ? cfg : null;
  return {
    text: typeof cfg === "string" ? cfg : c?.text || "",
    size: c?.fontSize != null ? c.fontSize : defaultSize,
    color: c?.color || null,
    fontFamily: c?.fontFamily || fallbackFontFamily || null,
  };
}

/**
 * Effective legend config (official LegendConfig): legend:false turns it off globally;
 * when unset it follows the legendOffTypes default table (off by default only when every
 * type matches); position defaults to bottom.
 * ooxmlPos = projection to the OOXML legendPos enum (t/b/l/r); the preview projection
 * lives in option/shared legendState.
 */
export function resolveLegend(el, types) {
  const cfg = el.legend && typeof el.legend === "object" ? el.legend : null;
  const defaultOff = el.legend === undefined && [...types].every((t) => CHART_DEFAULTS.legendOffTypes.includes(t));
  const pos = cfg?.position || "bottom";
  return {
    on: el.legend !== false && !defaultOff,
    pos,
    ooxmlPos: { top: "t", bottom: "b", left: "l", right: "r" }[pos] || "b",
    size: cfg?.fontSize != null ? cfg.fontSize : CHART_DEFAULTS.legendSize,
    color: cfg?.color || null,
    fontFamily: cfg?.fontFamily || null,
    hasStyle: cfg != null && (cfg.fontSize != null || cfg.color != null || cfg.fontFamily != null),
    cfg,
  };
}
