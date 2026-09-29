// ============================================================================
// writer/chart/types.js — 图表导出体系分组与 chartEx 占位图
// ----------------------------------------------------------------------------
// 类型分组单源是 CHART_META.route（model 路由单源），本文件不再缓存派生清单。
// ============================================================================

/** 1×1 透明 PNG（chartEx mc:Fallback 占位预览图）。 */
export const TINY_PNG = (() => {
  const b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(b64, "base64"));
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
})();
