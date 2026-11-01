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

import { listColorTokens, resolveColor } from "../../packages/model/index.js";

/** Every theme color token (standard keys first, then custom tokens; D13). Used by all color controls. */
export function themeSwatches(theme) {
  return listColorTokens(theme).map((t) => ({ key: `$${t.key}`, value: resolveColor(theme, t.value) || "#cccccc" }));
}

