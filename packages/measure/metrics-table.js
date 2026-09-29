// ============================================================================
// measure/metrics-table.js — font metrics table reader (backed by metrics-data.json)
// ----------------------------------------------------------------------------
// Pure functions, dual-end (no fs/window/document). Lookup chain (fallback ladder):
//   built-in table (family/key/alias normalized) → system font constants → 1.2 final fallback (records diagnostics)
// Exposes createMetricsTable(data?) plus the default singleton (loaded from the package's metrics-data.json).
// ============================================================================

import data from "./metrics-data.json" with { type: "json" };

/** Normalize a metrics name (lowercase + strip whitespace). */
export const metricKey = (name) => String(name).toLowerCase().replace(/\s+/g, "");

const FINAL_FALLBACK = Object.freeze({
  lineFactor: 1.2,
  ascent: 1.0,
  descent: 0.22,
  lineGap: 0,
  cjkWidth: 1.0,
  latinWidth: 0.5,
  estimated: true,
  source: "default",
  family: null,
});

/**
 * Create a metrics table instance (custom data can be injected; defaults to the package metrics-data.json).
 * @returns {{
 *   safetyFactor: number,
 *   has(name): boolean,
 *   metricsFor(nameOrNames): object,
 *   takeDiagnostics(): Array<{name,reason}>,
 * }}
 */
export function createMetricsTable(raw = data) {
  const registry = raw.registryFonts || {};
  const system = raw.systemFonts || {};
  const lookup = raw.lookup || {};
  const defaultFamily = raw.defaultFallbackFamily || null;
  const diagnostics = [];
  const seenMissing = new Set();

  const entryOf = (family) => registry[metricKey(family)] || system[metricKey(family)] || null;

  function pick(name) {
    const fam = lookup[metricKey(name)];
    if (fam) {
      const e = entryOf(fam);
      if (e) return { ...e, family: e.family || fam, resolvedFrom: name };
    }
    return null;
  }

  return {
    safetyFactor: typeof raw.safetyFactor === "number" ? raw.safetyFactor : 1.06,
    has(name) {
      return !!pick(name);
    },
    /**
     * Look up font metrics. Accepts a single name or a [latin, ea] array (tried in order, first hit wins).
     * All miss → default font constants → final 1.2 fallback (records one diagnostic, never silent).
     */
    metricsFor(nameOrNames) {
      const list = (Array.isArray(nameOrNames) ? nameOrNames : [nameOrNames]).filter(
        (n) => typeof n === "string" && n
      );
      for (const n of list) {
        const hit = pick(n);
        if (hit) return hit;
      }
      // Tier 2: system font constants / default font constants
      const fallback = defaultFamily ? entryOf(defaultFamily) : null;
      const missName = list[0] || "(unknown)";
      if (!seenMissing.has(missName)) {
        seenMissing.add(missName);
        diagnostics.push({
          name: missName,
          reason: fallback ? "not-in-table" : "table-empty",
          detail: fallback ? `未命中度量表，用系统常量「${defaultFamily}」兜底` : "度量表不可用，用 1.2 兜底",
        });
      }
      if (fallback) return { ...fallback, resolvedFrom: missName, fallback: true };
      // Tier 3: final 1.2 fallback
      return { ...FINAL_FALLBACK, resolvedFrom: missName, fallback: true };
    },
    takeDiagnostics() {
      const out = diagnostics.slice();
      diagnostics.length = 0;
      return out;
    },
    diagnosticCount() {
      return diagnostics.length;
    },
  };
}

/** Default singleton (the in-package metrics table). */
export const defaultMetricsTable = createMetricsTable();

/** Metrics data version (for snapshots/diagnostics). */
export const METRICS_VERSION = data.version;
