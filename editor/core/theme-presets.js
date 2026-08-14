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
// 2026-08 配色重设计（量化规则生成，非目测）：
//   - 主色 = 性格色相 + 深明度：白字压表头对比度全部 ≥ 4.5:1（WCAG AA）
//   - 强调色与主色色相拉开 ≥ 25°（brown 例外：蜂蜜金靠明度差分离，见该套注释）
//   - 图表 6 系列槽位色环均布（相邻色相 ≥ 25°）+ 明度相近（L 40-55）：
//     多系列图表彼此可区分且与家族和谐（旧版系列色 0-4° 重叠是搭配不佳的主因）
//   - 中性色 text/muted/line 带家族色相（近黑 / 中灰 / 浅灰三档，非纯灰）
//   - primarySoft/Tint/Deep 由主色 HSL 精确派生（L 95 / 88 / 主色 −10）
//   - 语义色 success/warning/danger 跨套统一（用户直觉固定，不随主题漂移）
// ============================================================================

export const DEFAULT_THEME = {
  colors: {
    primary: "#18324E", // 深海军蓝（默认主题基准色）
    accent: "#D19B2E", // 复古金（常用搭配色）
    bg: "#FFFFFF",
    text: "#1F2428",
    muted: "#6E7A87",
    line: "#E8EBED",
    success: "#33A362",
    warning: "#B4872D",
    danger: "#BE392D",
    // 主色派生（显式 hex；primarySoft=浅底、primaryTint=卡片、primaryDeep=深底）
    primarySoft: "#EFF2F5",
    primaryTint: "#D7E0EA",
    primaryDeep: "#0A1929",
    // 图表系列色槽位（accent1-6 循环：1=primary、2=accent、3-6 如下）
    accent3: "#37B2BE",
    accent4: "#5A45C4",
    accent5: "#C15533",
    accent6: "#419F73",
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
// 每套独立色彩家族：主色沉稳 + 有性格的点缀色 + 6 槽图表系列色（色环均布）。
// 色值由脚本按上述量化规则生成（见文件头注释），不可手工目测微调后破坏规则。
// ----------------------------------------------------------------------------

/** 各套共享键（白底）。 */
const COMMON = {
  bg: "#FFFFFF",
};

export const THEME_PALETTES = {
  // 1. 咨询蓝（默认主题同源）：深海军蓝 + 复古金；系列 = 蓝/金家族 + 青蓝/蓝紫/暖橙/灰绿
  consult: {
    name: "咨询蓝",
    colors: {
      ...COMMON,
      primary: "#18324E", accent: "#D19B2E",
      text: "#1F2428", muted: "#6E7A87", line: "#E8EBED",
      success: "#33A362", warning: "#B4872D", danger: "#BE392D",
      primarySoft: "#EFF2F5", primaryTint: "#D7E0EA", primaryDeep: "#0A1929",
      accent3: "#37B2BE", accent4: "#5A45C4", accent5: "#C15533", accent6: "#419F73",
    },
  },
  // 2. 科技青：深海青 + 亮琥珀；系列 = 青家族 + 蓝/绿/紫/橙红（含一记紫色提神）
  tech: {
    name: "科技青",
    colors: {
      ...COMMON,
      primary: "#0F798A", accent: "#EB9D1E",
      text: "#1F2728", muted: "#6E8387", line: "#E8ECED",
      success: "#33A362", warning: "#B4872D", danger: "#BE392D",
      primarySoft: "#EFF4F5", primaryTint: "#D7E7EA", primaryDeep: "#0F4D57",
      accent3: "#336FC1", accent4: "#36AB70", accent5: "#963DC2", accent6: "#BE4A2D",
    },
  },
  // 3. 活力橙：焦橙 + 深青（互补点缀，亮橙为主色时用深青压场）；系列 = 橙/黄/绿/蓝/玫红
  orange: {
    name: "活力橙",
    colors: {
      ...COMMON,
      primary: "#B65020", accent: "#296C70",
      text: "#28221F", muted: "#87766E", line: "#EDEAE8",
      success: "#33A362", warning: "#B4872D", danger: "#BE392D",
      primarySoft: "#F5F1EF", primaryTint: "#EADDD7", primaryDeep: "#8B3D18",
      accent3: "#D9B23A", accent4: "#3AA65E", accent5: "#3B5BBA", accent6: "#BA3B85",
    },
  },
  // 4. 森林绿：深林绿 + 蜜金；系列 = 绿家族 + 青蓝/紫/棕红
  green: {
    name: "森林绿",
    colors: {
      ...COMMON,
      primary: "#1D6744", accent: "#CCA133",
      text: "#1F2824", muted: "#6E877B", line: "#E8EDEB",
      success: "#33A362", warning: "#B4872D", danger: "#BE392D",
      primarySoft: "#EFF5F2", primaryTint: "#D7EAE1", primaryDeep: "#0F432A",
      accent3: "#3AA643", accent4: "#3894B2", accent5: "#7B42BD", accent6: "#AB5936",
    },
  },
  // 5. 沉稳红：绯红 + 墨蓝（商务正式感，红蓝配）；系列 = 红家族 + 珊瑚/绿/紫/橄榄
  red: {
    name: "沉稳红",
    colors: {
      ...COMMON,
      primary: "#A32937", accent: "#2B4464",
      text: "#281F20", muted: "#876E71", line: "#EDE8E9",
      success: "#33A362", warning: "#B4872D", danger: "#BE392D",
      primarySoft: "#F5EFF0", primaryTint: "#EAD7D9", primaryDeep: "#811825",
      accent3: "#CF6530", accent4: "#39935F", accent5: "#7542BD", accent6: "#63863C",
    },
  },
  // 6. 优雅紫：深紫罗兰 + 暖琥珀（经典贵气组合）；系列 = 紫家族 + 蓝/青绿/暖红
  purple: {
    name: "优雅紫",
    colors: {
      ...COMMON,
      primary: "#542B82", accent: "#C79738",
      text: "#231F28", muted: "#7A6E87", line: "#EAE8ED",
      success: "#33A362", warning: "#B4872D", danger: "#BE392D",
      primarySoft: "#F2EFF5", primaryTint: "#E0D7EA", primaryDeep: "#3B1A61",
      accent3: "#BA3BBA", accent4: "#3857B2", accent5: "#3FA294", accent6: "#B94831",
    },
  },
  // 7. 高级灰：炭黑 + 金（极简高级感）；系列 = 灰家族 + 青/灰紫/棕红/灰绿
  mono: {
    name: "高级灰",
    colors: {
      ...COMMON,
      primary: "#1F262D", accent: "#C4943B",
      text: "#1F2328", muted: "#6E7A87", line: "#E8EAED",
      success: "#33A362", warning: "#B4872D", danger: "#BE392D",
      primarySoft: "#EFF2F5", primaryTint: "#D7E0EA", primaryDeep: "#0F141A",
      accent3: "#3E9889", accent4: "#6F4EA6", accent5: "#AB593F", accent6: "#418B4B",
    },
  },
  // 8. 大地棕：可可棕 + 蜂蜜金（温暖自然；两色色相仅差 12°，靠明度分离：
  //    深棕 L28 vs 亮金 L52，图表中区分清晰，是棕+金的经典性格）
  brown: {
    name: "大地棕",
    colors: {
      ...COMMON,
      primary: "#654529", accent: "#C99B40",
      text: "#28231F", muted: "#877A6E", line: "#EDEAE8",
      success: "#33A362", warning: "#B4872D", danger: "#BE392D",
      primarySoft: "#F5F2EF", primaryTint: "#EAE0D7", primaryDeep: "#452C17",
      accent3: "#3B9169", accent4: "#3F7EAB", accent5: "#B3427A", accent6: "#6B883A",
    },
  },
  // 9. 莫兰迪：灰调鼠尾草绿 + 亚麻米（低饱和高级感；主色保持深灰绿保证白字表头 5.7:1）
  morandi: {
    name: "莫兰迪",
    colors: {
      ...COMMON,
      primary: "#5C6B57", accent: "#B19B81",
      text: "#22281F", muted: "#75876E", line: "#E9EDE8",
      success: "#33A362", warning: "#B4872D", danger: "#BE392D",
      primarySoft: "#F1F5EF", primaryTint: "#DCEAD7", primaryDeep: "#41543B",
      accent3: "#8FA06A", accent4: "#64907C", accent5: "#9B6F7D", accent6: "#6B8094",
    },
  },
  // 10. 樱花粉：深玫红 + 鼠尾草绿（柔美清透，粉绿互补；
  //     主色用深玫红而非浅粉 —— 浅粉留给 soft/tint，白字表头对比 7.6:1）
  sakura: {
    name: "樱花粉",
    colors: {
      ...COMMON,
      primary: "#913052", accent: "#61A35C",
      text: "#281F22", muted: "#876E77", line: "#EDE8EA",
      success: "#33A362", warning: "#B4872D", danger: "#BE392D",
      primarySoft: "#F5EFF1", primaryTint: "#EAD7DE", primaryDeep: "#711E3B",
      accent3: "#974CBD", accent4: "#4799C2", accent5: "#C9B240", accent6: "#C25E3D",
    },
  },
};
