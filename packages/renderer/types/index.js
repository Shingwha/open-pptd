// ============================================================================
// renderer/types/index.js — render fragment registration entry (importing registers every type's render)
// ----------------------------------------------------------------------------
// Wiring: the render path (renderer/page.js) only needs this module to get render dispatch
// for every type; UI fragments (label/menu/props...) are registered separately by editor/types/.
// ============================================================================

import { registerType } from "../../model/registry.js";
import { renderText } from "../text.js";
import { renderShape } from "../shape.js";
import { renderIcon } from "../icon.js";
import { renderLine } from "../line.js";
import { renderImage } from "../image.js";
import { renderTable } from "../table.js";
import { renderChart } from "../chart.js";

registerType({ type: "text", render: renderText });
registerType({ type: "shape", render: renderShape });
registerType({ type: "icon", render: renderIcon });
registerType({ type: "line", render: renderLine });
registerType({ type: "image", render: renderImage });
registerType({ type: "table", render: renderTable });
registerType({ type: "chart", render: renderChart });

export { registerType, getType, allTypes } from "../../model/registry.js";
