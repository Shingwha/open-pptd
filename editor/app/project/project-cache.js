// ============================================================================
// project-cache.js — cross-session cache of PPTD project texts (Cache API)
// ----------------------------------------------------------------------------
// Gallery thumbnails and the editor load the same project (manifest +
// pages/*.page); these files rarely change after deploy, so they are worth
// caching across sessions: a second page open hits the cache, opening instantly
// and dropping dozens of network requests (the gallery even works offline).
//
// Cache key = app version + manifest content hash: a release (version change)
// invalidates everything automatically, so content that updates with the version
// (e.g. the examples migration) never hits a stale cache; a second open within
// the same version opens from cache instantly. The version comes from the repo
// root package.json (relatively locatable under Pages and local serve alike);
// on failure it degrades to "unknown" (stable key, still cacheable).
//
// Local serve (dev mode) sends Cache-Control: no-store for static files, so the
// browser does not cache and local dev always goes to the network, unaffected by
// this cache.
// ============================================================================

const CACHE_NAME = "open-pptd-projects-v2";
const KEY_PREFIX = "/__pptd_cache__/proj/"; // pure cache key (fake path, never actually requested)
const MAX_ENTRIES = 24;
const ROOT = new URL("../../../", import.meta.url).href; // this file lives in editor/app/project/, so ../../../ is the site root

let versionPromise = null;

/** App version (package.json version; a release changes it → all cache keys change → old caches auto-invalidate). */
function getAppVersion() {
  if (!versionPromise) {
    versionPromise = fetch(new URL("package.json", ROOT).href, { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (j && j.version ? String(j.version) : "unknown"))
      .catch(() => "unknown");
  }
  return versionPromise;
}

/** djb2 hash (only distinguishes content versions in the cache key; not security-related). */
export function hashText(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
}

/**
 * Fetch the manifest + page texts, with cross-session caching.
 * @param {string} manifestUrl absolute URL of deck.pptd
 * @param {(manifestText: string) => { pages?: string[] }} parseManifest
 *   parses the manifest into a page relative-path list (only called on a cache miss)
 * @returns {Promise<{ manifestText: string, pageTexts: Map<string,string>, missing?: number, fromCache: boolean }>}
 */
export async function fetchProjectTexts(manifestUrl, parseManifest) {
  const res = await fetch(manifestUrl);
  if (!res.ok) throw new Error(`加载失败 ${manifestUrl}: ${res.status}`);
  const manifestText = await res.text();
  const base = manifestUrl.slice(0, manifestUrl.lastIndexOf("/") + 1);
  // Local serve dev mode sends Cache-Control: no-store → go straight to the network, skipping the Cache API
  const localDev = (res.headers.get("cache-control") || "").includes("no-store");
  if (localDev) {
    const { pageTexts, missing } = await fetchPages(base, parseManifest(manifestText));
    return { manifestText, pageTexts, missing, fromCache: false };
  }
  const version = await getAppVersion();
  const cacheKey = `${location.origin}${KEY_PREFIX}${version}/${hashText(manifestText)}`;

  try {
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(cacheKey);
    if (hit) {
      const data = await hit.json();
      return { manifestText, pageTexts: new Map(data.pages), missing: 0, fromCache: true };
    }
    const { pageTexts, missing } = await fetchPages(base, parseManifest(manifestText));
    // Do not write the cache while pages are missing (avoids caching a partial project that keeps hitting the stale cache after pages land)
    if (missing === 0) {
      const body = JSON.stringify({ pages: [...pageTexts] });
      await cache.put(cacheKey, new Response(body, { headers: { "Content-Type": "application/json" } }));
      await prune(cache, cacheKey);
    }
    return { manifestText, pageTexts, missing, fromCache: false };
  } catch (err) {
    // Cache API unavailable (old browser/private mode/quota full): degrade to a direct fetch each time
    const { pageTexts, missing } = await fetchPages(base, parseManifest(manifestText));
    return { manifestText, pageTexts, missing, fromCache: false };
  }
}

async function fetchPages(base, manifest) {
  const rels = manifest.pages || [];
  // Fetch in parallel (sequential per-page RTT is the bulk of the cold-start blank);
  // 404 = mid-write, skip it (parseDeck handles it leniently, "show each page as it
  // lands"); other failures throw for the whole batch
  const fetched = await Promise.all(
    rels.map(async (rel) => {
      const url = base + rel;
      const res = await fetch(url);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`加载失败 ${url}: ${res.status}`);
      return [rel, await res.text()];
    })
  );
  const pageTexts = new Map();
  let missing = 0;
  for (const item of fetched) {
    if (item) pageTexts.set(item[0], item[1]);
    else missing += 1;
  }
  return { pageTexts, missing };
}

/** Bound the cache size: when the entry count exceeds the cap, drop every stale version except the current key (including historical version keys). */
async function prune(cache, keepKey) {
  const keys = await cache.keys();
  if (keys.length <= MAX_ENTRIES) return;
  for (const req of keys) {
    if (req.url.includes(keepKey)) continue;
    await cache.delete(req);
  }
}
