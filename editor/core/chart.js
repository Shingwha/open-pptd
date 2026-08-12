// ============================================================================
// core/chart.js — 图表模型归一化（渲染器与 writer 共享，唯一实现）
// ----------------------------------------------------------------------------
// C3 对齐官方（references/pptd.md §Chart 1009-1500 行 + §5.2/5.3/5.4/5.5）：
//   - 13 种系列类型，无顶层 type；pie.innerRadius > 0 = 环形（官方无 doughnut 类型）
//   - 类型共存约束（§5.4）：bar/line/area/scatter/bubble 自由混合；
//     candlestick 只可与 bar/line/area；其余 7 类独占 series 数组
//   - seriesDefaults 合并（§3.4）：标量覆盖/对象浅合并/数组整替；type/encode 不在内
//   - dataLabels（§3.3）：series[i].dataLabels > Chart.dataLabels > 不显示（默认关）
//   - 数值通道字符串解析为数字（ChartData 约束）
//   - 取色（§5.2）：默认 themeChartPalette（主题 accent1-6 色循环，官方 §3.1 "theme color cycle"）
//     按系列出现顺序循环；treemap 子节点沿 HSL.L 每级减 10；heatmap 回退主题 primarySoft→primaryDeep；
//     waterfall 三分类不参与色循环
// ============================================================================

import { resolveColor, themeChartPalette } from "./theme.js";

/**
 * 13 类型注册表（官方字段集 + 约束）。
 * encode: 官方 encode 字段（? 结尾 = 可选）；coexist: 允许共存的类型集合。
 */
export const CHART_META = {
  bar: { label: "柱状图", encode: { x: "x", y: "y" }, axes: "cartesian", coexist: ["bar", "line", "area", "scatter", "bubble", "candlestick"] },
  line: { label: "折线图", encode: { x: "x", y: "y" }, axes: "cartesian", coexist: ["bar", "line", "area", "scatter", "bubble", "candlestick"] },
  area: { label: "面积图", encode: { x: "x", y: "y" }, axes: "cartesian", coexist: ["bar", "line", "area", "scatter", "bubble", "candlestick"] },
  scatter: { label: "散点图", encode: { x: "x", y: "y" }, axes: "cartesian", coexist: ["bar", "line", "area", "scatter", "bubble"] },
  bubble: { label: "气泡图", encode: { x: "x", y: "y", size: "size" }, axes: "cartesian", coexist: ["bar", "line", "area", "scatter", "bubble"] },
  candlestick: { label: "股价图", encode: { x: "x", high: "high", low: "low", close: "close", open: "open?" }, axes: "cartesian", coexist: ["candlestick", "bar", "line", "area"] },
  pie: { label: "饼图", encode: { category: "category", value: "value" }, axes: "none", coexist: ["pie"] },
  radar: { label: "雷达图", encode: { category: "category", y: "y" }, axes: "radar", coexist: ["radar"] },
  waterfall: { label: "瀑布图", encode: { x: "x", y: "y", isTotal: "isTotal?" }, axes: "cartesian", coexist: ["waterfall"] },
  heatmap: { label: "热力图", encode: { x: "x", y: "y", value: "value" }, axes: "cartesian", coexist: ["heatmap"] },
  treemap: { label: "矩形树图", encode: { category: "category", value: "value", parent: "parent?" }, axes: "none", coexist: ["treemap"] },
  sunburst: { label: "旭日图", encode: { category: "category", value: "value", parent: "parent?" }, axes: "none", coexist: ["sunburst"] },
  sankey: { label: "桑基图", encode: { source: "source", target: "target", flow: "flow" }, axes: "none", coexist: ["sankey"] },
};

export const CHART_TYPE_ORDER = Object.keys(CHART_META);

/** encode 语义键别名表（类型切换时保留已有列引用，自动对齐默认列名）。 */
const SEMANTIC_KEYS = {
  x: ["x", "category", "date"],
  y: ["y", "value"],
  category: ["category", "x"],
  value: ["value", "y"],
  size: ["size"], high: ["high"], low: ["low"], close: ["close"], open: ["open"],
  isTotal: ["isTotal"], parent: ["parent"], source: ["source"], target: ["target"], flow: ["flow"],
};

/**
 * 按目标类型元数据重映射 encode（图表编辑器/属性面板共用）：
 * 旧列的语义别名命中则保留引用，否则回退目标类型默认列名。
 */
export function remapEncode(oldEncode, meta) {
  const out = {};
  for (const key of Object.keys(meta.encode)) {
    const cand = SEMANTIC_KEYS[key] || [key];
    const hit = cand.map((k) => oldEncode[k]).find((v) => v != null);
    out[key] = hit ?? meta.encode[key];
  }
  return out;
}

