// ============================================================================
// interaction/dialogs/page-background.js — page background dialog
// ----------------------------------------------------------------------------
// The page-level entry (the context-menu page-background item / thumbnail
// right-click) has the same field semantics as the property panel's page setup
// (none / solid / gradient + start color/end color/angle) — just a different entry
// point. The shared helpers below are the single source for both call sites.
// Transaction: beginChange (snapshot) only on the first real commit; endChange
// re-aligns everything when the panel closes.
// ============================================================================

import { showDialog } from "./base.js";
import * as ui from "../../ui.js";
import { themeSwatches } from "../fields.js";
import { resolveColor } from "../../../packages/model/index.js";

/** Background-type dropdown options (shared by the property panel and this dialog). */
export const BACKGROUND_TYPES = [["none", "无"], ["solid", "纯色"], ["gradient", "渐变"]];

/**
 * Model write for a background-type switch (shared by the property panel's page
 * setup and this dialog so the two never drift). An existing color of the same
 * kind carries over (solid → gradient reuses the first stop).
 */
export function setBackgroundType(pg, type) {
  if (type === "none") {
    delete pg.background;
  } else if (type === "solid") {
    pg.background = { type: "solid", color: pg.background?.color || "$bg" };
  } else if (type === "gradient") {
    pg.background = {
      type: "gradient",
      gradientType: "linear",
      angle: 90,
      stops: [
        { position: 0, color: pg.background?.color || "$primary" },
        { position: 1, color: "#ffffff" },
      ],
    };
  }
}

/**
 * Background color/angle field nodes (solid → color; gradient → start/end color +
 * angle). Shared by the property panel and this dialog.
 * @param {object} pg target page
 * @param {object} opts { commit(fn), theme }
 */
export function backgroundColorFields(pg, { commit, theme }) {
  const resolve = (v) => resolveColor(theme, v);
  const swatches = themeSwatches(theme);
  const out = [];
  if (pg.background?.type === "solid") {
    out.push(
      ui.field("颜色", ui.colorField(pg.background.color, (v) => commit(() => { pg.background.color = v; }), { resolve, swatches }))
    );
  } else if (pg.background?.type === "gradient") {
    out.push(
      ui.field("起始色", ui.colorField(pg.background.stops?.[0]?.color, (v) => commit(() => { pg.background.stops[0].color = v; }), { resolve, swatches }))
    );
    out.push(
      ui.field("结束色", ui.colorField(pg.background.stops?.[1]?.color, (v) => commit(() => { pg.background.stops[1].color = v; }), { resolve, swatches }))
    );
    out.push(
      ui.field("角度", ui.numInput(pg.background.angle ?? 0, (v) => commit(() => { pg.background.angle = v; }), { min: 0, max: 360, step: 15 }))
    );
  }
  return out;
}

/**
 * Open the page background dialog.
 * @param {object} opts
 *  - pg: target page object (current page by default)
 *  - theme: theme (color resolution/swatches)
 *  - beginChange(): snapshot before a change
 *  - endChange(): end a change (full render)
 *  - refreshPreview(): optional lightweight canvas refresh
 */
export function openPageBackgroundDialog({ pg, theme, beginChange, endChange, refreshPreview }) {
  if (!pg) return null;
  let tx = false;
  // Snapshot only on the first real commit (opening without editing is not dirty);
  // re-render fully after each commit (the background is a whole-page effect)
  const commit = (fn) => {
    if (!tx) {
      tx = true;
      beginChange();
    }
    fn();
    if (refreshPreview) refreshPreview();
    endChange();
  };

  const body = document.createElement("div");
  body.className = "pg-bg-dialog";

  const bgType = pg.background?.type || "none";
  body.appendChild(
    ui.field(
      "背景",
      ui.selectInput(BACKGROUND_TYPES, bgType, (v) =>
        commit(() => {
          setBackgroundType(pg, v);
          renderColors();
        })
      )
    )
  );

  const colors = document.createElement("div");
  colors.className = "pg-bg-colors";
  body.appendChild(colors);

  /** Color/angle area (rebuilt after the background type changes). */
  function renderColors() {
    colors.innerHTML = "";
    for (const node of backgroundColorFields(pg, { commit, theme })) colors.appendChild(node);
  }
  renderColors();

  const { close } = showDialog("页面背景", body, {
    doneText: "完成",
    onDone: () => close(),
  });
  return { close };
}
