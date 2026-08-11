// ============================================================================
// theme-presets.js — 内置主题数据（默认主题 + 10 套配色预设，纯数据无逻辑）
// ----------------------------------------------------------------------------
// 结构严格对齐官方 Theme（references/pptd.md §3 Theme）：
//   { colors: Record<string, Color>, textStyles: Record<string, TextStyleConfig>,
//     tableStyles: Record<string, TableStyleConfig> }
// 无官方之外的顶层字段。配色 = 生成时一次性设计决策（对齐 Kimi skill 工作流），
// 编辑器提供 10 套 colors 预设一键应用（详见 docs/editor-v2-ux.md）。
//
// colors 键约定（均为合法 $引用目标，全部显式 hex，不依赖动态派生）：
//   primary/accent/bg/text/muted/line/success/warning/danger 语义色
//   primarySoft/primaryTint/primaryDeep 主色深浅派生（表头浅底/卡片/深底等场景）
//   accent3/accent4/accent5/accent6 图表系列色槽位（PPTX 主题 accent3-6；
//     accent1/2 固定 = primary/accent；图表系列色循环 = accent1-6，见 themeChartPalette）
// 键集固定 17 键，每套预设必须齐全（否则 textStyles 的 $text/$muted 与图表循环悬空）。
// textStyles 默认 5 键：title/subtitle/body/caption/quote（任意键均可扩展）
// tableStyles.default 为官方 TableStyleConfig（全表基底/表头行/斑马纹/边框）
// ============================================================================

export const DEFAULT_THEME = {
  colors: {
    primary: "#002E5D", // 麦肯锡蓝（品牌基准色）
    accent: "#C9A227", // 金（麦肯锡常用搭配色）
    bg: "#FFFFFF",
    text: "#1B2A3A",
    muted: "#5A6B7C",
    line: "#E2E8EE",
    success: "#2E6B4F",
    warning: "#A16207",
    danger: "#A63A3A",
    // 主色派生（显式 hex；primarySoft=浅底、primaryTint=卡片、primaryDeep=深底）
    primarySoft: "#F0F2F5",
    primaryTint: "#E0E6EC",
    primaryDeep: "#002143",
    // 图表系列色槽位（accent1-6 循环：1=primary、2=accent、3-6 如下）
    accent3: "#3A6EA5",
    accent4: "#7FB2D9",
    accent5: "#B5503C",
    accent6: "#5C8A6A",
  },
  textStyles: {
    title: { fontSize: 32, color: "$text", bold: true, lineHeight: 1.3 },
    subtitle: { fontSize: 16, color: "$muted", lineHeight: 1.4 },
    body: { fontSize: 16, color: "$text", lineHeight: 1.6 },
    caption: { fontSize: 12, color: "$muted", lineHeight: 1.4 },
    quote: { fontSize: 16, color: "$text", italic: true, lineHeight: 1.6 },
  },
  tableStyles: {
    default: {
      // 全表基底：白底 + 浅灰边框 + 正文 13pt（显式声明 → 编辑器默认浅灰边框；
      // 未引用任何表格样式的表格才走官方默认黑边框）
      cellStyle: {
        fontSize: 13,
        color: "$text",
        fill: { type: "solid", color: "#FFFFFF" },
        border: { style: "solid", width: 1, color: "$line" },
      },
      // 表头行：主题主色底 + 白字加粗
      firstRowStyle: {
        fill: { type: "solid", color: "$primary" },
        color: "#FFFFFF",
        bold: true,
      },
      // 数据行斑马纹：主色极浅底交替（数据行索引 0、2…取第 1 项，1、3…取第 2 项）
      bodyStyles: [
        { fill: { type: "solid", color: "$primarySoft" } },
        { fill: { type: "solid", color: "#FFFFFF" } },
      ],
      rowOverColumn: true,
    },
  },
};

// ----------------------------------------------------------------------------
// 10 套配色预设（colors 键集齐全，每套 = 完整 17 键）
// 命名按色彩家族，参考麦肯锡咨询风格：主色沉稳低饱和 + 点缀色 + 系列色深浅阶梯。
// 色值设计依据见 docs/editor-v2-ux.md §1.3（consult 沿用 DEFAULT_THEME）。
// ----------------------------------------------------------------------------

/** 每套配色中与 DEFAULT_THEME 相同的公共键（bg/success/warning/danger 等按套覆写）。 */
const COMMON = {
  bg: "#FFFFFF",
  muted: "#5A6B7C",
  line: "#E2E8EE",
  success: "#2E6B4F",
  warning: "#A16207",
  danger: "#A63A3A",
  primarySoft: "#F0F2F5",
  primaryTint: "#E0E6EC",
  primaryDeep: "#002143",
};

