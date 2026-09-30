// ============================================================================
// app/project/images.js — image resources: preload / map rebuild / dataURL persistence
// ----------------------------------------------------------------------------
// Project-relative image paths are preloaded into dataURLs in imageMap, shared by
// preview rendering (img.src = map[el.src]) and export (buildPptx goes through
// imageMap). Inline dataURL images need no preload; on save they are written out
// as media/ files and el.src is rewritten.
//
// Media IO has a single seam (readMediaBytes): the injected ProjectSource owns the
// bytes whenever it advertises capabilities.binary + readMedia (httpSource resolves
// the relative URL, directoryHandleSource goes through the file handle, memorySource
// reads memory); otherwise the path is fetched over plain HTTP — the deploy/static
// path where a project ships its media next to deck.pptd. Callers pass the source and
// this module never inspects the handle-vs-URL mode itself.
// ============================================================================

import { bytesToBase64, walkElements } from "../../../packages/model/index.js";
import { dataUrlOf, decodeDataUrl, extToMime } from "../../../packages/writer/index.js";

/** Project-relative src → mime from its extension (null when PPT does not support the format). */
function mimeOf(src) {
  return extToMime(/\.([a-z0-9]+)$/i.exec(src)?.[1]) || null;
}

/** dataURL → { mime, ext, bytes } (mime inferred from the decoded result, shared with the writer side). */
function decodeDataUrlInfo(dataUrl) {
  const decoded = decodeDataUrl(dataUrl);
  if (!decoded) return null;
  return { mime: extToMime(decoded.ext), ext: decoded.ext, bytes: decoded.bytes };
}

/**
 * Core image → media/ file entry ({path, b64}) collection (shared by save-write,
 * zip packaging and project export; see #7 merge):
 *   - inline dataURL: written as media/<elementId>.<ext> and el.src rewritten
 *   - relative-path reference (persisted by an earlier save / shipped with the
 *     project): bytes are filled from the dataURL in imageMap — keeps zip
 *     packaging complete; write-back is an idempotent overwrite of the same content
 * @param {Array} pages page array (editor state or a snapshot)
 * @param {object} imageMap src → dataURL map
 * @param {(rel: string, dataUrl: string) => void} [onRelPath]
 *        called when dataURL persistence produces a new relative path (the editor
 *        uses it to keep the preview map in sync; snapshot export does not need it)
 */
function collectMediaFiles(pages, imageMap, onRelPath = null) {
  const out = [];
  const seen = new Set();
  walkElements(pages, (el) => {
    if (el.elementType !== "image" || !el.src) return;
    const dataUrl = el.src.startsWith("data:")
      ? el.src
      : String(imageMap[el.src] || "").startsWith("data:")
        ? imageMap[el.src]
        : null;
    if (!dataUrl || seen.has(dataUrl)) return;
    seen.add(dataUrl);
    const info = decodeDataUrlInfo(dataUrl);
    if (!info) return; // svg/webp and other formats PPT does not support: keep inline, do not persist
    if (el.src.startsWith("data:")) {
      const rel = `media/${el.elementId}.${info.ext}`;
      onRelPath?.(rel, dataUrl); // editor: new path → original dataURL, keeps the preview usable
      el.src = rel;
      out.push({ path: rel, b64: bytesToBase64(info.bytes) });
    } else {
      out.push({ path: el.src, b64: bytesToBase64(info.bytes) });
    }
  });
  return out;
}

/**
 * Collect the project-relative image references in `list` that are not yet in
 * imageMap (deduplicated, dataURLs skipped).
 */
function pendingImageSrcs(state, list) {
  const todo = [];
  const seen = new Set();
  walkElements(list, (el) => {
    if (el.elementType !== "image" || !el.src || el.src.startsWith("data:")) return;
    if (state.imageMap[el.src] || seen.has(el.src)) return;
    seen.add(el.src);
    todo.push(el.src);
  });
  return todo;
}

export function createImageStore(state) {
  /**
   * The single media gate: a source that owns binary reads yields the bytes,
   * everything else falls back to a relative-URL fetch against the manifest's
   * directory (deploy/static sites keep media beside deck.pptd). Returns null when
   * the bytes are unavailable — the render layer then shows a placeholder.
   * @param {object} source ProjectSource (app/project/source.js)
   * @param {string} src project-relative image path
   * @returns {Promise<Uint8Array|null>}
   */
  async function readMediaBytes(source, src) {
    if (source?.capabilities?.binary && typeof source.readMedia === "function") {
      return (await source.readMedia(src)) || null;
    }
    if (!state.manifestPath) return null;
    if (typeof src !== "string" || /^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith("/") || src.split(/[/\\]/).includes("..")) {
      return null; // reject absolute URLs / paths and traversal sequences escaping the project directory
    }
    const res = await fetch(state.manifestPath.replace(/[^/]*$/, "") + src);
    return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
  }

  /** Preload project-relative images as dataURLs into imageMap (a page subset for progressive loading). */
  async function preloadImages(source, pages) {
    const list = Array.isArray(pages) ? pages : state.deck?.pages;
    if (!list) return;
    await Promise.all(
      pendingImageSrcs(state, list).map(async (src) => {
        const mime = mimeOf(src);
        if (!mime) return;
        try {
          const bytes = await readMediaBytes(source, src);
          if (bytes) state.imageMap[src] = dataUrlOf(bytes, mime);
        } catch (err) {
          console.warn(`[io] 图片预载失败 ${src}: ${err.message}`); // silent degrade; the render layer shows a placeholder
        }
      })
    );
  }

  /** Rebuild the image map: dataURL references map to themselves; relative-path references keep any existing mapping. */
  function rebuildImageMap() {
    const next = {};
    walkElements(state.deck.pages, (el) => {
      if (el.elementType !== "image" || !el.src) return;
      if (el.src.startsWith("data:")) next[el.src] = el.src;
      else if (state.imageMap[el.src]) next[el.src] = state.imageMap[el.src];
    });
    state.imageMap = next;
  }

  /** Save-write / zip packaging: operates on editor state (the preview map is kept in sync). */
  function persistDataUrlImages() {
    return collectMediaFiles(state.deck.pages, state.imageMap, (rel, dataUrl) => {
      state.imageMap[rel] = dataUrl;
    });
  }

  return { preloadImages, rebuildImageMap, persistDataUrlImages };
}

/**
 * Project export: collect images from a deck snapshot (inline dataURLs →
 * media/<elementId>.<ext> with snapshot src rewritten; relative references get
 * their bytes filled from the dataURLs in imageMap). Operates on the snapshot,
 * not editor state — exporting does not change the current editing session.
 */
export function mediaFilesOfDeck(deckSnapshot, imageMap = {}) {
  return collectMediaFiles(deckSnapshot.pages || [], imageMap);
}
