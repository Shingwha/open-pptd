// ============================================================================
// model/chart/resolve.js — 图表归一化（合并 defaults、encode 取数、默认取色、共存校验）
// ----------------------------------------------------------------------------
// C3 对齐官方：
//   - seriesDefaults 合并（§3.4）：标量覆盖/对象浅合并/数组整替；type/encode 不在内
//   - 数值通道字符串解析为数字（ChartData 约束）；缺格用 null 填充
//   - 取色（§5.2）：默认 themeChartPalette（主题 accent1-6 色循环）按系列出现顺序循环；
//     waterfall 三分类不参与色循环
// ============================================================================

import { resolveColor, themeChartPalette } from "../theme.js";
import { CHART_META, SOLO_TYPES } from "./meta.js";
import { hexA } from "./colors.js";
import { toAxisArray, inferAxisType, isHorizontalChart } from "./axes.js";

// encode 读回退别名（resolveChartSeries 用）：SEMANTIC_KEYS 的严格子集——
// 刻意不含 date（避免把名为 date 的列误判为 x 通道回退），两者语义不同勿合并。
const ENCODE_ALIAS = { x: ["category"], category: ["x"], y: ["value"], value: ["y"] };

function colIndex(data, name) {
  return (data.cols || []).indexOf(name);
}

/** 数值通道解析：字符串 → 数字；失败 → null（官方 NonNumericValueError 宽容处理）。 */
function toNum(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

/**
 * 校验系列数组的类型共存约束（§5.4）。返回警告字符串数组（不抛错，宽容消费）。
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
  // 雷达共享分类列约束（官方 §radar：同图所有雷达系列必须引用同一 category 列）
  if (types.size === 1 && types.has("radar") && series.length > 1) {
    const catCol = series.map((s) => s.encode?.category).find((v) => v != null);
    if (catCol != null && series.some((s) => s.encode?.category !== catCol)) {
      warns.push(`[chart] radar 所有系列必须引用同一 category 列（${catCol}）`);
    }
  }
  return warns;
}

/** seriesDefaults + series[i] 合并（§3.4）：标量覆盖；对象浅合并；数组整替。type/encode 不来自 defaults。 */
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
  delete out.type; // §3.4: type/encode 不允许出现在 seriesDefaults
  return out;
}

/**
 * 归一化图表：合并 seriesDefaults、按官方 encode 通道取数、默认取色。
 * @returns {{series: Array, cats: Array, warn: Array}}
 *  series[i] = { ...官方字段(含 merged defaults), type, name, encode,
 *    color(主色), areaColor, _cols: {通道:列号}, _values: {通道:数组} }
 *  cats = 分类通道值（取第一个有 category/x 通道的系列）
 */
export function resolveChartSeries(theme, el) {
  const data = el.data || { cols: [], rows: [] };
  const seriesDefaults = el.seriesDefaults || {};
  const palette = themeChartPalette(theme); // 官方 §3.1：主题色循环（accent1-6 槽位）
  const warn = validateChartSeries(el);
  const series = [];

  (el.series || []).forEach((s, i) => {
    const type = s.type;
    const meta = CHART_META[type];
    if (!meta) return;
    const merged = mergeSeriesDefault(seriesDefaults[type], s);
    const encode = merged.encode || {};
    const name = merged.name || "";

    // 官方 encode 通道 → 列号 + 每行取值（读宽容：x↔category、y↔value 别名回退，见 ENCODE_ALIAS）
    const _cols = {};
    const _values = {};
    for (const ch of Object.keys(meta.encode)) {
      const colName = encode[ch] ?? (ENCODE_ALIAS[ch] || []).map((a) => encode[a]).find((v) => v != null);
      const ci = colIndex(data, colName);
      if (ci < 0) continue;
      _cols[ch] = ci;
      _values[ch] = (data.rows || []).map((row) => row[ci] ?? null);
    }
    // 数值通道（y/value/high/low/close/open/size/flow/x?）字符串 → 数字。
    // 方向规则（官方）：bar/waterfall 水平时 y 是分类通道（保留字符串），x 是数值通道
    const horizontal =
      (type === "bar" || type === "waterfall") && isHorizontalChart(el, data, encode);
    // dataFilter（scatter/bubble 长表分组，官方 §scatter/bubble）：保留 col===value 的行
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
      if (horizontal && ch === "y") continue; // 水平柱的分类通道（字符串）
      if (type === "heatmap" && (ch === "x" || ch === "y")) continue; // heatmap 的 x/y 是分类通道（官方约束）
      _values[ch] = _values[ch].map(toNum);
    }

    // 默认取色（§5.2）：每类型的色字段。编辑器 UI 写 s.color（通用字段），
    // 官方 fill/lineColor 优先（含 seriesDefaults 合并值），color 兜底。
    let color = null;
    if (type === "line" || type === "area" || type === "radar") {
      color = merged.lineColor || merged.color || palette[i % palette.length];
    } else if (type === "bar" || type === "scatter" || type === "bubble") {
      color = merged.fill || merged.color || palette[i % palette.length];
    } else if (type === "pie") {
      color = merged.fill || merged.color || palette[0]; // 数组由渲染/导出按点循环
    } else {
      color = merged.fill || merged.color || null; // candlestick/waterfall/heatmap/treemap/sunburst/sankey 不适用
    }
    let areaColor = merged.areaColor || null;
    if ((type === "area" || type === "radar") && !areaColor && color) {
      areaColor = hexA(color, 0.22); // 官方：areaColor 缺省 = lineColor 半透明
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

  // 分类（第一个带 category/x 的系列）
  let cats = [];
  for (const s of series) {
    if (s._cats.length) { cats = s._cats; break; }
  }

  return { series, cats, warn, data };
}
