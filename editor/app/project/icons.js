// ============================================================================
// app/project/icons.js — FA icon preload and on-demand loading (same pattern as images.js imageMap)
// ----------------------------------------------------------------------------
// state.iconMap: { [rawIconName]: {inner, w, h} } (the normalizeIconSvg product).
// The render side (renderer/icon.js via renderPage opts.iconMap) and the export
// side (saver → buildPptx options.iconDefs) share this one cache.
//
// Module-level singleton (single editor instance): bindIconMap(state.iconMap) is
// called once during io assembly; preloadIcons(deck.pages) preloads every icon
// after the deck loads (live-reload fills in new ones); ensureIcon(raw) fetches a
// single icon on demand for pickers/newly added elements.
// ============================================================================

import { fetchIconSvg, loadIconRegistry, normalizeIconSvg, resolveIconName } from "../../../packages/model/index.js";

let iconMap = null; // valid after bindIconMap (= state.iconMap)
let registryPromise = null;
let registrySync = null; // synchronous snapshot once getIconRegistry resolves
const pending = new Map(); // raw → Promise (dedupes concurrent requests)

/** Bind the render cache map (called once during io.js assembly). */
export function bindIconMap(map) {
  iconMap = map;
}

/** Registry (singleton promise; a synchronous snapshot is available once it resolves). */
export function getIconRegistry() {
  if (!registryPromise) {
    registryPromise = loadIconRegistry().then((reg) => {
      registrySync = reg;
      return reg;
    });
  }
  return registryPromise;
}

/** Synchronous registry snapshot (the object once loaded, null before; for best-effort cases like props hints). */
export function getIconRegistrySync() {
  return registrySync;
}

/** Fetch a single icon (a cache hit returns immediately; failure logs console.warn and returns null). map defaults to the bound map. */
export async function ensureIcon(raw, map = iconMap) {
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
 *  Callers without editor state, such as the gallery, pass an explicit map. */
export async function preloadIcons(pages, map = iconMap) {
  if (!map || !Array.isArray(pages)) return;
  const names = new Set();
  const walk = (el) => {
    if (el?.elementType === "icon" && el.iconName) names.add(el.iconName);
    for (const child of el?.elements || []) walk(child);
  };
  for (const page of pages) for (const el of page?.elements || []) walk(el);
  await Promise.all([...names].map((raw) => ensureIcon(raw, map)));
}

/**
 * Icon catalog query (shared by the picker dialog and the add panel): keyword +
 * category filter, expanded by style (far and fas listed as two selectable
 * entries). q matches name/label/aliases/search terms.
 * @returns {{entries: Array<{raw,name,prefix,label}>, total: number}} total is the icon count after filtering (before expansion)
 */
export function queryIconEntries(registry, { q = "", cat = null, cap = Infinity } = {}) {
  const kw = String(q || "").trim().toLowerCase();
  const match = (e) => {
    if (!kw) return true;
    return (
      e.name.includes(kw) ||
      (e.label && String(e.label).toLowerCase().includes(kw)) ||
      (e.aliases || []).some((a) => a.includes(kw)) ||
      (e.terms || []).some((t) => String(t).toLowerCase().includes(kw))
    );
  };
  const icons = registry.icons.filter((i) => (!cat || i.cat === cat) && match(i));
  const entries = [];
  for (const e of icons) {
    for (const prefix of e.styles) {
      entries.push({ raw: `${prefix}:${e.name}`, name: e.name, prefix, label: e.label || e.name });
      if (entries.length >= cap) return { entries, total: icons.length };
    }
  }
  return { entries, total: icons.length };
}
