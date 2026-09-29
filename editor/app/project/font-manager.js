// ============================================================================
// app/project/font-manager.js — editor font library (local files / remote URLs / built-in registry)
// ----------------------------------------------------------------------------
// Responsibilities:
//   - add fonts (<input type=file> bytes / fetch URL / built-in registry) → parseFontInfo
//     name → FontFace registration (preview takes effect immediately, renderer CSS font-family matches)
//   - remove / embed checkbox / subset checkbox
//   - sync to the deck.fonts resource table on save (key = family, with file/url/subset)
//   - restore from the resource table on load: url fonts are fetched and registered
//     automatically; file fonts wait for the user to re-pick them
//   - on export build options.fontFiles from the embed checkboxes
// The management UI (popover) lives in interaction/font-panel.js; this module is data only.
//
// PPTD format (see references/pptd.md):
//   fonts:
//     <slot-key>: { family: <registry-family>, file: fonts/xxx.ttf, subset: true }   # resource table
//     title: <slot-key>                                                              # component slot reference
// ============================================================================

import { showToast } from "../toast.js";
import {
  fetchFontBytes,
  findFont,
  loadFontRegistry,
  parseFontInfo,
  parseFontResources,
} from "../../../packages/model/index.js";
import { safeFileName } from "../../../packages/writer/index.js";

/** System font pool (design.md §4; fallback options for the element fontFamily dropdown). */
export const SYSTEM_FONTS = ["Microsoft YaHei", "KaiTi", "SimSun", "SimHei", "FangSong", "YouYuan"];

/**
 * Registry font → fetch bytes + register FontFace (stateless, shared by the
 * gallery and the editor): the local library file wins, the remote source is the
 * fallback. Returns { hit, bytes }; returns null when the registry has no match
 * or the bytes are unavailable (the caller falls back to a system font).
 */
export async function registerRegistryFontFace(keyOrFamily) {
  const registry = await loadFontRegistry();
  const hit = findFont(registry, keyOrFamily);
  if (!hit) return null;
  const bytes = await fetchFontBytes(hit);
  if (!bytes) return null;
  const face = new FontFace(hit.family, bytes);
  await face.load();
  document.fonts.add(face);
  return { hit, bytes };
}

