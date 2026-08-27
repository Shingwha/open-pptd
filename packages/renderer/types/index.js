// ============================================================================
// renderer/types/index.js — render 分片聚合入口（引入即注册全部类型的 render）
// ----------------------------------------------------------------------------
// 装配：渲染链路（renderer/page.js）只需引入本模块即可获得全部类型的
// render 分派；UI 分片（label/menu/props...）由 editor/types/ 另行注册。
// ============================================================================

import "./text.js";
import "./shape.js";
import "./icon.js";
import "./line.js";
import "./image.js";
import "./table.js";
import "./chart.js";

export { registerType, getType, allTypes } from "../../model/registry.js";
