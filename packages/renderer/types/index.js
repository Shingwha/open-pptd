// ============================================================================
// renderer/types/index.js — render 分片注册入口（引入即注册全部类型的 render）
// ----------------------------------------------------------------------------
// 装配：渲染链路（renderer/page.js）只需引入本模块即可获得全部类型的
// render 分派；UI 分片（label/menu/props...）由 editor/types/ 另行注册。
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
