// ============================================================================
// measure/adapters/dom.js — 浏览器离屏批量测量适配器（接口桩，M6 接线）
// ----------------------------------------------------------------------------
// 定位：编辑器内对变更元素做离屏 DOM 实测，精修 fontMetricsMeasure 的纯函数残差；
// 结果存 layout 缓存，**不进模型**（三铁律之「模型永不写回」）。
//
// 本波次（RP-A / M1）只留接口桩：真实实现需 DOM（getBoundingClientRect /
// scrollHeight），会把 document. 带进 measure 包，故单独放 adapters/ 且在
// **RP-C 编辑器适配波次**接线；在此之前 fontMetricsMeasure 是唯一默认实现。
// 注意：本文件不 import 任何 DOM 全局，避免污染 measure 的静态纯净扫描。
// ============================================================================

/** 适配器不可用原因（诊断文案）。 */
export const DOM_MEASURE_UNAVAILABLE = "domMeasure 未接线（RP-C / M6）：本波次仅接口桩，默认用 fontMetricsMeasure";

/**
 * 创建 DOM 精修适配器（未实现 → 抛错，调用方应回退 fontMetricsMeasure）。
 * @throws {Error} 恒抛（本波次桩）
 */
export function createDomMeasure() {
  throw new Error(DOM_MEASURE_UNAVAILABLE);
}

/** 是否为可用适配器：桩恒 false（调用方据此回退纯函数）。 */
export function isDomMeasureAvailable() {
  return false;
}
