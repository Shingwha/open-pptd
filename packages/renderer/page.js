// renderer/page.js — page painting (paintPage consumes LayoutTree)
// Third stage of resolve → layout → paint. paintPage(layoutPage, ctx) is the only paint entry:
// all geometry is read from the LayoutTree (position/size from frame; text box height from
// declared) and this file never measures nor writes back to the model.
// Element → DOM dispatch goes through the type registry (model/registry.js); adding an element
// type only needs a render fragment under renderer/types/.

import { getType } from "./types/index.js";
import { pageBackground } from "./background.js";
import { disposeChartInstances } from "./chart.js";
import { createElementShell } from "./shell.js";
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
 * Shallow copy only (the model is never written back): bounds come from the layout geometry,
 * the fragment signature stays `render(theme, el, ctx)`, and content/style are referenced as-is.
 *
 * Geometry: table reads frame + layout.table for exact row heights/column widths. Text takes
 * x/y/w from frame but h from `declared` (the author box) — PowerPoint "do not autofit" semantics:
 * overflow stays visible, the box does not grow with content, and lines anchor to the author box.
 * Using frame.h would shift middle/bottom-aligned text down by the growth delta (measured 17px).
 * Other elements: frame == declared.
 */
function withFrame(el, le) {
  const f = le.frame;
  const h = el.elementType === "text" ? le.declared.h : f.h;
  const view = { ...el, bounds: [f.x, f.y, f.w, h] };
  if (le.table) view.layout = le; // table: exact row heights from layout (renderTable reads el.layout.table)
  return view;
}

/**
 * Paint one page of the LayoutTree (pure painting: geometry from the tree, no DOM measuring).
 * @param {object} layoutPage LayoutTree.pages[i] ({ index, elements })
 * @param {object} ctx { container, page, theme, imageMap, iconMap, pixelRatio }
 *  - container canvas container (required)
 *  - page      page model (only background / _parseError / element content; geometry comes from layoutPage)
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

export { disposeChartInstances } from "./chart.js";
