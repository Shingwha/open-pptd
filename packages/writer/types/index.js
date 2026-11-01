// writer/types/index.js — toXml registration entry (static closure)
// Imports every built-in toXml shard (./<id>.js) for side-effect registration, so the export
// path (writer/slide.js) can dispatch all manifest types. Non-built-in/lazy types go through
// types/load.js; render/UI fragments register separately via renderer/types and editor/types.

import "./text.js";
import "./shape.js";
import "./icon.js";
import "./line.js";
import "./image.js";
import "./table.js";
import "./chart.js";

export { registerType, getType, allTypes } from "../../model/registry.js";
