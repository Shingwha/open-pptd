// ============================================================================
// measure/adapters/dom.js — browser offscreen batch-measurement adapter (interface stub, not wired yet)
// ----------------------------------------------------------------------------
// Role: in the editor, measure changed elements offscreen to refine the residual error of the
// deterministic fontMetricsMeasure. Results go into the layout cache and never into the model
// (the "model is never written back" invariant).
//
// This batch keeps only the interface stub: a real implementation needs the DOM
// (getBoundingClientRect / scrollHeight), which would bring document. into the measure package,
// so it lives in adapters/ and will be wired in a later editor-adaptation batch. Until then
// fontMetricsMeasure is the only default implementation.
// Note: this file imports no DOM global, keeping measure's static purity scan clean.
// ============================================================================

/** Reason the adapter is unavailable (diagnostic message). */
export const DOM_MEASURE_UNAVAILABLE = "domMeasure 未接线（RP-C / M6）：本波次仅接口桩，默认用 fontMetricsMeasure";

/**
 * Create the DOM refinement adapter (unimplemented → throws; callers should fall back to fontMetricsMeasure).
 * @throws {Error} always (stub in this batch)
 */
export function createDomMeasure() {
  throw new Error(DOM_MEASURE_UNAVAILABLE);
}

/** Whether a usable adapter exists: the stub is always false (callers fall back to the pure functions). */
export function isDomMeasureAvailable() {
  return false;
}
