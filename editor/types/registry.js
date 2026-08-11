// ============================================================================
// types/registry.js — 元素类型注册表（扩展性核心）
// ----------------------------------------------------------------------------
// 每种元素类型 = 一个模块，注册：
//   {
//     type: "text",                // 元素类型标识（elementType）
//     label: "文字",                // 中文名（属性面板徽标等）
//     menu: { group, items },      // 添加菜单（＋面板）
//     create: () => element,       // 新建默认元素
//     render: (theme, el) => DOM,  // 预览渲染（renderer/）
//     toXml: (theme, el, ctx) => string, // OOXML 导出（writer/）
//     props: (el, h) => [node],    // 属性面板专属分组（低频/精调属性全集）
//     quickbar: (el, h) => void,   // 浮动快调条（高频直觉操作，与面板不重复）
//   }
// 新增元素类型：新建 types/xxx.js 注册 + types/index.js 引入一行，即完成
// （渲染/导出/属性/快速条/菜单全部自动接入，无需改任何分派代码）。
// ============================================================================

const TYPES = new Map();

export function registerType(def) {
  if (!def || typeof def.type !== "string") throw new Error("[types] registerType 需要 { type }");
  if (TYPES.has(def.type)) console.warn(`[types] 元素类型 ${def.type} 重复注册，后者覆盖`);
  TYPES.set(def.type, def);
}

/** 取类型定义；未注册返回 undefined（消费端回退占位/警告）。 */
export function getType(type) {
  return TYPES.get(type);
}

/** 全部已注册类型（按注册顺序）。 */
export function allTypes() {
  return [...TYPES.values()];
}
