// ============================================================================
// cli/resource-status.js — resource readiness (three-level read + sfnt header check)
// ----------------------------------------------------------------------------
// The "✓/✗" rule:
//   font ready = the file is found in a candidate root (home → package) **and**
//   starts with a valid sfnt magic. Atomic downloads (tmp → rename) never expose a
//   partial file, so a byte-length comparison against the registry is unnecessary
//   and fragile: the registry `size` is a generation-time snapshot, while upstream
//   re-releases change the length of an otherwise valid font. Export still parses
//   the font when embedding, which is the authoritative integrity gate.
// The registry (registry.json) is always read from the package (version-coupled) and
// is separate from the bytes dir, so this file reads the registry from PACKAGE_ROOT
// only; byte existence goes through paths.resolveResourceFile (three-level read).
// ============================================================================

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PACKAGE_ROOT, resourceRoots, resolveResourceFile, FONT_REGISTRY_DIR, ICON_REGISTRY_DIR } from "../paths.js";
import { isSfntMagic, readFontMagic } from "./font-file.js";

// In-package registry dirs (registry.json only) are single-sourced in packages/paths.js;
// re-exported here so existing deep importers keep working.
export { FONT_REGISTRY_DIR, ICON_REGISTRY_DIR };

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

/** Is a single font's bytes ready (present **and** a valid sfnt header). */
export function fontFileReady(f) {
  if (!f?.file) return false;
  const p = resolveResourceFile("fonts", f.file);
  if (!p) return false;
  return isSfntMagic(readFontMagic(p));
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
