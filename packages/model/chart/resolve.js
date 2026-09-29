// ============================================================================
// model/chart/resolve.js — chart normalization (defaults merge, encode lookup, default color, coexistence validation)
// ----------------------------------------------------------------------------
// C3 aligned with the official spec:
//   - seriesDefaults merge (§3.4): scalars override / objects shallow-merge / arrays
//     replace wholesale; type/encode are not included
//   - numeric channels parse strings into numbers (ChartData constraint); missing cells
//     fill with null
//   - color lookup (§5.2): defaults to themeChartPalette (theme accent1-6 color cycle)
//     cycling in series order; the three waterfall categories do not take part in the cycle
// ============================================================================

import { themeChartPalette } from "../theme.js";
import { CHART_META, SOLO_TYPES } from "./meta.js";
import { hexA } from "./colors.js";
import { isHorizontalChart } from "./axes.js";

// encode lookup fallback aliases (used by resolveChartSeries): a strict subset of
// SEMANTIC_KEYS — deliberately without date (so a column named date is not mistaken for
// an x channel fallback); the two have different semantics and must not be merged.
const ENCODE_ALIAS = { x: ["category"], category: ["x"], y: ["value"], value: ["y"] };

function colIndex(data, name) {
  return (data.cols || []).indexOf(name);
}

