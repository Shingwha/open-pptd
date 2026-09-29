// ============================================================================
// model/walk.js — sole page/element traversal (v3 #3)
// ----------------------------------------------------------------------------
// Every "page by page, element by element" walk (image collection, preload,
// persistence, export) goes through here; no more nested for-loop copies. The
// page model is structurally identical to a raw YAML page object
// ({ elements: [...] }), so the editor and the CLI export both use this.
// ============================================================================

/**
 * Per-page, per-element callback.
 * @param {Array} pages array of pages (model pages or YAML page objects)
 * @param {(el: object, page: object, pageIndex: number) => void} fn
 */
export function walkElements(pages, fn) {
  let pageIndex = 0;
  for (const page of pages || []) {
    for (const el of page?.elements || []) fn(el, page, pageIndex);
    pageIndex += 1;
  }
}

/**
 * Collect image element srcs (elementType "image", non-empty src), deduped in
 * order of appearance.
 * @param {Array} pages
 * @param {object} [opts]
 * @param {boolean} [opts.includeDataUrl] include data: embeds (excluded by default)
 * @param {boolean} [opts.includeRemote] include http(s) remote URLs (excluded by default)
 * @returns {string[]}
 */
export function collectImageSrcs(pages, { includeDataUrl = false, includeRemote = false } = {}) {
  const out = [];
  const seen = new Set();
  walkElements(pages, (el) => {
    if (el.elementType !== "image" || typeof el.src !== "string" || !el.src) return;
    if (!includeDataUrl && el.src.startsWith("data:")) return;
    if (!includeRemote && /^https?:/.test(el.src)) return;
    if (seen.has(el.src)) return;
    seen.add(el.src);
    out.push(el.src);
  });
  return out;
}
