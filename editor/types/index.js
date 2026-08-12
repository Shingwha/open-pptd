// ============================================================================
// types/index.js — 类型注册表入口（引入即注册全部元素类型）
// ----------------------------------------------------------------------------
// 新增元素类型：在 types/ 下新建模块（registerType 注册），并在此 import 一行。
// 渲染器 / writer / 属性面板 / 快速条 / 添加菜单全部自动接入。
// ============================================================================

import "./text.js";
import "./shape.js";
import "./icon.js";
import "./line.js";
import "./image.js";
import "./table.js";
import "./chart.js";

export { registerType, getType, allTypes } from "./registry.js";
export { buildAddItems } from "./menu.js";
