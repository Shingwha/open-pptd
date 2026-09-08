// ============================================================================
// model/chart/title-legend.js — 标题/图例有效配置（string | Config → 单一形态）
// ----------------------------------------------------------------------------
// 图表标题与坐标轴标题共用 resolveTitleLike；图例开关/方位/字号共用
// resolveLegend（官方 legendOffTypes 默认表单源、缺省方位 bottom——此前
// writer classic/chartex 两端 fallback 不一致：b vs t）。叶子模块，仅依赖 meta。
// ============================================================================

import { CHART_DEFAULTS } from "./meta.js";

/** 标题类配置（官方 string | TitleConfig）→ 有效形态。 */
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
 * 图例有效配置（官方 LegendConfig）：legend:false 全局关；未配置按
 * legendOffTypes 默认表（全类型命中才默认关）；方位缺省 bottom。
 * ooxmlPos = OOXML legendPos 枚举投影（t/b/l/r），预览投影见 option/shared legendState。
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
