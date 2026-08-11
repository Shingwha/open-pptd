// ============================================================================
// types/menu.js — 添加菜单数据源（从注册表派生）
// ----------------------------------------------------------------------------
// 所有类型的 menu 声明汇集成 ADD_ITEMS（id → item）：
//   - interaction/add-menu.js 的面板按 id 查条目（基础卡片 / 图表网格 / 最近使用）
//   - 形状/图标的完整目录由 add-menu.js 直接从 SUPPORTED_SHAPES / ICONS 派生
//     （不再经过注册表 menu 声明——187 种形状不逐条声明）
// ============================================================================

import { allTypes } from "./registry.js";

/** 全部菜单项（id → item；item 可为 { create } 或自带 onClick）。 */
export function buildAddItems() {
  const items = {};
  for (const t of allTypes()) {
    for (const it of t.menu?.items || []) items[it.id] = it;
  }
  return items;
}
