// ============================================================================
// types/index.js — 编辑器类型注册表装配入口（引入即注册全部分片）
// ----------------------------------------------------------------------------
// 聚合三层分片：renderer 的 render、writer 的 toXml、本地 UI（label/menu/
// create/props/quickbar），合并进 packages/model/registry.js 的同一注册表。
// 新增元素类型：在三层各建分片模块（registerType 注册），并在对应 index.js
// 引入一行。渲染器 / writer / 属性面板 / 快速条 / 添加菜单全部自动接入。
// ============================================================================

import "../../packages/renderer/types/index.js";
import "../../packages/writer/types/index.js";

import "./text.js";
import "./shape.js";
import "./icon.js";
import "./line.js";
import "./image.js";
import "./table.js";
import "./chart.js";

export { registerType, getType, allTypes } from "../../packages/model/registry.js";
export { buildAddItems } from "./menu.js";