export const THEME_PALETTES = {
  // 1. 咨询蓝（默认主题同源）
  consult: {
    name: "咨询蓝",
    colors: {
      ...COMMON,
      primary: "#002E5D", accent: "#C9A227",
      text: "#1B2A3A",
      accent3: "#3A6EA5", accent4: "#7FB2D9", accent5: "#B5503C", accent6: "#5C8A6A",
    },
  },
  // 2. 科技青
  tech: {
    name: "科技青",
    colors: {
      ...COMMON,
      primary: "#0E7490", accent: "#F59E0B",
      text: "#1B2B33", muted: "#5C7370", line: "#DDEAE8",
      success: "#15803D", warning: "#B45309", danger: "#B91C1C",
      primarySoft: "#F1F7F8", primaryTint: "#E2EEF2", primaryDeep: "#0A5468",
      accent3: "#1E9AB0", accent4: "#7CC7DB", accent5: "#D97706", accent6: "#64748B",
    },
  },
  // 3. 活力橙
  orange: {
    name: "活力橙",
    colors: {
      ...COMMON,
      primary: "#C2410C", accent: "#34495E",
      text: "#33261F", muted: "#7A6A5E", line: "#EFE7DF",
      success: "#2E6B4F", warning: "#A16207", danger: "#B91C1C",
      primarySoft: "#FBF4F0", primaryTint: "#F8E8E2", primaryDeep: "#8C2F09",
      accent3: "#E2703A", accent4: "#F2A97E", accent5: "#5D7FA3", accent6: "#9BB0C9",
    },
  },
  // 4. 森林绿
  green: {
    name: "森林绿",
    colors: {
      ...COMMON,
      primary: "#1E6B3C", accent: "#C9A227",
      text: "#1F2E26", muted: "#5A6B60", line: "#E3E9E4",
      success: "#15803D", warning: "#A16207", danger: "#A63A3A",
      primarySoft: "#F2F6F3", primaryTint: "#E4EDE8", primaryDeep: "#164D2B",
      accent3: "#3D8B5C", accent4: "#7FB58F", accent5: "#B5503C", accent6: "#6B9B84",
    },
  },
  // 5. 沉稳红
  red: {
    name: "沉稳红",
    colors: {
      ...COMMON,
      primary: "#A6192E", accent: "#002E5D",
      text: "#33272A", muted: "#7A6A6E", line: "#F0E2E4",
      success: "#2E6B4F", warning: "#A16207", danger: "#C0392B",
      primarySoft: "#FAF1F2", primaryTint: "#F4E3E6", primaryDeep: "#781221",
      accent3: "#BC3F4A", accent4: "#E3A0A7", accent5: "#4A6FA5", accent6: "#8FA8C8",
    },
  },
  // 6. 优雅紫
  purple: {
    name: "优雅紫",
    colors: {
      ...COMMON,
      primary: "#5B2D86", accent: "#B98A2E",
      text: "#2A2440", muted: "#6E6680", line: "#E9E4F3",
      success: "#2E6B4F", warning: "#A16207", danger: "#A63A3A",
      primarySoft: "#F5F2F8", primaryTint: "#EBE6F0", primaryDeep: "#422060",
      accent3: "#7B4FA8", accent4: "#A98BC9", accent5: "#C9A227", accent6: "#9E7FB8",
    },
  },
  // 7. 高级灰
  mono: {
    name: "高级灰",
    colors: {
      ...COMMON,
      primary: "#111827", accent: "#C9A227",
      text: "#1F2937", muted: "#6B7280", line: "#E8E8E8",
      success: "#15803D", warning: "#B45309", danger: "#B91C1C",
      primarySoft: "#F1F1F2", primaryTint: "#E2E3E5", primaryDeep: "#0C111C",
      accent3: "#4B5563", accent4: "#9CA3AF", accent5: "#6B7280", accent6: "#3A6EA5",
    },
  },
  // 8. 大地棕
  brown: {
    name: "大地棕",
    colors: {
      ...COMMON,
      primary: "#6B4226", accent: "#D9A05B",
      text: "#332720", muted: "#7A6B5F", line: "#EDE5DC",
      success: "#2E6B4F", warning: "#A16207", danger: "#A63A3A",
      primarySoft: "#F6F4F2", primaryTint: "#EDE8E5", primaryDeep: "#4D301B",
      accent3: "#8B5E3C", accent4: "#C49A76", accent5: "#7A8B6F", accent6: "#B98D4A",
    },
  },
  // 9. 莫兰迪
  morandi: {
    name: "莫兰迪",
    colors: {
      ...COMMON,
      primary: "#7C8B7A", accent: "#B5A184",
      text: "#33352E", muted: "#76796F", line: "#E6E5DE",
      success: "#2E6B4F", warning: "#A16207", danger: "#A63A3A",
      primarySoft: "#F7F8F7", primaryTint: "#EFF1EF", primaryDeep: "#596458",
      accent3: "#9DAE9B", accent4: "#C5CFC3", accent5: "#A9977A", accent6: "#8E9BA5",
    },
  },
  // 10. 樱花粉
  sakura: {
    name: "樱花粉",
    colors: {
      ...COMMON,
      primary: "#C1507C", accent: "#8FAE8B",
      text: "#3E2733", muted: "#8A6E78", line: "#F6E3EA",
      success: "#2E6B4F", warning: "#A16207", danger: "#A63A3A",
      primarySoft: "#FBF5F7", primaryTint: "#F8EAEF", primaryDeep: "#8B3A59",
      accent3: "#D980A3", accent4: "#EBB3C8", accent5: "#7FA07B", accent6: "#B98AC0",
    },
  },
};
