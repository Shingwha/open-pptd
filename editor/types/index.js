// editor/types/index.js — type-registry assembly entry (imports the registration shards)
// Combines the renderer `render` shard, writer `toXml` shard and the local UI boundary
// (label/create/variants) into the registry. The add menu offers six types; only
// text/table/chart have content editors, shape/line/image are transform-only.

import "../../packages/renderer/index.js";
import "../../packages/writer/index.js";

import "./text.js";
import "./table.js";
import "./chart.js";
import "./shape.js";
import "./line.js";
import "./image.js";

import { getType, nextElementId } from "../../packages/model/index.js";

export { registerType, getType, allTypes } from "../../packages/model/index.js";

/** Types the add menu offers, in fixed menu order. */
export const ADD_TYPE_IDS = Object.freeze(["text", "table", "chart", "shape", "line", "image"]);

/** Types with a content editor (double-click / creation dialog). */
export const CONTENT_TYPE_IDS = Object.freeze(["text", "table", "chart"]);

/**
 * Create a fresh element of an add-menu type via its registered shard.
 * @param {"text"|"table"|"chart"|"shape"|"line"|"image"} type
 * @param {string} [variant] shape preset name / line variant / image dataURL
 * @returns {object|null} element (null for unknown types or a missing required variant)
 */
export function createElement(type, variant) {
  if (!ADD_TYPE_IDS.includes(type)) return null;
  const def = getType(type);
  if (!def?.create) return null;
  const el = def.create(variant);
  if (!el) return null;
  // Defensive: a shard that forgot the id gets a valid one (never writes without an id)
  if (!el.elementId) el.elementId = nextElementId(type);
  return el;
}

/**
 * Variant buttons for the add menu (shape presets / line styles); empty for plain types.
 * @param {string} type
 * @returns {Array<{id: string, label: string, group?: string, icon?: string, hint?: string}>}
 */
export function variantsOf(type) {
  if (!ADD_TYPE_IDS.includes(type)) return [];
  return getType(type)?.addVariants?.() || [];
}
