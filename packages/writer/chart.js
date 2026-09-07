// ============================================================================
// writer/chart.js — 图表导出公共出口（barrel；按 exportKind 路由）
// ----------------------------------------------------------------------------
// 按职责拆分（chart/ 目录，本文件只做 re-export，公共导出面与拆分前一致）：
//   chart/types.js    导出体系分组（经典 8 类 / chartEx 3 类 / 占位 PNG）
//   chart/xlsx.js     嵌入 xlsx 工作表（完整部件 + candlestick 列重排）
//   chart/style.js    公共样式片段（fill/ln/txPr/dLbls/marker/srgbClr）
//   chart/ser.js      各类型 c:ser 系列构造
//   chart/axes.js     catAx/valAx + §5.3 轴数组（次轴换侧/ID 约定）+ radar 轴组
//   chart/classic.js  经典 c:chartSpace 主装配（buildChartParts）
//   chart/chartex.js  chartEx 扩展体系（waterfall/treemap/sunburst）
//   chart/frame.js    slide graphicFrame（chartEx mc:AlternateContent 包装）
// 消费方一律 import 本文件（writer/chart.js），不深引 chart/ 内部。
// ============================================================================

export { buildChartParts } from "./chart/classic.js";
export { chartXml } from "./chart/frame.js";
