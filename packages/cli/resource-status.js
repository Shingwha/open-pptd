// ============================================================================
// cli/resource-status.js — resource readiness (three-level read + size consistency)
// ----------------------------------------------------------------------------
// The "✓/✗" rule (contract 5 concurrency-atomicity fix):
//   font ready = the file is found in a candidate root (home → package) **and** its
//   size matches the registry. existsSync alone would treat a half-downloaded TTF as
//   installed and only blow up at export — hence the size comparison.
// The registry (registry.json) is always read from the package (version-coupled) and
// is separate from the bytes dir, so this file reads the registry from PACKAGE_ROOT
// only; byte existence goes through paths.resolveResourceFile (three-level read).
// ============================================================================

import { readFileSync, statSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PACKAGE_ROOT, resourceRoots, resolveResourceFile } from "../paths.js";

/** Font registry dir inside the package (registry.json only). */
export const FONT_REGISTRY_DIR = join(PACKAGE_ROOT, "assets", "fonts");
/** Icon registry dir inside the package (registry.json only). */
export const ICON_REGISTRY_DIR = join(PACKAGE_ROOT, "assets", "icons");

/** Icon prefix ↔ classic SVG dir (same source as STYLE_DIRS in model/icon-fa.js). */
export const ICON_STYLES = { fas: "solid", far: "regular", fab: "brands" };

/** Package version (embedded in asset zip names). Missing/unreadable → "0.0.0". */
export function packageVersion() {
  try {
    return JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8")).version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/** Read the in-package font registry. */
export function readFontRegistry() {
  return JSON.parse(readFileSync(join(FONT_REGISTRY_DIR, "registry.json"), "utf8"));
}

/** Read the in-package icon registry. */
export function readIconRegistry() {
  return JSON.parse(readFileSync(join(ICON_REGISTRY_DIR, "registry.json"), "utf8"));
}

/** Is a single font's bytes ready (present **and** size matches the registry). */
export function fontFileReady(f) {
  if (!f?.file) return false;
  const p = resolveResourceFile("fonts", f.file);
  if (!p) return false;
  if (typeof f.size !== "number") return true; // registry declares no size → presence only
  try {
    return statSync(p).size === f.size;
  } catch {
    return false;
  }
}

/** Font readiness stats { ready, total }. */
export function fontReadyInfo(registry) {
  const fonts = registry?.fonts || [];
  return { ready: fonts.filter(fontFileReady).length, total: fonts.length };
}

/** Icon readiness: local SVG count per style dir, de-duplicated across candidate roots (home + package). */
export function iconReadyInfo(registry) {
  const per = {};
  let ready = 0;
  let total = 0;
  for (const [prefix, dir] of Object.entries(ICON_STYLES)) {
    const names = new Set();
    for (const root of resourceRoots.icons) {
      const d = join(root, dir);
      if (!existsSync(d)) continue;
      try {
        for (const f of readdirSync(d)) if (f.endsWith(".svg")) names.add(f);
      } catch { /* unreadable dir → skip that root */ }
    }
    const t = (registry?.icons || []).filter((i) => (i.styles || []).includes(prefix)).length;
    per[prefix] = { ready: names.size, total: t };
    ready += names.size;
    total += t;
  }
  return { ready, total, per };
}
