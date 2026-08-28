// ============================================================================
// model/registry.js — 元素类型注册表契约（扩展性核心，支持分片注册）
// ----------------------------------------------------------------------------
// 每种元素类型 = 一个逻辑条目，字段由三个层分别注册（同一 type 多次注册时
// 合并字段，Object.assign 语义；仅当同一字段被不同值覆盖时 console.warn）：
//   {
//     type: "text",                // 元素类型标识（elementType）
//     render: (theme, el) => DOM,  // 预览渲染分片（packages/renderer/types/）
//     toXml: (theme, el, ctx) => string, // OOXML 导出分片（packages/writer/types/）
//     label: "文字",                // 中文名（属性面板徽标等，editor UI 分片）
//     menu: { group, items },      // 添加菜单（＋面板，editor UI 分片）
//     create: () => element,       // 新建默认元素（editor UI 分片）
//     props: (el, h) => [node],    // 属性面板专属分组（editor UI 分片）
//     quickbar: (el, h) => void,   // 浮动快调条（editor UI 分片）
//   }
// 装配方按需引入分片：编辑器 editor/types/index.js 聚合全部；CLI 导出只引
// writer 分片；渲染截图只引 renderer 分片。
// ============================================================================

import { ELEMENT_TYPES } from "./style-spec.js";

const TYPES = new Map();

export function registerType(def) {
  if (!def || typeof def.type !== "string") throw new Error("[types] registerType 需要 { type }");
  if (!ELEMENT_TYPES.includes(def.type)) console.warn(`[types] 注册未知元素类型 ${def.type}（见 model/style-spec.js ELEMENT_TYPES）`);
  const prev = TYPES.get(def.type);
  if (!prev) {
    TYPES.set(def.type, def);
    return;
  }
  // 分片注册：合并字段而非整体覆盖；同一字段被不同值覆盖时警告
  for (const key of Object.keys(def)) {
    if (key === "type") continue;
    if (key in prev && prev[key] !== def[key]) {
      console.warn(`[types] 元素类型 ${def.type} 的 ${key} 重复注册，后者覆盖`);
    }
    prev[key] = def[key];
  }
}

/** 取类型定义；未注册返回 undefined（消费端回退占位/警告）。 */
export function getType(type) {
  return TYPES.get(type);
}

/** 全部已注册类型（按注册顺序）。 */
export function allTypes() {
  return [...TYPES.values()];
}
