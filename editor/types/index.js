// editor/types/index.js — type-registry assembly entry (imports the registration shards)
// Combines the renderer `render` shard, writer `toXml` shard and the local UI boundary
// (label/create) into the registry. Only text/table/chart have editor UI; other types
// stay selectable/transformable on the canvas and render/export through their shards.

import "../../packages/renderer/index.js";
import "../../packages/writer/index.js";

import "./text.js";
import "./table.js";
import "./chart.js";

import { getType, nextElementId } from "../../packages/model/index.js";

export { registerType, getType, allTypes } from "../../packages/model/index.js";

/** Types the add menu offers (content editors only, in menu order). */
export const ADD_TYPE_IDS = Object.freeze(["text", "table", "chart"]);

/**
 * Create a fresh element of an add-menu type via its registered shard.
 * @param {"text"|"table"|"chart"} type
 * @returns {object|null} element (null for unknown/no-create types)
 */
export function createElement(type) {
  if (!ADD_TYPE_IDS.includes(type)) return null;
  const def = getType(type);
  if (!def?.create) return null;
  const el = def.create();
  // Defensive: a shard that forgot the id gets a valid one (never writes without an id)
  if (!el.elementId) el.elementId = nextElementId(type);
  return el;
}
