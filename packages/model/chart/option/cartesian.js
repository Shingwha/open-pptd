// ============================================================================
// model/chart/option/cartesian.js — 笛卡尔系 option（bar/line/area/scatter/bubble/
// candlestick + waterfall 双 bar 模拟；纯函数）
// ----------------------------------------------------------------------------

import { resolveColor } from "../../theme.js";
import { dashSpec } from "../../style-spec.js";
import { CHART_DEFAULTS } from "../meta.js";
import { resolveChartDirection, seriesAxisIndex, seriesChannels } from "../axes.js";
import { hexA, waterfallColorOf } from "../colors.js";
import { formatChartValue } from "../format.js";
import { resolveDataLabels } from "../labels.js";
import { cartesianAxes } from "./axes.js";
import { AXIS_TEXT, chartStyleColors, echartsLabel, markerSymbol, seriesColor } from "./shared.js";

/** waterfall：双 bar stack 模拟（透明基座 + 彩色段）。轴走共用 cartesianAxes
 * （此前自拼硬编码轴、忽略 xAxis/yAxis 配置——I28）。 */
function waterfallOption(ctx) {
  const { theme, el, series, cats, common } = ctx;
  const s = series[0];
  const rows = el.data?.rows || [];
  const isTotalCol = s._cols.isTotal;
  const vals = s._values.y ?? [];
  let base = 0;
  const data = rows.map((r, i) => {
    const isTotal = isTotalCol != null ? r[isTotalCol] === true : false;
    const y = Number(vals[i] ?? 0);
    const start = isTotal ? 0 : base;
    base = isTotal ? y : base + y;
    return { start, end: start + y, y, isTotal };
  });
  // 三分类色单源 waterfallColorOf（预览与 chartEx 导出同一语义，含缺省色板）
  const colorOf = (d) => waterfallColorOf(theme, s, d.isTotal, d.y);
  const label = echartsLabel(theme, el, s, { position: "top" });
  const barWidth = el.barWidth != null ? `${el.barWidth * 100}%` : undefined;
  const wfLabelCfg = resolveDataLabels(el, s, "waterfall");
  const catLabel = wfLabelCfg?.content === "category";
  const fmt = (p) => {
    if (catLabel) return p.name;
    const v = data[p.dataIndex].y;
    return wfLabelCfg?.numberFormat ? formatChartValue(v, wfLabelCfg.numberFormat) : String(v);
  };
  const axes = cartesianAxes(theme, el, cats, series, { horizontal: false });
  // 彩段标签朝浮动柱外侧：增量在外顶（上）、减量在外底（下），与 PowerPoint
  // chartEx 瀑布的端点标签一致
  return {
    ...common,
    series: [
      // 双 bar stack 模拟：透明基座 = min(start,end)、彩段 = |y|，全正数堆叠。
      // 不能用 start 当基座：ECharts 对同 stack 组按正负分两侧累计，负增量的
      // 彩段会被压到零轴下方，瀑布桥退化成普通负值柱（预览/导出分叉）
      { type: "bar", stack: "wf", silent: true, barWidth, data: data.map((d) => Math.min(d.start, d.end)), itemStyle: { color: "transparent" }, tooltip: { show: false } },
      {
        type: "bar", stack: "wf", barWidth,
        data: data.map((d) => ({ value: Math.abs(d.y), label: { position: d.y >= 0 ? "top" : "bottom" } })),
        itemStyle: { color: (p) => colorOf(data[p.dataIndex]) },
        label: label ? { ...label, formatter: fmt } : undefined,
      },
    ],
    xAxis: axes.xAxis,
    yAxis: axes.yAxis,
  };
}

