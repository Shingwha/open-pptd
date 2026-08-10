// ============================================================================
// theme-presets.js — 内置主题数据（默认主题 + 17 套预设，纯数据无逻辑）
// ----------------------------------------------------------------------------
// 结构严格对齐官方 Theme（references/official/pptd.md §3 Theme）：
//   { colors: Record<string, Color>, textStyles: Record<string, TextStyleConfig>,
//     tableStyles: Record<string, TableStyleConfig> }
// 无官方之外的顶层字段（name 等 UI 元数据放在 theme.js 的 THEME_NAMES 映射表）。
//
// colors 键约定（均为合法 $引用目标，全部显式 hex，不依赖动态派生）：
//   primary/accent/bg/text/muted/line/success/warning/danger 语义色
//   primarySoft/primaryTint/primaryDeep 主色深浅派生（表头浅底/卡片/深底等场景，
//   显式写死保证 预览 = 导出，不再用动态令牌）
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
// 内置主题预设（编辑器 UI「主题切换」用；normalizeTheme 深合并，未覆盖项继承默认）
// 17 套通用色系：每套只写 colors（官方结构），textStyles/tableStyles 继承默认。
// 颜色命名与默认主题一致；primarySoft/Tint/Deep 已按主色显式算好。
// ----------------------------------------------------------------------------
export const THEME_PRESETS = {
  blue: { colors: {} }, // = 默认主题（麦肯锡蓝）
  mckinsey: {
    colors: {
      primary: "#051C2C", // McKinsey Ink 墨蓝
      accent: "#00A0DC", // McKinsey Bright Blue 亮蓝
      bg: "#FFFFFF", text: "#152433", muted: "#5B6B7C", line: "#E4EAF0",
      success: "#1F7A5C", warning: "#C07B17", danger: "#B23B3B",
      primarySoft: "#F0F1F2", primaryTint: "#E1E4E6", primaryDeep: "#041420",
    },
  },
  red: {
    colors: {
      primary: "#A6192E", accent: "#002E5D", bg: "#FFFFFF",
      text: "#33272A", muted: "#7A6A6E", line: "#F0E2E4",
      success: "#2E6B4F", warning: "#A16207", danger: "#C0392B",
      primarySoft: "#FAF1F2", primaryTint: "#F4E3E6", primaryDeep: "#781221",
    },
  },
  green: {
    colors: {
      primary: "#1E6B3C", accent: "#C9A227", bg: "#FFFFFF",
      text: "#1F2E26", muted: "#5A6B60", line: "#E3E9E4",
      success: "#15803D", warning: "#A16207", danger: "#A63A3A",
      primarySoft: "#F2F6F3", primaryTint: "#E4EDE8", primaryDeep: "#164D2B",
    },
  },
  purple: {
    colors: {
      primary: "#5B2D86", accent: "#B98A2E", bg: "#FFFFFF",
      text: "#2A2440", muted: "#6E6680", line: "#E9E4F3",
      success: "#2E6B4F", warning: "#A16207", danger: "#A63A3A",
      primarySoft: "#F5F2F8", primaryTint: "#EBE6F0", primaryDeep: "#422060",
    },
  },
  black: {
    colors: {
      primary: "#111827", accent: "#C9A227", bg: "#FFFFFF",
      text: "#1F2937", muted: "#6B7280", line: "#E8E8E8",
      success: "#15803D", warning: "#B45309", danger: "#B91C1C",
      primarySoft: "#F1F1F2", primaryTint: "#E2E3E5", primaryDeep: "#0C111C",
    },
  },
  yellow: {
    colors: {
      primary: "#A16207", accent: "#C9A227", bg: "#FFFFFF",
      text: "#33291A", muted: "#7A6E58", line: "#EFE7D6",
      success: "#2E6B4F", warning: "#B45309", danger: "#A63A3A",
      primarySoft: "#F9F6F0", primaryTint: "#F4ECE1", primaryDeep: "#744705",
    },
  },
  orange: {
    colors: {
      primary: "#C2410C", accent: "#34495E", bg: "#FFFFFF",
      text: "#33261F", muted: "#7A6A5E", line: "#EFE7DF",
      success: "#2E6B4F", warning: "#A16207", danger: "#B91C1C",
      primarySoft: "#FBF4F0", primaryTint: "#F8E8E2", primaryDeep: "#8C2F09",
    },
  },
  cyan: {
    colors: {
      primary: "#0E7490", accent: "#F59E0B", bg: "#FFFFFF",
      text: "#1B2B33", muted: "#5C7370", line: "#DDEAE8",
      success: "#15803D", warning: "#B45309", danger: "#B91C1C",
      primarySoft: "#F1F7F8", primaryTint: "#E2EEF2", primaryDeep: "#0A5468",
    },
  },
  gray: {
    colors: {
      primary: "#4B5563", accent: "#B5503C", bg: "#FFFFFF",
      text: "#1F2937", muted: "#6B7280", line: "#E5E7EB",
      success: "#2E6B4F", warning: "#A16207", danger: "#A63A3A",
      primarySoft: "#F4F5F6", primaryTint: "#E9EBEC", primaryDeep: "#363D47",
    },
  },
  brown: {
    colors: {
      primary: "#6B4226", accent: "#D9A05B", bg: "#FFFFFF",
      text: "#332720", muted: "#7A6B5F", line: "#EDE5DC",
      success: "#2E6B4F", warning: "#A16207", danger: "#A63A3A",
      primarySoft: "#F6F4F2", primaryTint: "#EDE8E5", primaryDeep: "#4D301B",
    },
  },
  rose: {
    colors: {
      primary: "#B43A5E", accent: "#8A6E3B", bg: "#FFFFFF",
      text: "#3A2230", muted: "#7A626C", line: "#F2E3E8",
      success: "#2E6B4F", warning: "#A16207", danger: "#A63A3A",
      primarySoft: "#FBF3F5", primaryTint: "#F6E7EC", primaryDeep: "#822A44",
    },
  },
  morandi: {
    colors: {
      primary: "#7C8B7A", accent: "#B5A184", bg: "#FFFFFF",
      text: "#33352E", muted: "#76796F", line: "#E6E5DE",
      success: "#2E6B4F", warning: "#A16207", danger: "#A63A3A",
      primarySoft: "#F7F8F7", primaryTint: "#EFF1EF", primaryDeep: "#596458",
    },
  },
  olive: {
    colors: {
      primary: "#4A5D23", accent: "#B08D2E", bg: "#FFFFFF",
      text: "#2C3020", muted: "#6E7260", line: "#E7E9DC",
      success: "#2E6B4F", warning: "#A16207", danger: "#A63A3A",
      primarySoft: "#F4F5F2", primaryTint: "#E9ECE5", primaryDeep: "#354319",
    },
  },
  sakura: {
    colors: {
      primary: "#C1507C", accent: "#8FAE8B", bg: "#FFFFFF",
      text: "#3E2733", muted: "#8A6E78", line: "#F6E3EA",
      success: "#2E6B4F", warning: "#A16207", danger: "#A63A3A",
      primarySoft: "#FBF5F7", primaryTint: "#F8EAEF", primaryDeep: "#8B3A59",
    },
  },
  vermilion: {
    colors: {
      primary: "#9E2B25", accent: "#C9A227", bg: "#FFFFFF",
      text: "#33231F", muted: "#7A6A60", line: "#F0E4DE",
      success: "#2E6B4F", warning: "#A16207", danger: "#A63A3A",
      primarySoft: "#F9F2F2", primaryTint: "#F3E6E5", primaryDeep: "#721F1B",
    },
  },
  pine: {
    colors: {
      primary: "#1E4D3B", accent: "#B98D4A", bg: "#FFFFFF",
      text: "#22332B", muted: "#64746B", line: "#E2E8E3",
      success: "#2E6B4F", warning: "#A16207", danger: "#A63A3A",
      primarySoft: "#F2F4F3", primaryTint: "#E4EAE7", primaryDeep: "#16372A",
    },
  },
};
