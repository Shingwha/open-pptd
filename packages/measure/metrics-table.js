// ============================================================================
// measure/metrics-table.js — 字体度量表读取（T1 产物 metrics-data.json）
// ----------------------------------------------------------------------------
// 纯函数、双端（无 fs/window/document）。查表链（方案 §3.1 fallback 阶梯）：
//   内置度量表（family/key/alias 归一）→ 系统字体常量 → 1.2 兜底（并记 diagnostics）
// 提供 createMetricsTable(data?) 与默认单例（读入包的 metrics-data.json）。
// ============================================================================

import data from "./metrics-data.json" with { type: "json" };

/** 度量名归一（与 model/font.js#fontKey 同规则：小写 + 去空白）。 */
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
 * 创建度量表实例（可注入自定义 data，缺省用包内 metrics-data.json）。
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
     * 查字体度量。接受单个名字或 [latin, ea] 数组（逐个尝试，首个命中胜出）。
     * 全未命中 → 默认字体常量 → 最终 1.2 兜底（记一条 diagnostics，不静默）。
     */
    metricsFor(nameOrNames) {
      const list = (Array.isArray(nameOrNames) ? nameOrNames : [nameOrNames]).filter(
        (n) => typeof n === "string" && n
      );
      for (const n of list) {
        const hit = pick(n);
        if (hit) return hit;
      }
      // 阶梯 2：系统字体常量 / 默认字体常量
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
      // 阶梯 3：最终 1.2
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

/** 默认单例（包内度量表）。 */
export const defaultMetricsTable = createMetricsTable();

/** 度量数据版本（便于快照/诊断）。 */
export const METRICS_VERSION = data.version;
