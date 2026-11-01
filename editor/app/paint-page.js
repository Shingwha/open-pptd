// editor/app/paint-page.js — model page → layout → paintPage convenience adapter
// Editor call sites that paint one model page (headless shot, thumbnails, present
// mode, browser PNG backend) share this wrapper instead of duplicating the two-stage
// call. Geometry comes from layout; the model is never written.

import { layout } from "../../packages/layout/index.js";
import { paintPage } from "../../packages/renderer/index.js";

/**
 * Paint one model page into `container` (layout → paintPage).
 * @param {HTMLElement} container paint surface
 * @param {object} page page model
 * @param {object} deck deck model (theme/pages are read)
 * @param {object|string} [theme] resolved theme override (defaults to deck.theme)
 * @param {object} [opts] { measure, imageMap, iconMap, pixelRatio }
 */
export function paintModelPage(container, page, deck, theme, opts = {}) {
  const th = theme ?? deck?.theme;
  const tree = layout({ ...(deck || {}), theme: th, pages: [page] }, opts.measure || undefined);
  paintPage(tree.pages[0], { ...opts, container, page, theme: th });
}
