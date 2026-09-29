// ============================================================================
// model/font-registry.js — built-in font library registry (browser + Node)
// ----------------------------------------------------------------------------
// Data source: assets/fonts/registry.json (the skill resource folder, not uploaded to GitHub).
// Per font: key (display name) / family (embed registration name, ID16 preferred) /
//           file (in-library file name) / url (origin download) / license / subset advice.
// registry.systemFonts: system font reference list (no file/url, declared but not embedded;
//           relies on the opening side having it installed; used to align registration names
//           and for CLI check recognition).
//
// Uses:
//   - writer/font.js: when a deck.fonts resource entry is written as {family: X} (no
//     file/url), a family or key hit in the registry auto-fills the library file and embeds
//     it (subset by default)
//   - editor font panel: lists the built-in library (✓ loaded / ✗ not loaded) for one-click use
//   - CLI fonts list/download: registry overview + supplementary download
// ============================================================================

// Repo root URL (this file lives at <root>/packages/model/, so ../../ is the site root — works
// both locally and under a GitHub Pages subpath)
const ROOT = new URL("../../", import.meta.url).href;

let cached = null;

/**
 * Load the registry (browser + Node).
 * @param {object} [options]
 * @param {string} [options.registryUrl] browser: registry URL (defaults to assets/fonts/registry.json relative to the repo root)
 * @param {string} [options.fontDir]     Node: absolute font directory path
 * @param {string} [options.registryDir] Node: registry directory override (once resources are
 *                                       externalized the registry stays in the package and may
 *                                       be separate from the font directory; falls back to fontDir)
 * @returns {Promise<{version:number, fonts:object[]}>}
 */
export async function loadFontRegistry(options = {}) {
  if (cached) return cached;
  // Node: fontDir (absolute font directory path) + injected fs -> read the file directly
  if (options.fontDir && options.fs?.readFileSync) {
    const { join } = await import("path");
    const dir = options.registryDir || options.fontDir;
    cached = JSON.parse(options.fs.readFileSync(join(dir, "registry.json"), "utf8"));
    return cached;
  }
  if (options.registryUrl || typeof fetch === "function") {
    const url = options.registryUrl || new URL("assets/fonts/registry.json", ROOT).href;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`字体注册表加载失败: HTTP ${res.status}`);
    cached = await res.json();
    return cached;
  }
  throw new Error("无法加载字体注册表（需 registryUrl 或 fontDir）");
}

/**
 * Look up the registry by family (registration name, exact match), key (display name) or
 * aliases (the font's internal name, for entries whose internal name differs from the
 * registration name, e.g. zcoolqingkehuangyouti whose bytes come from Google Fonts and
 * whose internal name is "ZCOOL QingKe HuangYou").
 * @param {object} registry loadFontRegistry return value
 * @param {string} ref
 * @returns {object|undefined}
 */
export function findFont(registry, ref) {
  if (!registry?.fonts?.length) return undefined;
  return registry.fonts.find(
    (f) => f.family === ref || f.key === ref || f.aliases?.includes(ref)
  );
}

/** In-library file URL (browser side, relative to the repo root — correct for both local serve and a GitHub Pages subpath). */
export function fontFileUrl(file) {
  return new URL(`assets/fonts/${encodeURIComponent(file)}`, ROOT).href;
}

// ----------------------------------------------------------------------------
// Font byte fetching: local library file first -> online sources as fallback (the registry's
// url primary source + mirrors)
//   - local serve: a file exists in assets/fonts/ -> read locally (fast, works offline)
//   - online Pages: the repo has no font files uploaded -> fetch from raw.githubusercontent /
//     jsDelivr (both allow CORS; FontFace registers from bytes and is not subject to the
//     cross-origin restriction)
//   - fetched bytes go into the Cache API for cross-session caching, so repeat visits make no
//     network request
//   - the cache key carries the registry size as a fingerprint: when upstream bytes change
//     (e.g. the v1.3.3 butter font source swap) the old cache is invalidated automatically,
//     preventing bad bytes from being cached forever (the v1 cache was abandoned for this reason)
// ----------------------------------------------------------------------------
const FONT_CACHE_NAME = "open-pptd-fonts-v2";

async function readCachedFont(key) {
  try {
    const cache = await caches.open(FONT_CACHE_NAME);
    const res = await cache.match(key);
    return res ? new Uint8Array(await res.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

async function writeFontCache(key, bytes) {
  try {
    const cache = await caches.open(FONT_CACHE_NAME);
    await cache.put(key, new Response(bytes));
  } catch {
    /* cache unavailable (private mode etc.) -> ignore */
  }
}

/**
 * Fetch font bytes (browser side): Cache API -> local library file -> online primary source -> mirrors.
 * @param {object} hit registry font entry (with file/url/mirrors)
 * @returns {Promise<Uint8Array|null>} null when everything fails (the caller falls back to a system font)
 */
export async function fetchFontBytes(hit) {
  if (!hit?.file) return null;
  // Cache key = absolute repo-root URL + size fingerprint: the gallery (/) and the editor
  // (/editor/) share one cache; the local fetch still uses the plain file URL (?v= is only a
  // cache key and is not part of the request)
  const fileUrl = fontFileUrl(hit.file);
  const cacheKey = `${fileUrl}?v=${typeof hit.size === "number" ? hit.size : hit.file}`;
  const cached = await readCachedFont(cacheKey);
  if (cached) return cached;
  try {
    const res = await fetch(fileUrl);
    if (res.ok) {
      const bytes = new Uint8Array(await res.arrayBuffer());
      writeFontCache(cacheKey, bytes);
      return bytes;
    }
  } catch {
    /* network error -> online sources */
  }
  const sources = [hit.url, ...(hit.mirrors || [])].filter(Boolean);
  for (const src of sources) {
    try {
      const res = await fetch(src);
      if (!res.ok) continue;
      const bytes = new Uint8Array(await res.arrayBuffer());
      writeFontCache(cacheKey, bytes);
      return bytes;
    } catch {
      /* try the next source */
    }
  }
  return null;
}

/**
 * Look up the system font list by family (registration name, exact match) or key (display name, exact match).
 * A system font has no bytes: a hit only means "the registration name is correct, it is
 * declared but not embedded" and produces no embedding.
 * @param {object} registry loadFontRegistry return value
 * @param {string} ref
 * @returns {object|undefined}
 */
export function findSystemFont(registry, ref) {
  if (!registry?.systemFonts?.length) return undefined;
  return registry.systemFonts.find((f) => f.family === ref || f.key === ref);
}
