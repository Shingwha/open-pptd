// ============================================================================
// theme-presets.js — 内置主题数据（默认主题 + 15 套预设，纯数据无逻辑）
// ----------------------------------------------------------------------------
// 从 theme.js 拆出：主题解析逻辑在 theme.js（normalizeTheme / resolveColor 等），
// 本模块只存放主题对象。新增主题预设只需在这里加一个键。
// theme.js 对两者 re-export，既有 import 无需改动。
// ============================================================================

export const DEFAULT_THEME = {
  name: "蓝色",
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
    // 图表系列色板（麦肯锡式：主色系深浅阶梯 + 沉稳辅助色）
    series: [
      "#002E5D", "#3A6EA5", "#7FB2D9", "#C9A227",
      "#B5503C", "#5C8A6A", "#7B6BA8", "#8A8F98",
    ],
  },
  fonts: {
    latin: "Microsoft YaHei",
    ea: "Microsoft YaHei",
  },
  textStyles: {
    title:    { fontSize: 32, color: "$text", bold: true, lineHeight: 1.3 },
    subtitle: { fontSize: 16, color: "$muted", lineHeight: 1.4 },
    body:     { fontSize: 16, color: "$text", lineHeight: 1.6 },
    caption:  { fontSize: 12, color: "$muted", lineHeight: 1.4 },
    quote:    { fontSize: 16, color: "$text", italic: true, lineHeight: 1.6 },
  },
  tableStyles: {
    headerFill: "$primary",
    headerColor: "#FFFFFF",
    headerBold: true,
    // 留空则派生自主题 primary（边框 = primary 浅色调，斑马 = primary 极浅）
    zebraFill: "",
    borderColor: "",
    cellPadding: 4, // pt
  },
  chartStyles: {
    labelColor: "$text",
    axisColor: "$line",
    gridColor: "$line",
    legendColor: "$text",
    dataLabelColor: "$text",
    seriesColors: "$series",
  },
};


