// ============================================================================
// model/registry.js — element type registry contract (extensibility core, sharded registration)
// ----------------------------------------------------------------------------
// Each element type = one logical entry whose fields are registered by three
// layers separately (registering the same type again merges fields,
// Object.assign semantics; console.warn only when the same field is overwritten
// with a different value):
//   {
//     type: "text",                // element type id (elementType)
//     render: (theme, el) => DOM,  // preview render shard (packages/renderer/types/)
//     toXml: (theme, el, ctx) => string, // OOXML export shard (packages/writer/types/)
//     label: displayName,          // human-readable label (property-panel badge etc., editor UI shard)
//     menu: { group, items },      // add menu (+ panel, editor UI shard)
//     create: () => element,       // default element for creation (editor UI shard)
//     props: (el, h) => [node],    // property-panel group (editor UI shard)
//     quickbar: (el, h) => void,   // floating quick bar (editor UI shard)
//   }
// Assemblers pull in the shards they need: the editor (editor/types/index.js)
// pulls all of them; CLI export pulls only the writer shard; render screenshots
// pull only the renderer shard.
// ============================================================================

import { ELEMENT_TYPES } from "./style-spec.js";

const TYPES = new Map();

export function registerType(def) {
  if (!def || typeof def.type !== "string") throw new Error("[types] registerType 需要 { type }");
  if (!ELEMENT_TYPES.includes(def.type)) console.warn(`[types] 注册未知元素类型 ${def.type}（见 model/style-spec.js ELEMENT_TYPES）`);
  const prev = TYPES.get(def.type);
  if (!prev) {
    TYPES.set(def.type, def);
    return;
  }
  // Sharded registration: merge fields instead of replacing wholesale; warn on conflicting overwrite
  for (const key of Object.keys(def)) {
    if (key === "type") continue;
    if (key in prev && prev[key] !== def[key]) {
      console.warn(`[types] 元素类型 ${def.type} 的 ${key} 重复注册，后者覆盖`);
    }
    prev[key] = def[key];
  }
}

/** Look up a type definition; returns undefined when unregistered (consumer falls back to placeholder/warning). */
export function getType(type) {
  return TYPES.get(type);
}

/** All registered types (in registration order). */
export function allTypes() {
  return [...TYPES.values()];
}
