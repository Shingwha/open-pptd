// ============================================================================
// model.js — 统一数据模型（渲染器与 writer 共享的唯一事实来源）
// ----------------------------------------------------------------------------
// 支持组件子集（第二版精简）：
//   text / shape(基础5+预置几何21) / line / image / icon / table / chart(7常用类型)
// 页面背景、页面类型、fade 过渡由 writer 直接写。
// ============================================================================

import { PRESET_SHAPES } from "./preset-geometry.data.js";

export const PAGE_WIDTH = 960;
export const PAGE_HEIGHT = 540;

/** 支持形状清单（key=shapeName）。基础 5 种 + ECMA-376 预置几何（见 preset-geometry.data.js）。 */
export const SUPPORTED_SHAPES = {
  rect: { label: "矩形", preset: "rect", adjustments: null },
  roundRect: { label: "圆角矩形", preset: "roundRect", adjustments: [16667] },
  ellipse: { label: "椭圆", preset: "ellipse", adjustments: null },
  triangle: { label: "三角形", preset: "triangle", adjustments: [50000] },
  diamond: { label: "菱形", preset: "diamond", adjustments: null },
  // 以下来自 ECMA-376 预置几何（adjustments 默认值 = 规范 avLst 默认）
  ...Object.fromEntries(
    Object.entries(PRESET_SHAPES).map(([name, def]) => [
      name,
      { label: def.label, preset: name, adjustments: def.adjDefault.length ? def.adjDefault : null },
    ])
  ),
};

export const PAGE_TYPES = ["cover", "table_of_contents", "chapter", "content", "final"];

// ----------------------------------------------------------------------------
// 创建与校验
// ----------------------------------------------------------------------------
export function createDeck({ title = "未命名演示文稿", size = [PAGE_WIDTH, PAGE_HEIGHT], theme = null, fonts = null, pages = [] } = {}) {
  return { version: "v2", title, size, theme, fonts, pages };
}

export function createPage({ pageType = "content", background = null, notes = "", elements = [] } = {}) {
  return { pageType, background, notes, elements };
}

let _idSeq = 0;
/** 生成唯一 elementId。 */
export function nextElementId(prefix = "el") {
  _idSeq += 1;
  return `${prefix}${_idSeq}`;
}

/**
 * 扫描 deck 现有 elementId 的最大编号并重置计数器，
 * 保证加载新项目后新建元素的 id 连续可读（el4、el5…）。
 */
export function syncElementId(deck) {
  let max = 0;
  for (const page of deck.pages || []) {
    for (const el of page.elements || []) {
      const m = /^el(\d+)$/.exec(el.elementId || "");
      if (m) max = Math.max(max, Number(m[1]));
    }
  }
  _idSeq = max;
}
