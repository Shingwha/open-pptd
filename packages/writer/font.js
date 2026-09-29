// ============================================================================
// writer/font.js — font embedding assembly (deck declarations → fntdata parts + XML registration)
// ----------------------------------------------------------------------------
// Flow: collectFontSpecs collects declarations (resource table + inline component slots) →
// loadFontBytes loads → fontToFntdata (fsType check / subsetting / EOT packaging) → emit fntdata
// parts + embeddedFontLst XML + font relationships. The 4 registrations happen in parts.js / pptx.js.
//
// Font byte sources (both ends):
//   - options.fontFiles[family]: preload cache (Node export layer / browser editor)
//   - spec.url: fetch (CDN, needs CORS; Node 18+ global fetch)
//   - spec.file: preloaded into fontFiles by the caller on Node only (cli/export.js)
// ============================================================================

import { parseFontInfo, checkEmbeddable, buildEot, subsetTtf } from "../model/font.js";
import { parseFontResources } from "../model/font.js";
import { loadFontRegistry, findFont, fontFileUrl } from "../model/font-registry.js";
import { escAttr } from "./xml.js";

/**
 * Collect embedded-font specs from deck.fonts (deduplicated by family):
 *   - font resource table entries (any key other than component slots, with file/url)
 *   - inline component-slot objects ({ family, file/url, subset })
 *   - object entries without file/url ({ family: <registry name> }): marked needRegistry and
 *     resolved by buildEmbeddedFonts through the registry (family/key) — a hit embeds
 *     automatically, a miss is skipped (treated as a system-font declaration)
 * Component-slot strings (system font names or resource keys) never produce an embed.
 */
export function collectFontSpecs(deck) {
  const fonts = deck?.fonts;
  if (!fonts || typeof fonts !== "object") return [];
  const specs = [];
  const seen = new Set();
  const push = (v) => {
    if (!v || typeof v !== "object") return;
    const family = v.family || v.name;
    if (!family || seen.has(family)) return;
    seen.add(family);
    specs.push({
      family,
      file: v.file || null,
      url: v.url || null,
      subset: v.subset == null ? null : !!v.subset, // null = not explicitly set, take the registry's advice
      needRegistry: !(v.file || v.url),
    });
  };
  for (const res of Object.values(parseFontResources(fonts))) push(res); // resource table (extended fields)
  return specs;
}

/**
 * Collect every text character in the deck (for subsetting).
 * Deep-walks whole pages (including notes) instead of enumerating by element type/field — text's
 * content.text, table top-level rows, chart data.cols/rows/title/series, and any future field
 * carrying text are all covered (enumerating by type used to miss table.rows / chart text and
 * subset-missing glyphs fell back per character to Microsoft YaHei).
 * Also collects an ASCII printable baseline: chart value labels / axis ticks are rendered by
 * PowerPoint from number formats without passing through any text field, so an all-Chinese deck's
 * subset would lack numeric punctuation.
 * subsetTtf safely skips characters absent from the font cmap, so over-collecting is harmless (slightly larger size).
 */
export function collectTextChars(deck) {
  const chars = new Set();
  for (let c = 0x20; c <= 0x7e; c++) chars.add(c); // ASCII baseline
  const seen = new Set();
  const walk = (v) => {
    if (typeof v === "string") {
      for (const ch of v) chars.add(ch.codePointAt(0));
    } else if (Array.isArray(v)) {
      v.forEach(walk);
    } else if (v && typeof v === "object") {
      if (seen.has(v)) return; // guard against cycles
      seen.add(v);
      Object.values(v).forEach(walk);
    }
  };
  for (const page of deck?.pages || []) walk(page);
  return chars;
}

/**
 * Load font bytes: fontFiles preload > library file (Node injects fs read / browser fetch) > url (fetch).
 * Returns null on failure.
 * options.fontDir: absolute assets/fonts path (Node side; the caller injects fs.readFileSync)
 * options.fs: { readFileSync } Node filesystem (without it, the browser fetches)
 */