/** 笛卡尔系分派入口（命中返回 option，否则 null）。 */
export function buildCartesian(ctx) {
  const { theme, el, series, cats, primary, common, barLayout, bubble } = ctx;
  if (primary === "waterfall") return waterfallOption(ctx);

  const known = ["bar", "line", "area", "scatter", "bubble", "candlestick"];
  if (!known.includes(primary)) return null;

  const stackedPercent = series.some((s) => s.stack === "percent");
  const horizontal = resolveChartDirection(el, series);
  const axes = cartesianAxes(theme, el, cats, series, { horizontal, percentMax: stackedPercent, scatter: primary === "scatter" || primary === "bubble" });
  // 类目轴标题的底部让位由布局模型 resolvePlotLayout 统一处理（common.grid 已含）

  if (primary === "scatter" || primary === "bubble") {
    return {
      ...common,
      tooltip: { trigger: "item", formatter: (p) => `${p.seriesName}<br/>x: ${p.value[0]}<br/>y: ${p.value[1]}${p.value[2] != null ? `<br/>size: ${p.value[2]}` : ""}` },
      xAxis: axes.xAxis,
      yAxis: axes.yAxis,
      series: series.map((s) => {
        const data = (s._values.x ?? []).map((xv, j) => {
          const pt = [Number(xv ?? 0), Number(s._values.y?.[j] ?? 0)];
          if (s.type === "bubble") pt.push(Number(s._values.size?.[j] ?? 0));
          return pt;
        });
        const m = markerSymbol(theme, s.marker ?? { shape: "circle" }, seriesColor(theme, s));
        // 气泡直径与导出归一化同源（spec.bubble.diameterFn；全局极值 + sizeScale 映射）
        const sizeFn = s.type === "bubble" && bubble ? bubble.diameterFn(s) : null;
        return {
          type: "scatter",
          name: s.name,
          xAxisIndex: seriesAxisIndex(s, true),
          yAxisIndex: seriesAxisIndex(s, false),
          symbolSize: s.type === "bubble" ? (v) => sizeFn(v[2]) : (typeof m === "object" && m.symbolSize) || 10,
          itemStyle: { color: seriesColor(theme, s), borderColor: resolveColor(theme, s.border?.color), borderWidth: s.border?.width },
          label: echartsLabel(theme, el, s, { position: "top" }),
          data,
        };
      }),
    };
  }

  // bar / line / area / candlestick
  // 柱宽/组内间隙：spec.barLayout 单源投影（与 writer 导出同一结果）
  const seriesOptions = series.map((s) => {
    const color = seriesColor(theme, s);
    // 数值通道按方向取（横向柱：数值在 x；其余：数值在 y）——与 writer seriesChannels 同源
    const chs = s.type === "bar" ? seriesChannels(s, horizontal) : null;
    const valVals = chs ? chs.val.vals : s._values.y;
    const data = (valVals ?? []).map((v) => (v == null ? null : Number(v)));
    const commonSer = {
      name: s.name,
      data,
      stack: s.stack === "percent" ? "total" : s.stack || undefined,
      itemStyle: { color },
      // 堆叠柱标签内嵌（与 PowerPoint 堆叠图默认 inside 一致；top 会飘到整柱顶端）
      label: echartsLabel(theme, el, s, { position: s.stack ? "inside" : "top" }),
      xAxisIndex: seriesAxisIndex(s, true),
      yAxisIndex: seriesAxisIndex(s, false),
    };
    if (s.type === "bar") {
      return {
        type: "bar",
        barWidth: `${barLayout.echarts.barWidthPct}%`,
        barGap: `${barLayout.echarts.barGapPct}%`,
        ...commonSer,
        itemStyle: { color, borderColor: resolveColor(theme, s.border?.color), borderWidth: s.border?.width },
      };
    }
    if (s.type === "line") {
      const label = echartsLabel(theme, el, s, { position: "top" });
      // symbol "none" ≈ showSymbol:false，ECharts 不渲染数据标签；配了标签但未配
      // marker 时用 1px 透明圆点承托标签（渲染不可见，标签位置与导出一致）
      const hasLabel = label != null;
      return {
        type: "line",
        smooth: !!s.smooth,
        symbol: s.marker ? markerSymbol(theme, s.marker, color).symbol : hasLabel ? "circle" : "none",
        ...(hasLabel && !s.marker ? { symbolSize: 1, itemStyle: { color: "transparent" } } : {}),
        lineStyle: { color, width: s.width ?? 2, type: dashSpec(s.lineStyle)?.cssBorder || "solid" },
        connectNulls: s.nullHandling === "connect", ...commonSer,
        label,
      };
    }
    if (s.type === "area") {
      return {
        type: "line", smooth: !!s.smooth, symbol: "none",
        lineStyle: { color, width: s.width ?? 2, type: dashSpec(s.lineStyle)?.cssBorder || "solid" },
        connectNulls: s.nullHandling === "connect",
        areaStyle: { color: s.areaColor || hexA(color, 0.22) },
        ...commonSer,
      };
    }
    if (s.type === "candlestick") {
      const open = s._values.open ?? null;
      const high = s._values.high ?? [];
      const low = s._values.low ?? [];
      const close = s._values.close ?? [];
      const up = s.upBars || {};
      const down = s.downBars || {};
      const cs = CHART_DEFAULTS.candlestick;
      return {
        ...commonSer,
        type: "candlestick",
        // K 线柱宽走 resolveBarLayout 投影（writer 端 stock gapWidth 150 同一缺省，
        // 两端柱宽收敛——此前 ECharts 默认 ~80% 槽宽 vs PPT 40%）
        barWidth: `${barLayout.echarts.barWidthPct}%`,
        // 涨跌缺省色与导出同源（CHART_DEFAULTS.candlestick，chart46 校准）
        itemStyle: {
          color: resolveColor(theme, up.fill) || cs.upFill,
          color0: resolveColor(theme, down.fill) || cs.downFill,
          borderColor: resolveColor(theme, up.border?.color) || cs.upBorder,
          borderColor0: resolveColor(theme, down.border?.color) || cs.downBorder,
        },
        data: high.map((hv, j) => {
          const o = open ? Number(open[j] ?? 0) : Number(close[j] ?? 0);
          return [o, Number(close[j] ?? 0), Number(low[j] ?? 0), Number(hv ?? 0)];
        }),
      };
    }
    return commonSer;
  });

  // 股价图图例与 PowerPoint 对齐：原生股价图把 1 个系列展开为 开盘/最高/最低/收盘
  // 图例条目（此前预览只显示系列名，两端不一致）。追加空数据 helper 系列承载图例
  // 条目（不参与交互），真身经 legend.data 排除；最高/最低用涨跌色点题
  const csSeries = series.find((s) => s.type === "candlestick");
  let legendData = null;
  if (csSeries) {
    const cols = el.data?.cols || [];
    const channels = csSeries._cols.open != null ? ["open", "high", "low", "close"] : ["high", "low", "close"];
    const csUp = resolveColor(theme, (csSeries.upBars || {}).fill) || CHART_DEFAULTS.candlestick.upFill;
    const csDown = resolveColor(theme, (csSeries.downBars || {}).fill) || CHART_DEFAULTS.candlestick.downFill;
    const hiName = String(cols[csSeries._cols.high] ?? "最高");
    const loName = String(cols[csSeries._cols.low] ?? "最低");
    const helperNames = channels.map((ch) => String(cols[csSeries._cols[ch]] ?? ch));
    seriesOptions.push(...helperNames.map((name) => ({
      type: "line", name, data: [],
      silent: true, legendHoverLink: false, tooltip: { show: false }, emphasis: { disabled: true },
      lineStyle: { opacity: 0 },
      itemStyle: { color: name === hiName ? csUp : name === loName ? csDown : "#9ca3af" },
    })));
    legendData = [...helperNames, ...series.filter((s) => s.type !== "candlestick").map((s) => s.name)];
  }

  return {
    ...common,
    xAxis: axes.xAxis,
    yAxis: axes.yAxis,
    series: seriesOptions,
    ...(legendData ? { legend: { ...common.legend, data: legendData } } : {}),
  };
}
