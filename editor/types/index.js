// ============================================================================
// types/index.js — editor type-registry assembly entry (imports register shards)
// ----------------------------------------------------------------------------
// Combines three shard layers: renderer `render`, writer `toXml`, and local UI
// (label/menu/create/props/quickbar), merged into the single registry in
// packages/model/registry.js. To add an element type, create a shard module in
// each layer (registerType) and import it from the matching index.js — the
// renderer / writer / property panel / quickbar / add-menu then pick it up.
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
export { buildAddItems } from "./menu.js";