/** 单系列独占类型（系列数组只能有 1 个元素）。 */
const SOLO_TYPES = new Set(["pie", "waterfall", "heatmap", "treemap", "sunburst", "sankey", "radar"]);

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

    // 官方 encode 通道 → 列号 + 每行取值（读宽容：x↔category、y↔value 别名回退）
    const ENCODE_ALIAS = { x: ["category"], category: ["x"], y: ["value"], value: ["y"] };
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
    let horizontal = false;
    if (type === "bar" || type === "waterfall") {
      const xs = toAxisArray(el.xAxis);
      const ys = toAxisArray(el.yAxis);
      const xType = xs[0]?.type ?? inferAxisType(data, encode.x);
      const yType = ys[0]?.type ?? inferAxisType(data, encode.y);
      horizontal = yType === "category" && xType !== "category";
    }
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

/**
 * 层级图节点色（官方 treemap/sunburst 颜色派生规则，writer/renderer 共享）：
 *   fill 单值 → 所有根同色；1D 数组按根循环；2D 数组外层按根、内层按级直接取色；
 *   子节点沿 HSL.L 每级 -10（L_new = max(0, L_old - 10)）。
 * @param {object} s 归一化后的系列（含 fill）
 * @param {number} rootIdx 根节点出现顺序索引
 * @param {number} levelFromRoot 距根的层级（0 = 根）
 */
export function hierarchyColor(theme, s, rootIdx, levelFromRoot) {
  const fill = s?.fill;
  if (fill == null) return null;
  if (Array.isArray(fill)) {
    const f = fill[rootIdx % fill.length];
    if (Array.isArray(f)) {
      if (levelFromRoot < f.length) return resolveColor(theme, f[levelFromRoot]) || null;
      const base = resolveColor(theme, f[f.length - 1]) || null;
      return base ? darkenByLightness(base, 10 * (levelFromRoot - f.length + 1)) : null;
    }
    const base = resolveColor(theme, f) || null;
    return base ? darkenByLightness(base, 10 * levelFromRoot) : null;
  }
  const base = resolveColor(theme, fill) || null;
  return base ? darkenByLightness(base, 10 * levelFromRoot) : null;
}

/** 图表数据 → xlsx 表格布局（行：表头 + 数据）。 */
export function chartDataTable(el) {
  const data = el.data || { cols: [], rows: [] };
  const cols = data.cols || [];
  const table = [cols.slice()];
  for (const row of data.rows || []) {
    table.push(cols.map((_, i) => row[i] ?? null));
  }
  return table;
}

/** 各类型数据标签可用内容（编辑器样式面板与 resolveDataLabels 共用）。 */
export const DATA_LABEL_CONTENTS = {
  bar: ["value"], line: ["value"], area: ["value"], scatter: ["value"], bubble: ["value"],
  radar: ["value"], heatmap: ["value"], candlestick: ["value"],
  pie: ["value", "percentage", "category"], waterfall: ["value", "category"],
  treemap: ["value", "category"], sunburst: ["value", "category"], sankey: ["value", "category"],
};

/**
 * 数据标签显示（官方 §3.3 链：series[i].dataLabels > Chart.dataLabels > 不显示）。
 * @returns {null | {content, numberFormat, color, fontSize, fontFamily}} 有效配置
 * （样式字段来自 DataLabelConfig extends TextStyle，供 writer/renderer 消费）
 */
export function resolveDataLabels(el, series, type) {
  const DEFAULTS = {
    bar: "value", line: "value", area: "value", scatter: "value", bubble: "value",
    radar: "value", heatmap: "value", pie: "value", waterfall: "value",
    treemap: "category", sunburst: "category", sankey: "value",
  };
  const ALLOWED = DATA_LABEL_CONTENTS;
  const cfg = series?.dataLabels ?? el?.dataLabels ?? null;
  if (!cfg) return null; // 官方默认不显示
  const show = typeof cfg === "boolean" ? cfg : cfg.show !== false;
  if (!show) return null;
  let content = typeof cfg === "object" ? cfg.content : undefined;
  if (content == null) content = DEFAULTS[type] || "value";
  if (!ALLOWED[type] || !ALLOWED[type].includes(content)) content = DEFAULTS[type] || "value";
  const o = typeof cfg === "object" ? cfg : {};
  return {
    content,
    numberFormat: o.numberFormat,
    color: o.color,
    fontSize: o.fontSize,
    fontFamily: o.fontFamily,
  };
}

