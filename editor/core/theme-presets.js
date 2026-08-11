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
//
// 2026-08 配色更新：10 套全部重设计（每套独立色彩家族，主色+点缀色有性格；
// 图表系列色 6 槽与家族和谐且彼此可区分；primarySoft/Tint/Deep 严格由主色派生；
// 白字压主色表头的对比度达标；中性色 text/muted/line 带家族色相）。
// ============================================================================

export const DEFAULT_THEME = {
  colors: {
    primary: "#16324F", // 深海军蓝（默认主题基准色）
    accent: "#C9962E", // 复古金（常用搭配色）
    bg: "#FFFFFF",
    text: "#16222E",
    muted: "#5C6C7E",
    line: "#E3E8EF",
    success: "#2F7D52",
    warning: "#A86A1F",
    danger: "#C0524E",
    // 主色派生（显式 hex；primarySoft=浅底、primaryTint=卡片、primaryDeep=深底）
    primarySoft: "#EEF2F7",
    primaryTint: "#DCE4EE",
    primaryDeep: "#0E2236",
    // 图表系列色槽位（accent1-6 循环：1=primary、2=accent、3-6 如下）
    accent3: "#3D6B99",
    accent4: "#7FA6CB",
    accent5: "#C26B4E",
    accent6: "#5D8A72",
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
// 每套独立色彩家族：主色沉稳 + 有性格的点缀色 + 6 槽图表系列色（深浅阶梯）。
// 色值设计依据见 docs/editor-v2-ux.md §1.3（consult 沿用 DEFAULT_THEME）。
// ----------------------------------------------------------------------------

/** 各套共享键（白底）。 */
const COMMON = {
  bg: "#FFFFFF",
};

export const THEME_PALETTES = {
  // 1. 咨询蓝（默认主题同源）：深海军蓝 + 复古金
  consult: {
    name: "咨询蓝",
    colors: {
      ...COMMON,
      primary: "#16324F", accent: "#C9962E",
      text: "#16222E", muted: "#5C6C7E", line: "#E3E8EF",
      success: "#2F7D52", warning: "#A86A1F", danger: "#C0524E",
      primarySoft: "#EEF2F7", primaryTint: "#DCE4EE", primaryDeep: "#0E2236",
      accent3: "#3D6B99", accent4: "#7FA6CB", accent5: "#C26B4E", accent6: "#5D8A72",
    },
  },
  // 2. 科技青：深海青 + 亮琥珀（深底表头对比度足，系列色含一记紫色提神）
  tech: {
    name: "科技青",
    colors: {
      ...COMMON,
      primary: "#0B7C8D", accent: "#F5A623",
      text: "#142B33", muted: "#5B7376", line: "#DDEBEC",
      success: "#2E9E5B", warning: "#D98A1F", danger: "#D64545",
      primarySoft: "#EFF7F8", primaryTint: "#DFEFF2", primaryDeep: "#075E6A",
      accent3: "#23A5B8", accent4: "#79C7D4", accent5: "#8C5BC4", accent6: "#5C7D8C",
    },
  },
  // 3. 活力橙：焦橙 + 深青（互补点缀，亮橙为主色时用深青压场）
  orange: {
    name: "活力橙",
    colors: {
      ...COMMON,
      primary: "#C0531F", accent: "#2A6E72",
      text: "#2E241E", muted: "#78685C", line: "#F0E6DE",
      success: "#3D7A4F", warning: "#C07A12", danger: "#C0503C",
      primarySoft: "#FCF3EC", primaryTint: "#F8E6D8", primaryDeep: "#9A3A12",
      accent3: "#E0804A", accent4: "#F2B48E", accent5: "#3E8A8F", accent6: "#8FB5B8",
    },
  },
  // 4. 森林绿：深林绿 + 蜜金
  green: {
    name: "森林绿",
    colors: {
      ...COMMON,
      primary: "#1D6B45", accent: "#D0A437",
      text: "#172A20", muted: "#5C6E62", line: "#E2EAE3",
      success: "#2F8A52", warning: "#B07816", danger: "#C05248",
      primarySoft: "#F0F6F1", primaryTint: "#E0EDE4", primaryDeep: "#124D31",
      accent3: "#3E8B60", accent4: "#7FB593", accent5: "#B56A3E", accent6: "#7C93A5",
    },
  },
  // 5. 沉稳红：绯红 + 墨蓝（商务正式感，红蓝配）
  red: {
    name: "沉稳红",
    colors: {
      ...COMMON,
      primary: "#B02A3A", accent: "#2E4A6E",
      text: "#2C2022", muted: "#75676A", line: "#F0E3E4",
      success: "#3D7A52", warning: "#B07A14", danger: "#C64A3E",
      primarySoft: "#FBF1F2", primaryTint: "#F5E2E4", primaryDeep: "#831C28",
      accent3: "#C94B57", accent4: "#E3A0A6", accent5: "#4E6F9E", accent6: "#9AA9C4",
    },
  },
  // 6. 优雅紫：深紫罗兰 + 暖琥珀（经典贵气组合）
  purple: {
    name: "优雅紫",
    colors: {
      ...COMMON,
      primary: "#5A2E8C", accent: "#C99A3A",
      text: "#2A2136", muted: "#6E6480", line: "#E9E2F2",
      success: "#3D7A52", warning: "#AD7513", danger: "#BF4A56",
      primarySoft: "#F6F2FA", primaryTint: "#ECE4F5", primaryDeep: "#3F1E63",
      accent3: "#7B4FA8", accent4: "#AC8CCB", accent5: "#C26B8A", accent6: "#5E7FA3",
    },
  },
  // 7. 高级灰：炭黑 + 金（极简高级感，系列色两枚低调彩色点缀）
  mono: {
    name: "高级灰",
    colors: {
      ...COMMON,
      primary: "#20272F", accent: "#C9993E",
      text: "#232A33", muted: "#66707C", line: "#E7E9EC",
      success: "#3D8A57", warning: "#B0781C", danger: "#C7504A",
      primarySoft: "#F2F3F5", primaryTint: "#E3E6EA", primaryDeep: "#141A23",
      accent3: "#55606E", accent4: "#A0A9B4", accent5: "#3E8A8C", accent6: "#B05A4A",
    },
  },
  // 8. 大地棕：可可棕 + 蜂蜜金（温暖自然）
  brown: {
    name: "大地棕",
    colors: {
      ...COMMON,
      primary: "#6D4A2C", accent: "#D19A4B",
      text: "#2E241D", muted: "#7A6B5C", line: "#EDE5DA",
      success: "#4F7A4E", warning: "#B57A1C", danger: "#B55242",
      primarySoft: "#F7F4F0", primaryTint: "#EFE8DF", primaryDeep: "#4E341E",
      accent3: "#8D6742", accent4: "#C4A57E", accent5: "#7E8C5A", accent6: "#A68B4F",
    },
  },
  // 9. 莫兰迪：灰调鼠尾草绿 + 亚麻米（低饱和高级感；主色略加深以保证白字表头对比度）
  morandi: {
    name: "莫兰迪",
    colors: {
      ...COMMON,
      primary: "#64725F", accent: "#B7A187",
      text: "#33352E", muted: "#76796F", line: "#E6E5DE",
      success: "#5E7A60", warning: "#A88A4E", danger: "#B07A70",
      primarySoft: "#F4F6F2", primaryTint: "#E8ECE4", primaryDeep: "#4A5646",
      accent3: "#8FA08A", accent4: "#C3CDC0", accent5: "#AE8B92", accent6: "#8E9BA5",
    },
  },
  // 10. 樱花粉：玫瑰粉 + 鼠尾草绿（柔美清透，粉绿互补）
  sakura: {
    name: "樱花粉",
    colors: {
      ...COMMON,
      primary: "#BC4F76", accent: "#7FA87C",
      text: "#3A2831", muted: "#8A6E78", line: "#F5E4EA",
      success: "#4F8A5C", warning: "#C08A2E", danger: "#C0504E",
      primarySoft: "#FCF4F7", primaryTint: "#F9E9EF", primaryDeep: "#8C3A5B",
      accent3: "#D97FA4", accent4: "#EFB8CD", accent5: "#4E8A62", accent6: "#A98AC0",
    },
  },
};
