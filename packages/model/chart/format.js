// ============================================================================
// model/chart/format.js — chart number formatting (the sole interpreter of the official numberFormat vocabulary)
// ----------------------------------------------------------------------------
// Shared by preview label/axis formatters and SSR rasterization; native writer export
// does not go through this module (the formatCode is passed through for PowerPoint's
// native parser).
// ============================================================================

/** Full numberFormat code set (vocabulary anchor for the editor dropdown; display text lives on the editor side). */
export const NUMBER_FORMAT_CODES = ["", "0", "0.0", "0%", "0.0%", "#,##0", "0.0E+00"];

/** formatCode -> display string (official vocabulary default = rounded integer). */
export function formatChartValue(v, format) {
  const n = Number(v);
  if (Number.isNaN(n)) return String(v ?? "");
  if (format === "0%") return `${Math.round(n * 100)}%`;
  if (format === "0.0%") return `${(n * 100).toFixed(1)}%`;
  if (/^0\.0+$/.test(format)) return n.toFixed(format.length - 2);
  if (format === "0.0E+00") return n.toExponential(1);
  if (format === "#,##0") return n.toLocaleString("en-US");
  return String(Math.round(n));
}
