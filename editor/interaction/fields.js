// ============================================================================
// interaction/fields.js — declarative field renderer (property panel / table style panel)
// ----------------------------------------------------------------------------
// One layout rule (identical to the property panel):
//   num      two-column compact cell (label on top), paired into rows
//            {kind:"num", label, get, set, min?, max?, step?}
//   text     full-width text input                  {kind:"text", label, get, set, placeholder?}
//   textarea full-width multi-line text             {kind:"textarea", label, get, set, placeholder?}
//   select   full-width dropdown                    {kind:"select", label, options, get, set}
//   color    full-width color (swatch popover + picker + hex)  {kind:"color", label, get, set}
//   checks   full-width checkbox group              {kind:"checks", items:[{label, get, set}]}
//   button   full-width button                      {kind:"button", label, onClick, className?}
//   hint     full-width hint                        {kind:"hint", text}
// The control factory h is supplied by the consumer (the property panel adds a
// commit transaction; the table panel commits directly). Fields only declare
// *what to call*; the transaction policy belongs to the consumer.
// ============================================================================

import * as ui from "../ui.js";
import { resolveColor } from "../../packages/model/index.js";

/** Theme semantic-color swatches (for colorField swatches; shared by property/table/chart panels). */
export function themeSwatches(theme) {
  const c = theme?.colors || {};
  const keys = ["primary", "accent", "text", "muted", "line", "success", "warning", "danger", "primaryDeep", "primarySoft", "primaryTint", "accent3"];
  return keys.map((k) => ({ key: `$${k}`, value: resolveColor(theme, c[k]) || "#cccccc" }));
}

/**
 * Declarative field-control factory (shared by property / table / chart style panels).
 * @param {object} opts
 *  - theme: theme object or getter (data source for colorField resolve/swatches)
 *  - wrap(fn): optional commit wrapper — the property panel wraps it with the
 *    transaction + immediate refresh; dialogs pass fn straight through
 *  - onFocus/onBlur: optional transaction hooks (the property panel's beginChange/endChange)
 *  - extra: extra helpers (the property panel's fontOptions/openEditor etc.)
 */
export function fieldHandlers({ theme, wrap = (f) => f, onFocus, onBlur, extra = {} } = {}) {
  const themeOf = typeof theme === "function" ? theme : () => theme;
  return {
    textInput: (v, c, o = {}) => ui.textInput(v, wrap(c), { onFocus, onBlur, ...o }),
    numInput: (v, c, o = {}) => ui.numInput(v, wrap(c), { onFocus, onBlur, ...o }),
    colorField: (v, c, o = {}) =>
      ui.colorField(v, wrap(c), {
        resolve: (val) => resolveColor(themeOf(), val),
        swatches: themeSwatches(themeOf()),
        onFocus,
        onBlur,
        ...o,
      }),
    selectInput: (options, value, onCommit, o = {}) => ui.selectInput(options, value, wrap(onCommit), { onFocus, onBlur, ...o }),
    checkbox: (l, ch, c, o = {}) => ui.checkbox(l, ch, wrap(c), { onFocus, onBlur, ...o }),
    button: (label, onClick, o) => ui.button(label, onClick, { className: "btn btn-sm", ...o }),
    ...extra,
  };
}

/** Render one group (its title collapsible). */
export function renderGroup(group, h) {
  const g = ui.group(group.title || "");
  renderFields(g, group.fields || [], h);
  return g;
}

/** Render a field list into a container (num pairs into rows, everything else full width). */
function renderFields(g, fields, h) {
  let grid = null;
  const ensureGrid = () => {
    if (!grid) {
      grid = document.createElement("div");
      grid.className = "prop-grid";
      g.appendChild(grid);
    }
    return grid;
  };

  for (const f of fields) {
    if (f.kind === "num") {
      ensureGrid().appendChild(ui.cell(f.label, h.numInput(f.get(), f.set, f)));
      if (grid.children.length === 2) grid = null; // paired into rows
    } else {
      grid = null;
      const node = renderFullField(f, h);
      if (node) g.appendChild(node);
    }
  }
}

/** Dispatch a full-width field. */
function renderFullField(f, h) {
  switch (f.kind) {
    case "text":
      return ui.field(f.label, h.textInput(f.get(), f.set, { placeholder: f.placeholder || "" }));
    case "textarea":
      return ui.field(f.label, h.textInput(f.get(), f.set, { rows: f.rows || 3, placeholder: f.placeholder || "" }));
    case "select":
      return ui.field(f.label, h.selectInput(f.options, f.get(), f.set));
    case "color":
      return ui.field(f.label, h.colorField(f.get(), f.set));
    case "checks": {
      const wrap = document.createElement("div");
      wrap.className = "prop-checks";
      for (const item of f.items) {
        wrap.appendChild(h.checkbox(item.label, item.get(), item.set));
      }
      return wrap;
    }
    case "button":
      return h.button(f.label, f.onClick, f.className ? { className: f.className } : {});
    case "hint": {
      const div = document.createElement("div");
      div.className = "prop-hint";
      div.textContent = f.text;
      return div;
    }
    default:
      return null;
  }
}
