// renderer/types/load.js — on-demand render shard loader (by manifest type id)
// Convention: the shard for type id "<id>" is ./<id>.js and registers itself via
// registerType({ type, render }), so a new type needs only the model descriptor plus the shard.
// Built-ins are registered eagerly by types/index.js (sync preview paint); loadType() serves types
// outside the static closure and callers that defer the fragment (test/plugin types).
// Composite types (group) have no shard: they resolve to their descriptor.

import { getType } from "../../model/registry.js";

const SHARD_ID = /^[a-z][a-z0-9-]*$/;

/** Dynamic import is a function so tests can inject a shard module. */
const defaultImporter = (specifier) => import(specifier);

/**
 * Ensure the render shard for a manifest type is registered.
 * @param {string} id manifest type id
 * @param {(specifier: string) => Promise<any>} [importer]
 * @returns {Promise<object|undefined>} the merged registry entry
 */
export async function loadType(id, importer = defaultImporter) {
  if (typeof id !== "string" || !SHARD_ID.test(id)) throw new TypeError(`[renderer/types] 非法类型 id: ${id}`);
  let def = getType(id);
  if (!def) throw new Error(`[renderer/types] 类型 ${id} 未在 TypeManifest 中定义`);
  if (def.composite || def.render) return def;
  await importer(`./${id}.js`);
  def = getType(id);
  if (!def?.render) throw new Error(`[renderer/types] 分片 ./${id}.js 未注册 render`);
  return def;
}

/** Load several shards in order. */
export async function loadTypes(ids, importer = defaultImporter) {
  const out = [];
  for (const id of ids) out.push(await loadType(id, importer));
  return out;
}