// ----------------------------------------------------------------------------
// 内置主题预设（UI 一键切换；normalizeTheme 深合并，未覆盖项继承默认）
// 15 套通用色系：按色彩家族命名（蓝/红/绿/紫/黑白/黄/橙/青/灰/棕 + 玫瑰/莫兰迪/橄榄/樱花/朱砂），
// 参考麦肯锡咨询风格：主色沉稳低饱和 + 金色点缀 + 系列色深浅阶梯。
// ----------------------------------------------------------------------------
export const THEME_PRESETS = {
  // blue 引用 DEFAULT_THEME（默认 = 麦肯锡蓝）；normalizeTheme 深拷贝，无共享突变风险
  blue: { ...DEFAULT_THEME },
  // 麦肯锡咨询：官方品牌色（Ink 墨蓝 #051C2C + Bright Blue 亮蓝 #00A0DC）
  mckinsey: {
    name: "麦肯锡深蓝",
    colors: {
      primary: "#051C2C", // McKinsey Ink 墨蓝
      accent: "#00A0DC", // McKinsey Bright Blue 亮蓝
      bg: "#FFFFFF",
      text: "#152433",
      muted: "#5B6B7C",
      line: "#E4EAF0",
      success: "#1F7A5C",
      warning: "#C07B17",
      danger: "#B23B3B",
      // 图表系列：墨蓝 → 亮蓝 → 浅蓝阶梯 + 青/金沉稳辅助
      series: ["#051C2C", "#00A0DC", "#5FB4E4", "#A8CDE4", "#00B4A5", "#C9A227", "#7A8699", "#3D5A80"],
    },
  },
  red: {
    name: "红色",
    colors: {
      primary: "#A6192E", accent: "#002E5D", bg: "#FFFFFF",
      text: "#33272A", muted: "#7A6A6E", line: "#F0E2E4",
      success: "#2E6B4F", warning: "#A16207", danger: "#C0392B",
      series: ["#A6192E", "#C05A5A", "#E3A3A3", "#002E5D", "#C9A227", "#5C8A6A", "#7B6BA8", "#8A8F98"],
    },
  },
  green: {
    name: "绿色",
    colors: {
      primary: "#1E6B3C", accent: "#C9A227", bg: "#FFFFFF",
      text: "#1F2E26", muted: "#5A6B60", line: "#E3E9E4",
      success: "#15803D", warning: "#A16207", danger: "#A63A3A",
      series: ["#1E6B3C", "#4C8A5E", "#8FBF9F", "#C9A227", "#002E5D", "#B5503C", "#7B6BA8", "#8A8F98"],
    },
  },
  purple: {
    name: "紫色",
    colors: {
      primary: "#5B2D86", accent: "#B98A2E", bg: "#FFFFFF",
      text: "#2A2440", muted: "#6E6680", line: "#E9E4F3",
      success: "#2E6B4F", warning: "#A16207", danger: "#A63A3A",
      series: ["#5B2D86", "#7B5BA8", "#B49BD1", "#C9A227", "#002E5D", "#5C8A6A", "#B5503C", "#8A8F98"],
    },
  },
  black: {
    name: "黑白",
    colors: {
      primary: "#111827", accent: "#C9A227", bg: "#FFFFFF",
      text: "#1F2937", muted: "#6B7280", line: "#E8E8E8",
      success: "#15803D", warning: "#B45309", danger: "#B91C1C",
      series: ["#111827", "#4B5563", "#9CA3AF", "#D1D5DB", "#C9A227", "#5B2D86", "#0E7490", "#B5503C"],
    },
  },
  yellow: {
    name: "黄色",
    colors: {
      primary: "#A16207", accent: "#C9A227", bg: "#FFFFFF",
      text: "#33291A", muted: "#7A6E58", line: "#EFE7D6",
      success: "#2E6B4F", warning: "#B45309", danger: "#A63A3A",
      series: ["#A16207", "#C9A227", "#E3C36B", "#002E5D", "#B5503C", "#5C8A6A", "#7B6BA8", "#8A8F98"],
    },
  },
  orange: {
    name: "橙色",
    colors: {
      primary: "#C2410C", accent: "#34495E", bg: "#FFFFFF",
      text: "#33261F", muted: "#7A6A5E", line: "#EFE7DF",
      success: "#2E6B4F", warning: "#A16207", danger: "#B91C1C",
      series: ["#C2410C", "#E07B39", "#F2B989", "#34495E", "#C9A227", "#5C8A6A", "#A6192E", "#8A8F98"],
    },
  },
  cyan: {
    name: "青色",
    colors: {
      primary: "#0E7490", accent: "#F59E0B", bg: "#FFFFFF",
      text: "#1B2B33", muted: "#5C7370", line: "#DDEAE8",
      success: "#15803D", warning: "#B45309", danger: "#B91C1C",
      series: ["#0E7490", "#14B8A6", "#67B7CC", "#F59E0B", "#155E75", "#6366F1", "#2E6B4F", "#8A8F98"],
    },
  },
  gray: {
    name: "灰色",
    colors: {
      primary: "#4B5563", accent: "#B5503C", bg: "#FFFFFF",
      text: "#1F2937", muted: "#6B7280", line: "#E5E7EB",
      success: "#2E6B4F", warning: "#A16207", danger: "#A63A3A",
      series: ["#4B5563", "#6B7280", "#9CA3AF", "#B5503C", "#C9A227", "#2E6B4F", "#5B2D86", "#0E7490"],
    },
  },
  brown: {
    name: "棕色",
    colors: {
      primary: "#6B4226", accent: "#D9A05B", bg: "#FFFFFF",
      text: "#332720", muted: "#7A6B5F", line: "#EDE5DC",
      success: "#2E6B4F", warning: "#A16207", danger: "#A63A3A",
      series: ["#6B4226", "#8A5C3B", "#B98A5E", "#D9A05B", "#A6192E", "#2E6B4F", "#4B5563", "#7B6BA8"],
    },
  },
  // 2025-08 扩充：按风格类型补齐（见 references/styles.md 推荐配色）
  // 说明：酒红≈朱砂、藏蓝≈蓝、墨青≈青、珊瑚≈橙 视觉重复已精简
  rose: {
    name: "玫瑰粉",
    colors: {
      primary: "#B43A5E", accent: "#8A6E3B", bg: "#FFFFFF",
      text: "#3A2230", muted: "#7A626C", line: "#F2E3E8",
      success: "#2E6B4F", warning: "#A16207", danger: "#A63A3A",
      series: ["#B43A5E", "#CE5F81", "#E5A3BA", "#8A6E3B", "#5B2D86", "#2E6B4F", "#B5503C", "#8A8F98"],
    },
  },
  morandi: {
    name: "莫兰迪",
    colors: {
      primary: "#7C8B7A", accent: "#B5A184", bg: "#FFFFFF",
      text: "#33352E", muted: "#76796F", line: "#E6E5DE",
      success: "#2E6B4F", warning: "#A16207", danger: "#A63A3A",
      series: ["#7C8B7A", "#96A392", "#BCC5B6", "#B5A184", "#B98A8A", "#8B9DB5", "#A89BB8", "#8A8F98"],
    },
  },
  olive: {
    name: "橄榄绿",
    colors: {
      primary: "#4A5D23", accent: "#B08D2E", bg: "#FFFFFF",
      text: "#2C3020", muted: "#6E7260", line: "#E7E9DC",
      success: "#2E6B4F", warning: "#A16207", danger: "#A63A3A",
      series: ["#4A5D23", "#6B8139", "#A5B46E", "#B08D2E", "#8A5C3B", "#2E6B4F", "#5B7D9E", "#8A8F98"],
    },
  },
  sakura: {
    name: "樱花",
    colors: {
      // 主色加深（白字表头对比度达标）；accent 用和风豆绿替代原雾蓝灰；系列粉×绿×金×雾蓝
      primary: "#C1507C", accent: "#8FAE8B", bg: "#FFFFFF",
      text: "#3E2733", muted: "#8A6E78", line: "#F6E3EA",
      success: "#2E6B4F", warning: "#A16207", danger: "#A63A3A",
      series: ["#C1507C", "#E584A6", "#F2B9CD", "#8FAE8B", "#D9A05B", "#B48EAD", "#6B8E9E", "#8A8F98"],
    },
  },
  vermilion: {
    name: "朱砂",
    colors: {
      primary: "#9E2B25", accent: "#C9A227", bg: "#FFFFFF",
      text: "#33231F", muted: "#7A6A60", line: "#F0E4DE",
      success: "#2E6B4F", warning: "#A16207", danger: "#A63A3A",
      series: ["#9E2B25", "#B84E43", "#D99282", "#C9A227", "#3A3A32", "#2E6B4F", "#7B6BA8", "#8A8F98"],
    },
  },
  // 2025-09 扩充：handbook 规范手册风格专属（见 references/styles.md 第 10 节）
  // 深松绿 + 沙金：文档感、稳重克制，区别于亮绿（green）/军绿（olive）/灰绿（morandi）
  pine: {
    name: "青松",
    colors: {
      primary: "#1E4D3B", accent: "#B98D4A", bg: "#FFFFFF",
      text: "#22332B", muted: "#64746B", line: "#E2E8E3",
      success: "#2E6B4F", warning: "#A16207", danger: "#A63A3A",
      series: ["#1E4D3B", "#3D7A5E", "#7FAE93", "#B98D4A", "#4B5563", "#8A5C3B", "#5B7D9E", "#C9A227"],
    },
  },
};