export function createFontManager(state) {
  /** FontFace registration: family must match the renderer CSS font-family exactly (parseFontInfo reads the name table). */
  async function registerFace(family, bytes) {
    const face = new FontFace(family, bytes);
    await face.load();
    document.fonts.add(face);
  }

  /** Add a local font file → returns family; throws on failure. */
  async function addLocalFile(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const info = parseFontInfo(bytes);
    await registerFace(info.family, bytes);
    state.fontLibrary[info.family] = {
      bytes, source: "local", file: null, url: null,
      subset: true, embed: true, size: bytes.length,
    };
    return info.family;
  }

  /** Add a remote font URL → returns family; throws on failure. */
  async function addUrl(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const info = parseFontInfo(bytes);
    await registerFace(info.family, bytes);
    state.fontLibrary[info.family] = {
      bytes, source: "url", file: null, url,
      subset: true, embed: true, size: bytes.length,
    };
    return info.family;
  }

  /** Built-in font library: load a registry font from assets/fonts/ → register FontFace + add to the library. */
  async function addRegistryFont(keyOrFamily) {
    const registry = await loadFontRegistry();
    const hit = findFont(registry, keyOrFamily);
    if (!hit) throw new Error(`注册表未找到: ${keyOrFamily}`);
    if (state.fontLibrary[hit.family]) return hit.family; // already loaded
    const bytes = await fetchFontBytes(hit);
    if (!bytes) throw new Error(`字体文件不可用: ${hit.family}（本地缺失且线上源不可达）`);
    const info = parseFontInfo(bytes);
    await registerFace(info.family, bytes);
    state.fontLibrary[info.family] = {
      bytes, source: "registry", file: hit.file, url: null,
      subset: true, embed: true, size: bytes.length,
    };
    return info.family;
  }

  /** Reload a local file into an existing entry (when a file font has no bytes after opening the project). */
  async function reloadLocalFile(family, file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const info = parseFontInfo(bytes);
    await registerFace(info.family, bytes);
    const prev = state.fontLibrary[family] || {};
    state.fontLibrary[family] = { ...prev, bytes, source: "local", size: bytes.length };
  }

  function removeFont(family) {
    delete state.fontLibrary[family];
  }

  /** Export: bytes of the embed-checked fonts (key = family). */
  function exportFontFiles() {
    const files = {};
    for (const [family, f] of Object.entries(state.fontLibrary)) {
      if (f.embed && f.bytes) files[family] = f.bytes;
    }
    return files;
  }

  /** Element fontFamily dropdown options: resource-table keys + library fonts + system font pool. */
  function fontOptions() {
    const opts = [["", "默认"]];
    for (const [key] of Object.entries(state.theme?.fontResources || {})) {
      opts.push([key, `${key}（资源）`]);
    }
    for (const family of Object.keys(state.fontLibrary)) {
      if (!opts.some(([v]) => v === family)) opts.push([family, `${family}（已嵌入）`]);
    }
    for (const f of SYSTEM_FONTS) {
      if (!opts.some(([v]) => v === f)) opts.push([f, f]);
    }
    return opts;
  }

  /** Save project: embed-checked fonts → deck.fonts resource table (key = family).
   *  Registry fonts only write {family, subset} (no file/url; export pulls the glyphs
   *  from the built-in library); url fonts write url; local files write file (usable
   *  only inside the editor — CLI export needs a registry entry or a url). */
  function syncToDeck() {
    const fonts = state.deck.fonts || (state.deck.fonts = {});
    // The resource table only keeps valid declarations (object + family field); clean v1 component slots (string values) and other junk
    for (const key of Object.keys(fonts)) {
      const v = fonts[key];
      if (!v || typeof v !== "object" || !(v.family || v.name)) delete fonts[key];
    }
    for (const [family, f] of Object.entries(state.fontLibrary)) {
      if (!f.embed) continue;
      const entry = { family, subset: !!f.subset };
      if (f.source === "url" && f.url) entry.url = f.url;
      else if (f.source === "local") entry.file = f.file || `fonts/${safeFileName(family)}.ttf`;
      fonts[family] = entry;
    }
  }

  /** Load project: restore library entries from deck.fonts (url fetched automatically; registry families loaded from the built-in library; file fonts await re-pick). */
  async function restoreFromDeck() {
    const resources = parseFontResources(state.deck?.fonts);
    let registry = null;
    try {
      registry = await loadFontRegistry();
    } catch {
      /* when the registry is unavailable, registry-referenced fonts skip auto-loading */
    }
    for (const [key, res] of Object.entries(resources)) {
      const family = res.family || key;
      if (state.fontLibrary[family]) continue;
      const entry = { source: res.url ? "url" : "local", url: res.url, file: res.file, subset: res.subset, embed: true, bytes: null, size: 0 };
      state.fontLibrary[family] = entry;
      if (res.url) {
        try {
          const bytes = new Uint8Array(await (await fetch(res.url)).arrayBuffer());
          await registerFace(family, bytes);
          entry.bytes = bytes;
          entry.size = bytes.length;
        } catch {
          showToast(`网络字体加载失败: ${family}`, "danger");
        }
      } else if (registry) {
        // Registry reference ({family: <registry-name>}): auto-load the preview from the built-in library (remote fallback when the local file is missing)
        const hit = findFont(registry, family);
        if (!hit) continue; // not a registry reference (a file font): wait for the user to re-pick the local file
        try {
          const bytes = await fetchFontBytes(hit);
          if (!bytes) throw new Error("字体字节不可用");
          await registerFace(family, bytes);
          entry.bytes = bytes;
          entry.source = "registry";
          entry.size = bytes.length;
        } catch {
          showToast(`内置字体加载失败: ${family}`, "danger");
        }
      }
    }
  }

  return {
    registerFace, addLocalFile, addUrl, addRegistryFont, reloadLocalFile, removeFont,
    exportFontFiles, fontOptions, syncToDeck, restoreFromDeck,
  };
}
