// renderer/types/index.js — render fragment registration entry (static closure)
// Imports every built-in render shard (./<id>.js) for side-effect registration, so the sync
// preview paint path (renderer/page.js) can dispatch all manifest types. Non-built-in/lazy types
// go through types/load.js; UI fragments register separately via editor/types/.

import "./text.js";
import "./shape.js";
import "./icon.js";
import "./line.js";
import "./image.js";
import "./table.js";
import "./chart.js";

export { registerType, getType, allTypes } from "../../model/registry.js";
