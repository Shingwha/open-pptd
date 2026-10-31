// ============================================================================
// types/index.js — editor type-registry assembly entry (imports register shards)
// ----------------------------------------------------------------------------
// Combines three shard layers: renderer `render`, writer `toXml`, and local UI
// (label/menu/create/props/quickbar), merged into the single registry in
// packages/model/registry.js. The type list itself comes from the manifest
// (packages/model/types/, seeded by registry.js); a new engine type only needs a
// descriptor plus its renderer/writer shard. Editor content-editor types are
// derived from manifest contentEditor:true (see contentEditorTypeIds).
// ============================================================================

import "../../packages/renderer/index.js";
import "../../packages/writer/index.js";

import "./text.js";
import "./shape.js";
import "./icon.js";
import "./line.js";
import "./image.js";
import "./table.js";
import "./chart.js";
import "./group.js";

export { registerType, getType, allTypes } from "../../packages/model/index.js";
export { buildAddItems, contentEditorTypeIds } from "./menu.js";
