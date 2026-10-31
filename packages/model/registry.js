// ============================================================================
// model/registry.js — element type registry contract (extensibility core, sharded registration)
// ----------------------------------------------------------------------------
// The manifest (model/types/index.js) seeds the registry with every type's metadata:
//   { type: "text", id: "text", label, composite, layoutKey?, schema?, contentEditor }
// Shards then merge their fields into the same entry (registering the same type again
// merges fields, Object.assign semantics; console.warn only when the same field is
// overwritten with a different value):
//   {
//     type: "text",                // element type id (elementType)
//     render: (theme, el, ctx) => Node|null, // preview render shard (packages/renderer/types/)
//     toXml: (theme, el, ctx) => string,     // OOXML export shard (packages/writer/types/)
//     label: displayName,          // manifest metadata (editor UI shard may re-register the same value)
//     menu: { group, items },      // add menu (editor UI shard; removed by the 3.0 UI wave)
//     create: () => element,       // default element for creation (editor UI shard)
//     props: (el, h) => [node],    // property-panel group (editor UI shard)
//     quickbar: (el, h) => void,   // floating quick bar (editor UI shard)
//   }
// Assemblers pull in the shards they need: the editor (editor/types/index.js)
// pulls all of them; CLI export pulls only the writer shard; render screenshots
// pull only the renderer shard.
// ============================================================================

import { TYPE_DEFS, defineType as defineMeta } from "./types/index.js";

const TYPES = new Map();
const KNOWN_IDS = new Set();
const ID_ORDER = [];

/**
 * Register manifest metadata (id/label/composite/layoutKey/schema/contentEditor).
 * Unlike registerType it also makes the id a known type (validate/typeIds include it),
 * which is how a new type is introduced before its shards load.
 */
export function defineType(def) {
  const meta = defineMeta(def);
  const prev = TYPES.get(meta.id);
  if (prev) {
    Object.assign(prev, meta);
  } else {
    TYPES.set(meta.id, { type: meta.id, ...meta });
    KNOWN_IDS.add(meta.id);
    ID_ORDER.push(meta.id);
  }
  return TYPES.get(meta.id);
}

// Seed from the manifest: allTypes()/typeIds() are manifest-initialized.
for (const def of TYPE_DEFS) defineType(def);

export function registerType(def) {
  if (!def || typeof def.type !== "string") throw new Error("[types] registerType 需要 { type }");
  if (!isKnownType(def.type)) console.warn(`[types] 注册未知元素类型 ${def.type}（见 model/style-spec.js ELEMENT_TYPES）`);
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

/** All registered types (manifest order, then any runtime-defined/registered extras). */
export function allTypes() {
  return [...TYPES.values()];
}

/** Known type ids (manifest order + runtime defineType additions); excludes shard-only typo ids. */
export function typeIds() {
  return [...ID_ORDER];
}

/** Whether the id is declared by the manifest (or defineType); registerType-only ids are not. */
export function isKnownType(type) {
  return KNOWN_IDS.has(type);
}
