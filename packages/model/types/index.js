// ============================================================================
// model/types/index.js — TypeManifest (single source of truth for element types)
// ----------------------------------------------------------------------------
// One descriptor module per type. Descriptors carry metadata only:
//   { id, label, composite?, layoutKey?, schema?(el) -> Issue[], contentEditor? }
// render/toXml are registered by the renderer/writer shards; editor UI (menu/
// create/props/content editor) is contributed by the editor shards.
//
// Direction: style-spec.js derives ELEMENT_TYPES from TYPE_IDS, so this directory
// must never import style-spec.js (that would be a cycle): style-spec -> types.
// ============================================================================

import { textType } from "./text.js";
import { shapeType } from "./shape.js";
import { lineType } from "./line.js";
import { imageType } from "./image.js";
import { iconType } from "./icon.js";
import { tableType } from "./table.js";
import { chartType } from "./chart.js";
import { groupType } from "./group.js";

const SHARD_ID = /^[a-z][a-z0-9-]*$/;

/**
 * Validate + normalize one type descriptor (pure metadata; does not register).
 * @param {{id:string,label:string,composite?:boolean,layoutKey?:string,schema?:Function,contentEditor?:boolean}} def
 * @returns {Readonly<object>} frozen descriptor
 */
export function defineType(def) {
  if (!def || typeof def !== "object") throw new TypeError("[types] defineType 需要类型描述对象");
  const { id, label, composite, layoutKey, schema, contentEditor } = def;
  if (typeof id !== "string" || !SHARD_ID.test(id)) throw new TypeError(`[types] 非法类型 id: ${id}`);
  if (typeof label !== "string" || !label) throw new TypeError(`[types] 类型 ${id} 缺 label`);
  if (layoutKey != null && typeof layoutKey !== "string") throw new TypeError(`[types] 类型 ${id} 的 layoutKey 必须是字符串`);
  if (schema != null && typeof schema !== "function") throw new TypeError(`[types] 类型 ${id} 的 schema 必须是函数`);
  return Object.freeze({
    id,
    label,
    composite: composite === true,
    ...(layoutKey ? { layoutKey } : {}),
    ...(schema ? { schema } : {}),
    contentEditor: contentEditor === true,
  });
}

/** Canonical type list order (ELEMENT_TYPES / layout / menus all follow it). */
export const TYPE_DEFS = Object.freeze(
  [textType, shapeType, lineType, imageType, iconType, tableType, chartType, groupType].map(defineType)
);

/** Canonical type ids, in manifest order: text/shape/line/image/icon/table/chart/group. */
export const TYPE_IDS = Object.freeze(TYPE_DEFS.map((def) => def.id));
