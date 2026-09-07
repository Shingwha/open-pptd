// ============================================================================
// model/chart.js — 图表模型公共出口（barrel；渲染器与 writer 共享，唯一实现）
// ----------------------------------------------------------------------------
// 按域拆分（chart/ 目录，本文件只做 re-export，公共导出面与拆分前一致）：
//   chart/meta.js    13 类型注册表、官方默认值、encode 重映射
//   chart/resolve.js 归一化（seriesDefaults 合并 / encode 取数 / 默认取色 / 共存校验）
//   chart/layout.js  布局语义单源（柱状 barWidth/barGap + 绘图区 resolvePlotLayout → OOXML + ECharts 投影）
//   chart/axes.js    轴配置归一化、方向判定、系列轴索引与数据通道
//   chart/colors.js  取色与派生（主题色循环 / HEX8 / HSL.L 层级派生）
//   chart/labels.js  数据标签解析（§3.3 链）
//   chart/data.js    ChartData 表格工具（xlsx 嵌入、数值列判定）
// 新增导出时在对应域模块实现并在此登记；消费方一律 import 本文件，不深引 chart/ 内部。
// ============================================================================

export { CHART_META, CHART_TYPE_ORDER, CHART_DEFAULTS, remapEncode } from "./chart/meta.js";
export { validateChartSeries, mergeSeriesDefault, resolveChartSeries } from "./chart/resolve.js";
export { resolveBarLayout, resolvePlotLayout } from "./chart/layout.js";
export { toAxisArray, inferAxisType, resolveChartDirection, seriesAxisIndex, seriesChannels } from "./chart/axes.js";
export { hexA, darkenByLightness, hierarchyColor } from "./chart/colors.js";
export { DATA_LABEL_CONTENTS, resolveDataLabels } from "./chart/labels.js";
export { chartDataTable, isNumericColumn } from "./chart/data.js";
