// ============================================================================
// writer/chart/types.js — chartEx fallback placeholder image
// ----------------------------------------------------------------------------
// Chart-type grouping has a single source in CHART_META.route (model); this file caches no derived list.
// ============================================================================

/** 1×1 transparent PNG (chartEx mc:Fallback placeholder preview). */
export const TINY_PNG = (() => {
  const b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(b64, "base64"));
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
})();
