// ============================================================================
// writer/types/index.js — toXml 分片聚合入口（引入即注册全部类型的 toXml）
// ----------------------------------------------------------------------------
// 装配：导出链路（writer/slide.js）只需引入本模块即可获得全部类型的
// toXml 分派；render / UI 分片由 renderer/types 与 editor/types 另行注册。
// ============================================================================

import "./text.js";
import "./shape.js";
import "./icon.js";
import "./line.js";
import "./image.js";
import "./table.js";
import "./chart.js";

export { registerType, getType, allTypes } from "../../model/registry.js";