/** 判断某列是否为数值列（供数据编辑器与导出用）。 */
export function isNumericColumn(table, colIdx) {
  for (let r = 1; r < table.length; r++) {
    const v = table[r][colIdx];
    if (v != null && v !== "") return typeof v === "number" || !isNaN(Number(v));
  }
  return true;
}

/** hex → HEX8（#RRGGBBAA，官方 Color 透明形式；ECharts 与 OOXML 都接受）。 */
export function hexA(hex, alpha) {
  const h = String(hex || "#888888").replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `#${h.slice(0, 6)}${a}`;
}

/** HSL 亮度减少 n%（官方 treemap 派生：L_new = max(0, L_old - 10)）。 */
export function darkenByLightness(hex, step = 10) {
  const h = String(hex || "#888888").replace("#", "");
  if (h.length < 6) return hex;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const nl = Math.max(0, l - step / 100);
  // 保持色相饱和度不变，只改亮度（HSL → RGB）
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  const ns = s;
  const c = (1 - Math.abs(2 * nl - 1)) * ns;
  const hp = hue2rgb(hueOf(r, g, b, max, min, d), c, nl);
  return `#${hp.map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("")}`;
}

function hue2rgb(h, c, l) {
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rgb;
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return rgb.map((v) => v + m);
}

function hueOf(r, g, b, max, min, d) {
  if (d === 0) return 0;
  if (max === r) return ((g - b) / d) % 6 * 60;
  if (max === g) return ((b - r) / d + 2) * 60;
  return ((r - g) / d + 4) * 60;
}

// ----------------------------------------------------------------------------
// 轴配置归一化（writer/renderer 共享；官方 §Chart 方向规则 + §5.3 轴数组规则）
// ----------------------------------------------------------------------------

/** 轴配置归一化：AxisConfig | AxisConfig[] → AxisConfig[]（省略 = [{}]，官方 §通用规则 5）。 */
export function toAxisArray(cfg) {
  if (cfg == null) return [{}];
  const arr = Array.isArray(cfg) ? cfg : [cfg];
  return arr.map((c) => (c && typeof c === "object" ? c : {}));
}

/** 列类型推断（官方：字符串列 → category，全数值列 → value）。 */
export function inferAxisType(data, colName) {
  const ci = (data?.cols || []).indexOf(colName);
  if (ci < 0) return "category";
  for (const r of data?.rows || []) {
    const v = r?.[ci];
    if (v == null || v === "") continue;
    if (typeof v !== "number" && Number.isNaN(Number(v))) return "category";
  }
  return "value";
}

/**
 * 图表方向（官方 §Chart 方向规则）：bar/waterfall 由轴类型决定——
 * xAxis.type==="category"（显式或按数据推断）→ 垂直；yAxis.type==="category" → 水平。
 * 其余类型（line/area/scatter/bubble/candlestick/heatmap/radar…）恒垂直。
 * @returns {boolean} true = 水平（barDir=bar）
 */
export function resolveChartDirection(el, series) {
  const s = series.find((x) => x && (x.type === "bar" || x.type === "waterfall"));
  if (!s) return false;
  const xs = toAxisArray(el.xAxis);
  const ys = toAxisArray(el.yAxis);
  const xType = xs[0]?.type ?? inferAxisType(el.data, s.encode.x);
  const yType = ys[0]?.type ?? inferAxisType(el.data, s.encode.y);
  return yType === "category" && xType !== "category";
}

/**
 * 系列轴索引（官方 §5.3）：次轴永远放在数值轴一侧——
 * 垂直图用 series.yAxisIndex，水平图用 series.xAxisIndex。
 * 返回轴索引（0 = 主轴；≥1 = 第 N 个次轴，需 xAxis/yAxis 数组长度 ≥ index+1）。
 */
export function seriesAxisIndex(s, horizontal) {
  const idx = horizontal ? s.xAxisIndex : s.yAxisIndex;
  return Number.isFinite(idx) && idx > 0 ? Math.floor(idx) : 0;
}

/**
 * 系列数据通道按方向重映射（barDir=bar 时分类通道在 y、数值通道在 x）：
 * @returns {{cat: {col, vals}, val: {col, vals}}} 或 null（无分类通道）
 */
export function seriesChannels(s, horizontal) {
  if (horizontal) {
    if (s._cols.y == null || s._cols.x == null) return null;
    return { cat: { col: s._cols.y, vals: s._values.y }, val: { col: s._cols.x, vals: s._values.x } };
  }
  const catCol = s._cols.category ?? s._cols.x;
  const valCol = s._cols.y ?? s._cols.value;
  if (catCol == null || valCol == null) return null;
  return { cat: { col: catCol, vals: s._cats }, val: { col: valCol, vals: s._values.y ?? s._values.value } };
}
