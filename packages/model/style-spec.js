// ============================================================================
// model/style-spec.js — 元素样式规格（renderer 与 writer 的单一事实来源）
// ----------------------------------------------------------------------------
// 同一份 DSL 规格在这里定义一次，两个消费端各自只做"规格 → 目标格式"的薄投影：
//   - packages/renderer → CSS / SVG 属性
//   - packages/writer   → OOXML 元素
// 禁止在消费端再写字面量映射表（历史上 dash/fill/border/align 各有 4~8 份副本）。
// ============================================================================

// ---- 元素类型（canonical 清单；registry.js 的注册键、validate.js 的已知类型）----
export const ELEMENT_TYPES = ["text", "shape", "line", "image", "icon", "table", "chart"];

// ---- 虚线样式（Border.style / LineStyle，references/pptd.md）----
// 一份定义，三个投影：css = SVG stroke-dasharray；cssBorder = CSS border-style /
// ECharts lineStyle.type；ooxml = a:prstDash val。
export const DASH_STYLES = {
  dash: { css: "6 4", cssBorder: "dashed", ooxml: "dash" },
  dot: { css: "2 3", cssBorder: "dotted", ooxml: "dot" },
};

/** Border.style → 投影对象；solid/未知 → null。 */
export function dashSpec(style) {
  return DASH_STYLES[style] || null;
}

// ---- 填充（FillSpec：string 色 / {type:solid} / {type:gradient} / {type:image}）----
/**
 * FillSpec 归一化 → 判别联合：
 *   { type: "solid", color } | { type: "gradient", ... } | { type: "image", ... } | null
 * 容忍两种旧形态：裸颜色字符串、省略 type 的 { color } 对象（按纯色处理）。
 * 渐变/图片对象原样透传（字段多，消费端自取）；无效输入返回 null。
 */
export function normalizeFill(fill) {
  if (!fill) return null;
  if (typeof fill === "string") return { type: "solid", color: fill };
  if (typeof fill !== "object") return null;
  if (fill.type === "solid" || fill.type === "gradient" || fill.type === "image") return fill;
  if (fill.type == null && fill.color != null) return { type: "solid", color: fill.color }; // 旧 {color} 形态
  return null;
}

// ---- 边框（BorderSpec → 四边）----
/** 默认单元格边框（全继承链未设置时）：1px 黑色实线四边。 */
export const DEFAULT_CELL_BORDER = { style: "solid", width: 1, color: "#000000" };

/**
 * BorderSpec → 四边 { top, right, bottom, left }：
 *   undefined（全链未设置）→ 默认 1px 黑四边；null → 四边全无（显式清除）；
 *   两元素数组 [上下, 左右]；四元素数组 [上, 右, 下, 左]（顺时针）；单 Border → 四边相同。
 * 边的值是 Border 对象或 null（该边无边框）。
 */
export function borderSides(spec) {
  if (spec === undefined) {
    return { top: DEFAULT_CELL_BORDER, right: DEFAULT_CELL_BORDER, bottom: DEFAULT_CELL_BORDER, left: DEFAULT_CELL_BORDER };
  }
  if (spec === null) return { top: null, right: null, bottom: null, left: null };
  if (Array.isArray(spec)) {
    if (spec.length === 2) return { top: spec[0], bottom: spec[0], left: spec[1], right: spec[1] }; // [上下, 左右]
    if (spec.length === 4) return { top: spec[0], right: spec[1], bottom: spec[2], left: spec[3] }; // [上,右,下,左]
  }
  return { top: spec, right: spec, bottom: spec, left: spec };
}

// ---- 水平对齐（align[0]，references/pptd.md §TextContent）----
const H_ALIGN_CSS = { left: "left", center: "center", right: "right", justify: "justify", distributed: "justify" };
const H_ALIGN_OOXML = { left: "l", center: "ctr", right: "r", justify: "just", distributed: "dist" };

/** 水平对齐 → CSS text-align 值；未知 → null。distributed 无原生 CSS 等价，
 *  映射为 justify，消费端需自行追加 text-align-last:justify（见 cssTextAlignLast）。 */
export function cssTextAlign(align) {
  return H_ALIGN_CSS[align] || null;
}

/** distributed 对齐需要同时声明 text-align-last:justify（否则末行不拉伸）。 */
export function cssTextAlignLast(align) {
  return align === "distributed" ? "justify" : null;
}

/** 水平对齐 → OOXML algn 属性值；未知 → null。 */
export function ooxmlAlign(align) {
  return H_ALIGN_OOXML[align] || null;
}

// ---- 阴影（ShadowSpec：{ color?, blur?, offset?: [x, y] }，offset 向下为正）----
/** 阴影偏移 → [dx, dy]（缺省 [0, 0]）；无阴影返回 null。 */
export function shadowOffset(shadow) {
  if (!shadow) return null;
  const [dx = 0, dy = 0] = shadow.offset || [0, 0];
  return [dx, dy];
}
