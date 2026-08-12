// ============================================================================
// style.js — 文字样式继承链（渲染器与 writer 共享，唯一实现）
// ----------------------------------------------------------------------------
// 继承链（PPTD 规范）：run 内联 > 段落 > content 字段 > $style 主题引用 > 默认。
// 渲染器与导出器都调用 computeBaseStyle + mergeRunStyle，保证预览=导出。
// ============================================================================

import { resolveTextStyle } from "./theme.js";

export function pickDefined(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null) out[k] = v;
  }
  return out;
}

/**
 * 计算文本元素基线样式 = merge($style 主题配置, content 直接字段)。
 * content 直接字段优先于主题引用。
 *
 * 字体规则：
 *  - 显式 `style: "$title"` 等 → 用该令牌的字体（组件字体）
 *  - 无 style 引用的普通元素（显式字段写法）→ 继承 $body 的字体（正文组件字体，
 *    如 deck 声明了 fonts.body），没有则回退默认字体——保证组件字体全页生效
 */
export function computeBaseStyle(theme, content) {
  const fromTheme = resolveTextStyle(theme, content?.style);
  if (!content?.style && !content?.fontFamily && theme.textStyles?.body?.fontFamily) {
    fromTheme.fontFamily = theme.textStyles.body.fontFamily;
  }
  const direct = {
    color: content?.color,
    fontSize: content?.fontSize,
    fontFamily: content?.fontFamily,
    bold: content?.bold,
    italic: content?.italic,
    backgroundColor: content?.backgroundColor,
    lineHeight: content?.lineHeight,
    lineHeightPx: content?.lineHeightPx,
    letterSpacing: content?.letterSpacing,
    marginTop: content?.marginTop,
    // 文字装饰（官方 TextContent）：渐变作用于文字本身，阴影为文字阴影
    gradient: content?.gradient,
    shadow: content?.shadow,
    // content.align = [水平, 垂直]；水平对齐统一映射为 textAlign（预览=导出）
    textAlign: Array.isArray(content?.align) ? content.align[0] : undefined,
  };
  return { ...fromTheme, ...pickDefined(direct) };
}

/** run 最终样式 = 基线 + 段落样式 + run 内联样式（后者覆盖前者）。 */
export function mergeRunStyle(base, paraStyle, runStyle) {
  return { ...base, ...pickDefined(paraStyle), ...pickDefined(runStyle) };
}
