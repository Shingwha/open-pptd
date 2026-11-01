// editor/app/project/icons.js — FA icon preload and on-demand loading
// state.iconMap: { [rawIconName]: {inner, w, h} } is the normalizeIconSvg product
// shared by the render side (paint ctx iconMap) and export (iconDefs). Each instance
// owns its map; only the registry fetch is shared (read-only, deduped by raw name).

import { fetchIconSvg, loadIconRegistry, normalizeIconSvg, resolveIconName } from "../../../packages/model/index.js";

let registryPromise = null;
const pending = new Map(); // raw → Promise (dedupes concurrent requests)

/** Registry (singleton promise). */
export function getIconRegistry() {
  if (!registryPromise) registryPromise = loadIconRegistry();
  return registryPromise;
}

/** Fetch a single icon into `map` (a cache hit returns immediately; failure logs console.warn and returns null). */
export async function ensureIcon(raw, map) {
  if (!raw || !map) return null;
  if (map[raw]?.inner) return map[raw];
  if (pending.has(raw)) return pending.get(raw);
  const p = (async () => {
    try {
      const reg = await getIconRegistry();
      const hit = resolveIconName(raw, reg);
      if (!hit) return null;
      const text = await fetchIconSvg(hit, reg);
      const def = text ? normalizeIconSvg(text, hit) : null;
      if (def) map[raw] = def;
      return def;
    } catch (err) {
      console.warn(`[icons] ${raw} 加载失败:`, err?.message || err);
      return null;
    } finally {
      pending.delete(raw);
    }
  })();
  pending.set(raw, p);
  return p;
}

/** Preload a whole set of pages (called after loader finishLoad / live-reload; existing entries are skipped).
 *  Every caller passes its own instance cache map. */
export async function preloadIcons(pages, map) {
  if (!map || !Array.isArray(pages)) return;
  const names = new Set();
  const walk = (el) => {
    if (el?.elementType === "icon" && el.iconName) names.add(el.iconName);
    for (const child of el?.elements || []) walk(child);
  };
  for (const page of pages) for (const el of page?.elements || []) walk(el);
  await Promise.all([...names].map((raw) => ensureIcon(raw, map)));
}