/** Numeric channel parse: string -> number; on failure -> null (lenient handling of the official NonNumericValueError). */
function toNum(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

/**
 * Validate the type coexistence constraints of a series array (§5.4). Returns an array
 * of warning strings (never throws; lenient consumption).
 */
export function validateChartSeries(el) {
  const warns = [];
  const series = el.series || [];
  if (series.length === 0) {
    warns.push("[chart] series 不能为空");
    return warns;
  }
  const types = new Set(series.map((s) => s.type));
  for (const s of series) {
    if (!CHART_META[s.type]) warns.push(`[chart] 不支持的图表类型 ${s.type}`);
  }
  if (types.size > 1) {
    for (const t of types) {
      if (!CHART_META[t]) continue;
      const ok = [...types].every((o) => CHART_META[t].coexist.includes(o));
      if (!ok) warns.push(`[chart] ${t} 不能与 ${[...types].filter((o) => o !== t).join("/")} 共存（官方 §5.4）`);
    }
  }
  for (const t of types) {
    if (SOLO_TYPES.has(t) && types.size > 1) warns.push(`[chart] ${t} 独占系列数组，不可与其他类型混合`);
  }
  if (series.length > 1 && [...types].some((t) => SOLO_TYPES.has(t))) {
    warns.push(`[chart] ${[...types].filter((t) => SOLO_TYPES.has(t)).join("/")} 系列只能有 1 个元素`);
  }
  // Radar shared-category constraint (official §radar: all radar series in one chart must reference the same category column)
  if (types.size === 1 && types.has("radar") && series.length > 1) {
    const catCol = series.map((s) => s.encode?.category).find((v) => v != null);
    if (catCol != null && series.some((s) => s.encode?.category !== catCol)) {
      warns.push(`[chart] radar 所有系列必须引用同一 category 列（${catCol}）`);
    }
  }
  return warns;
}

/** Merge seriesDefaults + series[i] (§3.4): scalars override; objects shallow-merge; arrays replace. type/encode never come from defaults. */
export function mergeSeriesDefault(defaults, series) {
  if (!defaults) return { ...series };
  const out = { ...defaults, ...series };
  for (const key of Object.keys(defaults)) {
    const dv = defaults[key];
    const sv = series[key];
    if (dv && typeof dv === "object" && !Array.isArray(dv) && sv && typeof sv === "object" && !Array.isArray(sv)) {
      out[key] = { ...dv, ...sv };
    }
  }
  delete out.type; // §3.4: type/encode are not allowed in seriesDefaults
  return out;
}

/**
 * Normalize a chart: merge seriesDefaults, pull data by official encode channels, apply default colors.
 * @returns {{series: Array, cats: Array, warn: Array}}
 *  series[i] = { ...official fields (including merged defaults), type, name, encode,
 *    color (main color), areaColor, _cols: {channel: colIndex}, _values: {channel: array} }
 *  cats = category channel values (taken from the first series having a category/x channel)
 */
export function resolveChartSeries(theme, el) {
  const data = el.data || { cols: [], rows: [] };
  const seriesDefaults = el.seriesDefaults || {};
  const palette = themeChartPalette(theme); // official §3.1: theme color cycle (accent1-6 slots)
  const warn = validateChartSeries(el);
  const series = [];

  (el.series || []).forEach((s, i) => {
    const type = s.type;
    const meta = CHART_META[type];
    if (!meta) return;
    const merged = mergeSeriesDefault(seriesDefaults[type], s);
    const encode = merged.encode || {};
    const name = merged.name || "";

    // Official encode channel -> column index + per-row values (lenient read: x<->category, y<->value alias fallback, see ENCODE_ALIAS)
    const _cols = {};
    const _values = {};
    for (const ch of Object.keys(meta.encode)) {
      const colName = encode[ch] ?? (ENCODE_ALIAS[ch] || []).map((a) => encode[a]).find((v) => v != null);
      const ci = colIndex(data, colName);
      if (ci < 0) continue;
      _cols[ch] = ci;
      _values[ch] = (data.rows || []).map((row) => row[ci] ?? null);
    }
    // Numeric channels (y/value/high/low/close/open/size/flow/x?) string -> number.
    // Direction rule (official): for horizontal bar/waterfall, y is the category channel
    // (strings preserved) and x is the numeric channel
    const horizontal =
      (type === "bar" || type === "waterfall") && isHorizontalChart(el, data, encode);
    // dataFilter (scatter/bubble long-table grouping, official §scatter/bubble): keep rows where col === value
    const df = merged.dataFilter;
    if (df && (type === "scatter" || type === "bubble") && df.col != null && df.value !== undefined) {
      const dci = colIndex(data, df.col);
      if (dci >= 0) {
        const want = String(df.value);
        const keep = (data.rows || []).map((r) => String(r?.[dci] ?? "") === want);
        for (const ch of Object.keys(_values)) _values[ch] = _values[ch].filter((_, i) => keep[i]);
      }
    }
    const NUM_CHANNELS = new Set(["y", "value", "high", "low", "close", "open", "size", "flow"]);
    for (const ch of Object.keys(_values)) {
      if (!NUM_CHANNELS.has(ch)) continue;
      if (horizontal && ch === "y") continue; // category channel of a horizontal bar (strings)
      if (type === "heatmap" && (ch === "x" || ch === "y")) continue; // heatmap x/y are category channels (official constraint)
      _values[ch] = _values[ch].map(toNum);
    }

    // Default color (§5.2): the color field per type. The editor UI writes s.color (generic
    // field); the official fill/lineColor win (including merged seriesDefaults), color is the fallback.
    let color = null;
    if (type === "line" || type === "area" || type === "radar") {
      color = merged.lineColor || merged.color || palette[i % palette.length];
    } else if (type === "bar" || type === "scatter" || type === "bubble") {
      color = merged.fill || merged.color || palette[i % palette.length];
    } else if (type === "pie") {
      color = merged.fill || merged.color || palette[0]; // the array is cycled per point by render/export
    } else {
      color = merged.fill || merged.color || null; // not applicable to candlestick/waterfall/heatmap/treemap/sunburst/sankey
    }
    let areaColor = merged.areaColor || null;
    if ((type === "area" || type === "radar") && !areaColor && color) {
      areaColor = hexA(color, 0.22); // official: areaColor defaults to a translucent lineColor
    }

    const cats = _values.category != null ? _values.category.map((v) => String(v ?? ""))
      : horizontal && _values.y != null ? _values.y.map((v) => String(v ?? ""))
      : _values.x != null ? _values.x.map((v) => String(v ?? "")) : [];

    series.push({
      ...merged,
      type,
      name: name || (encode.y ? encode.y : `系列${i + 1}`),
      encode,
      color,
      areaColor,
      _cols,
      _values,
      _cats: cats,
      _index: i,
    });
  });

  // Categories (first series with a category/x channel)
  let cats = [];
  for (const s of series) {
    if (s._cats.length) { cats = s._cats; break; }
  }

  return { series, cats, warn, data };
}
