// ============================================================================
// writer/chart/types.js — 图表导出体系分组与 chartEx 占位图
// ----------------------------------------------------------------------------
// 类型分组是 CHART_META.route（model 路由单源）的派生视图，勿手写类型清单。
// ============================================================================

import { CHART_META } from "../../model/chart.js";

/** 原生可导出的类型（经典 c:chartSpace 体系）。 */
export const EXPORTABLE_CHART_TYPES = Object.keys(CHART_META).filter((t) => CHART_META[t].route === "classic");

/** chartEx 扩展体系类型（PowerPoint 2016+ 新图表，cx: 命名空间）。 */
export const CHARTEX_TYPES = Object.keys(CHART_META).filter((t) => CHART_META[t].route === "chartex");

/** 1×1 透明 PNG（chartEx mc:Fallback 占位预览图）。 */
export const TINY_PNG = (() => {
  const b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(b64, "base64"));
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
})();
