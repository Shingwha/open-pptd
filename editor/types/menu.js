// ============================================================================
// types/menu.js — 添加菜单聚合（从注册表派生 ＋ 面板的数据源）
// ----------------------------------------------------------------------------
// 所有类型的 menu 声明汇集成 ADD_ITEMS（id → item）+ ADD_MENU（分组列表），
// toolbar 直接消费，无需手写按钮绑定。
// ============================================================================

import { allTypes } from "./registry.js";

const GROUP_ORDER = ["基础", "形状", "箭头", "图标", "图表", "数据"];

/** 全部菜单项（id → item；item 可为 { create } 或自带 onClick）。 */
export function buildAddItems() {
  const items = {};
  for (const t of allTypes()) {
    for (const it of t.menu?.items || []) items[it.id] = it;
  }
  return items;
}

/** 分组菜单（按 GROUP_ORDER 排序，未知分组追加在后）。 */
export function buildAddMenu() {
  const byGroup = new Map();
  for (const t of allTypes()) {
    const menu = t.menu;
    if (!menu) continue;
    if (!byGroup.has(menu.group)) byGroup.set(menu.group, []);
    for (const it of menu.items) {
      // 条目级 group 覆盖（如形状类型内拆出「箭头」分组）
      const g = it.group || menu.group;
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g).push(it);
    }
  }
  return [...byGroup.keys()]
    .sort((a, b) => {
      const ia = GROUP_ORDER.indexOf(a);
      const ib = GROUP_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    })
    .map((group) => ({ group, ids: byGroup.get(group).map((it) => it.id) }));
}
