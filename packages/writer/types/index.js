// ============================================================================
// writer/types/index.js — toXml registration entry (static closure)
// ----------------------------------------------------------------------------
// Imports every built-in toXml shard (./<id>.js) for side-effect registration, so
// the export path (writer/slide.js) has dispatch for all manifest types.
// Non-built-in/lazy types go through types/load.js instead; render / UI fragments
// are registered separately by renderer/types and editor/types.
// ============================================================================

import "./text.js";
import "./shape.js";
import "./icon.js";
import "./line.js";
import "./image.js";
import "./table.js";
import "./chart.js";

export { registerType, getType, allTypes } from "../../model/registry.js";