export async function loadFontBytes(spec, options = {}) {
  if (options.fontFiles?.[spec.family]) return new Uint8Array(options.fontFiles[spec.family]);
  if (spec.file) {
    try {
      if (options.fontDir && options.fs?.readFileSync) {
        // Node: file always refers to a name inside the bundled font library (a registry resolution result; project-local custom fonts are unsupported)
        return new Uint8Array(options.fs.readFileSync(joinPath(options.fontDir, spec.file)));
      }
      const res = await fetch(fontFileUrl(spec.file));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    } catch (e) {
      console.warn(`[font] 字体库文件加载失败: ${spec.file}（${e.message}）`);
      spec.loadError = "file-missing";
      return null;
    }
  }
  if (spec.url) {
    try {
      const res = await fetch(spec.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    } catch (e) {
      console.warn(`[font] 网络字体拉取失败: ${spec.url}（${e.message}）`);
      spec.loadError = "fetch-failed";
      return null;
    }
  }
  return null;
}

/** Dependency-free path join (the Node side may also lack an injected path module). */
function joinPath(dir, file) {
  return `${dir.replace(/[\\/]+$/, "")}/${file.replace(/^[\\/]+/, "")}`;
}

/**
 * Single font → fntdata EOT bytes: subset (TrueType) or full (CFF fallback).
 * @returns {{ bytes: Uint8Array, subset: boolean, info: object }}
 */
export function fontToFntdata(bytes, chars, wantSubset) {
  const info = parseFontInfo(bytes);
  if (wantSubset) {
    try {
      const subset = subsetTtf(bytes, chars);
      return { bytes: buildEot(subset, parseFontInfo(subset), 0x1), subset: true, info };
    } catch (e) {
      console.warn(`[font] ${info.family} 子集化不可用（${e.message}），回退全量嵌入`);
    }
  }
  return { bytes: buildEot(bytes, info, 0), subset: false, info };
}

/** skipped reason → user-facing message. */
export function skipReasonText(r) {
  switch (r.reason) {
    case "not-in-registry":
      return `「${r.family}」未命中内置字体库且无 url，视为系统字体声明（不嵌入）；如需嵌入，请运行 open-pptd assets list 核对注册名`;
    case "registry-unavailable":
      return `「${r.family}」无法解析（字体注册表不可用），未嵌入`;
    case "file-missing":
      return `「${r.family}」字体库文件缺失，未嵌入 → 可运行 node bin/open-pptd.js fonts download ${r.family} 补下载`;
    case "fetch-failed":
      return `「${r.family}」网络字体拉取失败，未嵌入（检查 url 是否可达/CORS）`;
    case "restricted":
      return `「${r.family}」嵌入权限受限（fsType Restricted），未嵌入`;
    default:
      return `「${r.family}」嵌入失败（${r.detail || r.reason}），未嵌入`;
  }
}

/**
 * Assemble embedded fonts: collect → load → validate → subset/EOT → parts + XML fragments.
 * @param {object} options embedFonts=false skips embedding (declarations kept, this export only);
 *   fullFonts=true embeds every font in full (overriding deck.fonts / registry subset advice for
 *   this export only, never written back — PowerPoint's "embed all characters (for editing)")
 * @returns {Promise<{ parts: {path,bytes}[], lstXml: string, rels: {id,target}[],
 *                     subsetMode: boolean, skipped: {family,reason,detail?}[] }>}}
 */
export async function buildEmbeddedFonts(deck, options = {}) {
  const empty = { parts: [], lstXml: "", rels: [], subsetMode: false, skipped: [] };
  if (options.embedFonts === false) return empty;
  const specs = collectFontSpecs(deck);
  if (!specs.length) return empty;

  const skipped = [];
  // Registry resolution: specs without file/url look up the registry by family/key to fill in a
  // library file automatically; a miss is a system-font declaration and is skipped (same when the
  // registry fails to load).
  if (specs.some((s) => s.needRegistry)) {
    let registry = null;
    try {
      registry = await loadFontRegistry(options);
    } catch (e) {
      console.warn(`[font] 字体注册表不可用（${e.message}），注册表引用字体将不嵌入`);
    }
    for (const spec of specs) {
      if (!spec.needRegistry) continue;
      const hit = registry && findFont(registry, spec.family);
      if (!hit) {
        spec.skip = true;
        spec.skipReason = registry ? "not-in-registry" : "registry-unavailable";
        continue;
      }
      spec.file = hit.file;
      if (spec.subset == null) spec.subset = hit.subset !== false;
    }
  }

  const charText = [...collectTextChars(deck)].map((c) => String.fromCodePoint(c)).join("");
  const parts = [];
  const rels = [];
  const lstItems = [];
  let subsetMode = false;

  for (const spec of specs) {
    if (spec.skip) {
      skipped.push({ family: spec.family, reason: spec.skipReason });
      continue;
    }
    const bytes = await loadFontBytes(spec, options);
    if (!bytes) {
      skipped.push({ family: spec.family, reason: spec.loadError || "load-failed" });
      continue;
    }
    let result;
    try {
      result = fontToFntdata(bytes, charText, options.fullFonts ? false : spec.subset);
    } catch (e) {
      console.warn(`[font] 字体「${spec.family}」嵌入失败: ${e.message}`);
      skipped.push({ family: spec.family, reason: "embed-failed", detail: e.message });
      continue;
    }
    const check = checkEmbeddable(result.info.fsType);
    if (!check.ok) {
      console.warn(`[font] 跳过「${spec.family}」: ${check.reason}`);
      skipped.push({ family: spec.family, reason: "restricted" });
      continue;
    }
    if (spec.family !== result.info.family) {
      // A declared family name that differs from the font's registered name (name table ID16 preferred / ID1 fallback) would mismatch when a page references the declared name
      console.warn(
        `[font] 声明族名「${spec.family}」与字体注册名「${result.info.family}」不一致：` +
        `页面 fontFamily 请引用注册名「${result.info.family}」，否则 PowerPoint 不认嵌入字体`
      );
    }
    const n = parts.length + 1;
    parts.push({ path: `ppt/fonts/font${n}.fntdata`, bytes: result.bytes });
    rels.push({ id: `rIdFont${n}`, target: `fonts/font${n}.fntdata` });
    // A single-file family = that family's only face → register it into all four style slots (same
    // rId, zero duplicate bytes). Picking one slot from OS/2 metadata leaves the others absent: on a
    // viewer without the font, a run with the matching (bold, italic) combination finds no slot and
    // is silently substituted. Child order is the fixed CT_EmbeddedFontListEntry sequence.
    lstItems.push(
      `<p:embeddedFont><p:font typeface="${escAttr(result.info.family)}"/>` +
      ["regular", "bold", "italic", "boldItalic"]
        .map((s) => `<p:${s} r:id="rIdFont${n}"/>`)
        .join("") +
      `</p:embeddedFont>`
    );
    if (result.subset) subsetMode = true;
    console.log(`[font] 嵌入 ${result.info.family}（全样式槽）: ${bytes.length}B → ${result.bytes.length}B${result.subset ? "（子集化）" : ""}`);
  }
  return {
    parts,
    lstXml: lstItems.length ? `<p:embeddedFontLst>${lstItems.join("")}</p:embeddedFontLst>` : "",
    rels,
    subsetMode,
    skipped,
  };
}
