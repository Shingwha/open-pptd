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

// ---- 箭头类型（Line.arrow，references/pptd.md）----
// 单表两端投影：ooxml = a:headEnd/tailEnd@type 值；renderer 按同名形状画 SVG。
export const ARROW_TYPES = {
  arrow: "triangle",
  stealth: "stealth",
  diamond: "diamond",
  oval: "oval",
};

/** 箭头类型 → OOXML headEnd/tailEnd type 值；未知回退 triangle。 */
export function ooxmlArrow(type) {
  return ARROW_TYPES[type] || "triangle";
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

/** 水平对齐 → CSS text-align 值；未知 → null。distributed 无原生 CSS 等价，
 *  映射为 justify，消费端需自行追加 text-align-last:justify（见 cssTextAlignLast）。 */
export function cssTextAlign(align) {
  return H_ALIGN_CSS[align] || null;
}

/** distributed 对齐需要同时声明 text-align-last:justify（否则末行不拉伸）。 */
export function cssTextAlignLast(align) {
  return align === "distributed" ? "justify" : null;
}

// ---- 水平对齐 / 垂直锚点 → OOXML（a:pPr@algn、a:bodyPr/tcPr@anchor 同源单表）----
const H_ALIGN_OOXML = { left: "l", center: "ctr", right: "r", justify: "just", distributed: "dist" };
const V_ANCHOR_OOXML = { top: "t", middle: "ctr", bottom: "b" };

/** 水平对齐 → a:pPr@algn 值；未知 → null。 */
export function ooxmlTextAlign(align) {
  return H_ALIGN_OOXML[align] || null;
}

/** 垂直对齐 → anchor 值；未知 → null（消费端决定自己的缺省）。 */
export function ooxmlAnchor(align) {
  return V_ANCHOR_OOXML[align] || null;
}

// ---- 列表缩进（ol/ul：文字左缘 = 一级缩进，bullet 悬挂在缩进带内）----
// 预览 padding-left 与导出 marL/indent=-marL 同源（曾两端各写一个值且不等）。
export const LIST_INDENT = 18; // pt/px

// ---- 阴影（ShadowSpec：{ color?, blur?, offset?: [x, y] }，offset 向下为正）----
/** 阴影偏移 → [dx, dy]（缺省 [0, 0]）；无阴影返回 null。 */
export function shadowOffset(shadow) {
  if (!shadow) return null;
  const [dx = 0, dy = 0] = shadow.offset || [0, 0];
  return [dx, dy];
}

// 缺省值单源（两端唯一默认）：黑、无模糊、零偏移。此前三套默认并存
// （预览 box/drop 0.3 透明黑 + 6px 模糊、预览文字无默认、导出黑 + 0 模糊），
// 同一阴影预览≠导出，且预览文字阴影无 color 时整条 CSS 非法被浏览器丢弃。
export const SHADOW_DEFAULTS = { color: "#000000", blur: 0, offset: [0, 0] };

/** ShadowSpec 补齐缺省 → { dx, dy, blur, color }；无阴影返回 null。 */
export function effectiveShadow(shadow) {
  const offset = shadowOffset(shadow);
  if (!offset) return null;
  return {
    dx: offset[0],
    dy: offset[1],
    blur: shadow.blur ?? SHADOW_DEFAULTS.blur,
    color: shadow.color || SHADOW_DEFAULTS.color,
  };
}
