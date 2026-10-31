// ============================================================================
// writer/types/load.js — on-demand toXml shard loader (by manifest type id)
// ----------------------------------------------------------------------------
// Convention: the shard for type id "<id>" is ./<id>.js and registers itself via
// registerType({ type, toXml }). A new type therefore only needs
//   packages/model/types/<id>.js (descriptor) + packages/writer/types/<id>.js
// (shard); no edit to the static index is required for lazy consumers.
// Built-in types are still registered eagerly by types/index.js (CLI export);
// loadType() is for types outside the static closure. Composite types (group)
// have no shard and no toXml: they resolve to their descriptor and export skips.
// ============================================================================

import { getType } from "../../model/registry.js";

const SHARD_ID = /^[a-z][a-z0-9-]*$/;

/** Dynamic import is a function so tests can inject a shard module. */
const defaultImporter = (specifier) => import(specifier);

/**
 * Ensure the toXml shard for a manifest type is registered.
 * @param {string} id manifest type id
 * @param {(specifier: string) => Promise<any>} [importer]
 * @returns {Promise<object|undefined>} the merged registry entry
 */
export async function loadType(id, importer = defaultImporter) {
  if (typeof id !== "string" || !SHARD_ID.test(id)) throw new TypeError(`[writer/types] 非法类型 id: ${id}`);
  let def = getType(id);
  if (!def) throw new Error(`[writer/types] 类型 ${id} 未在 TypeManifest 中定义`);
  if (def.composite || def.toXml) return def;
  await importer(`./${id}.js`);
  def = getType(id);
  if (!def?.toXml) throw new Error(`[writer/types] 分片 ./${id}.js 未注册 toXml`);
  return def;
}

/** Load several shards in order. */
export async function loadTypes(ids, importer = defaultImporter) {
  const out = [];
  for (const id of ids) out.push(await loadType(id, importer));
  return out;
}
