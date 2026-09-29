// ============================================================================
// types/group.js — 组合元素类型（editor 侧）
// ----------------------------------------------------------------------------
// 取舍（U1/T3，写入 commit message）：
//   - 「组 = 子元素集合」：group 元素只持有 children（成员 id 列表）与包围盒，
//     成员元素仍留在 page.elements 中照常渲染；group 自身无独立外观（render 返回
//     null，renderPage 自动跳过）。故 **packages/renderer 零改动**。
//   - 导出：writer 无 group.toXml → 导出时跳过组壳、成员各自导出（内容不丢）。
//   - 已知限制：packages/model/style-spec.js 的 ELEMENT_TYPES 未含 group，
//     注册时会有一条 console.warn；`open-pptd check` 校验含 group 的 deck 会报
//     未知类型。引擎侧 group 支持超出 U1 范围（U1 红线：packages/ 零 diff）。
//   - 变换：移动/缩放同时作用于 children；不支持整体旋转（保持行为可预期）。
// ============================================================================

import { registerType } from "../../packages/model/index.js";

registerType({
  type: "group",
  label: "组合",
  // 组无独立外观：成员元素自身渲染（renderPage 见 null 即跳过）
  render: () => null,
  // 属性面板专属分组：无（位置/对齐/层级由通用面板给出）
  props: () => [],
});
