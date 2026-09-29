// ============================================================================
// renderer/page.js — page painting (paintPage consumes LayoutTree + legacy renderPage adapter)
// ----------------------------------------------------------------------------
// Third stage of the three-stage pipeline: resolve → layout → paint.
//   paintPage(layoutPage, ctx)  ← the only paint entry. All geometry is read from
//                                 the LayoutTree (position/size from frame; text
//                                 box height from declared, see withFrame). This
//                                 file never measures nor writes back to the model.
//   renderPage(container, page, deck, theme, opts)  ← 2.x compat adapter
//                                 (page → layout → paintPage internally); the
//                                 contract-4 export surface stays stable.
// Element → DOM dispatch goes through the type registry (packages/model/registry.js);
// adding an element type only needs a render fragment under renderer/types/.
// ============================================================================

import { getType } from "./types/index.js";
import { pageBackground } from "./background.js";
import { disposeChartInstances } from "./chart.js";
import { createElementShell } from "./shell.js";
import { layout } from "../layout/index.js";
import { normalizeTheme } from "../model/theme.js";

/** Return as-is when already normalized (has colors), else normalizeTheme (same rule as layout's themeOf). */
function themeOf(theme) {
  const t = theme;
  if (t && typeof t === "object" && t.colors) return t;
  return normalizeTheme(t);
}

/** Element → DOM (dispatched via the registry; unknown types fall back to a placeholder).
 * @param {object} ctx paint context ({ imageMap, iconMap, pixelRatio })
 */
function renderElement(theme, el, ctx = {}) {
  const def = getType(el.elementType);
  if (def && def.render) return def.render(theme, el, ctx);
  return placeholder(el);
}

function placeholder(el) {
  const div = createElementShell(el, {
    css:
      `display:flex;align-items:center;justify-content:center;` +
      `border:1px dashed #c4cbd4;color:#8a94a3;font-size:13px;background:#f8fafc;`,
  });
  div.textContent = `[${el.elementType} · 编辑能力开发中]`;
  return div;
}

/** Parse-failure page: red error box (file path + line number + summary, truncated past 160 chars). */
function renderParseError(container, page) {
  const div = document.createElement("div");
  div.className = "page-error";
  const line = page._parseErrorLine ? ` · 第 ${page._parseErrorLine} 行` : "";
  const msg = String(page._parseError || "未知解析错误").replace(/\s+/g, " ").trim();
  const summary = msg.length > 160 ? msg.slice(0, 160) + "…" : msg;
  div.textContent = `[页面解析失败] ${page._path || "?"}${line}\n${summary}`;
  container.appendChild(div);
}

/**
 * LayoutElement + element model → paint-view object.
 * Shallow copy only (the model is never written back): bounds come from the layout
 * geometry, the fragment signature stays `render(theme, el, ctx)`, and content/style
 * fields are referenced as-is.
 *
 * Geometry choices:
 * - Table: read frame + layout.table for exact row heights / column widths.
 * - Text: x/y/w from frame, but the box height comes from `declared` (the author
 *   box) — PowerPoint "do not autofit" semantics: overflow stays visible, the box
 *   does not grow with content, and line positions anchor to the author box. Using
 *   frame.h (the grown height) would shift middle/bottom-aligned text down by the
 *   box delta (measured: city-cycling#5 title shifted 17px). Clipping is prevented
 *   by overflow:visible in renderText (see text.js).
 * - Other elements: frame == declared (size passed through).
 */
function withFrame(el, le) {
  const f = le.frame;
  const h = el.elementType === "text" ? le.declared.h : f.h;
  const view = { ...el, bounds: [f.x, f.y, f.w, h] };
  if (le.table) view.layout = le; // table: exact row heights from layout (renderTable reads el.layout.table)
  return view;
}

/**
 * Paint one page of the LayoutTree (pure painting: geometry read from the tree, no DOM measuring).
 * @param {object} layoutPage LayoutTree.pages[i] ({ index, elements })
 * @param {object} ctx { container, page, theme, imageMap, iconMap, pixelRatio }
 *  - container canvas container (required)
 *  - page      page model (only background / _parseError / element content are read; geometry always comes from layoutPage)
 */
export function paintPage(layoutPage, ctx = {}) {
  const { container, page } = ctx;
  if (!container) throw new Error("paintPage 需要 ctx.container");
  const theme = themeOf(ctx.theme);
  disposeChartInstances(container);
  container.innerHTML = "";
  container.appendChild(pageBackground(theme, page?.background));
  if (page?._parseError) renderParseError(container, page);
  // Element model indexed by elementId; layout holds only paintable elements (group shells are skipped by layout)
  const byId = new Map();
  for (const el of page?.elements || []) if (el) byId.set(el.elementId, el);
  for (const le of layoutPage?.elements || []) {
    const el = byId.get(le.elementId);
    if (!el) continue;
    const node = renderElement(theme, withFrame(el, le), ctx);
    if (node) container.appendChild(node);
  }
}

/**
 * Compat adapter (contract-4 export surface: kept through 2.x).
 * Resolved deck/page → single-page layout (fontMetricsMeasure by default) → paintPage.
 * Legacy signature (container, page, deck, theme, opts); opts.measure can inject a MeasurePort.
 * @deprecated New code should call layout(deck) + paintPage(layoutPage, ctx) directly.
 */
export function renderPage(container, page, deck, theme, opts = {}) {
  const th = theme ?? deck?.theme;
  const measure = opts.measure || undefined;
  const tree = layout({ ...(deck || {}), theme: themeOf(th), pages: [page] }, measure);
  paintPage(tree.pages[0], { ...opts, container, page, theme: th });
}

export { disposeChartInstances } from "./chart.js";

/**
 * @deprecated There is no measuring after layout: box heights come from the LayoutTree
 * (exact rowHeights for tables, author box + visible overflow for text), so size is no
 * longer a render-time DOM fact. Kept as an empty stub purely for 2.x contract-4 export
 * compatibility (the renderer barrel's autoGrowTexts symbol); removed in 3.0. All callers
 * already go through layout.
 */
export function autoGrowTexts() {}
