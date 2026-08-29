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
//   - 图表 6 系列槽位 = 家族色相阶梯（v2，替代旧「色环均布」）：4 个辅色取
//     「主色↔点缀色短弧」的 1/3、2/3 内插 + 两端外延 ≥26°，统一饱和度带
//     （贴主/缀较低者；morandi/mono/brown 另定低饱和带）+ 窄明度带 L41-47 交错
//     ——系列色彼此可区分（色相差 ≥15° 或明度差 ≥8）且与品牌双色同族协调，
//     不再出现游离于家族外的霓虹色
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
    accent3: "#38996F",
    accent4: "#3F45AB",
    accent5: "#6BAF41",
    accent6: "#9C513A",
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
  // 1. 咨询蓝（默认主题同源）：深海军蓝 + 复古金；系列 = 蓝↔金弧阶梯（青绿/蓝紫/橄榄/锈红）
  consult: {
    name: "咨询蓝",
    colors: {
      ...COMMON,
      primary: "#18324E", accent: "#D19B2E",
      text: "#1F2428", muted: "#6E7A87", line: "#E8EBED",
      success: "#33A362", warning: "#B4872D", danger: "#BE392D",
      primarySoft: "#EFF2F5", primaryTint: "#D7E0EA", primaryDeep: "#0A1929",
      accent3: "#38996F", accent4: "#3F45AB", accent5: "#6BAF41", accent6: "#9C513A",
    },
  },
  // 2. 科技青：深海青 + 亮琥珀；系列 = 青↔琥珀弧阶梯（绿/钢蓝/黄绿/锈红）
  tech: {
    name: "科技青",
    colors: {
      ...COMMON,
      primary: "#0F798A", accent: "#EB9D1E",
      text: "#1F2728", muted: "#6E8387", line: "#E8ECED",
      success: "#33A362", warning: "#B4872D", danger: "#BE392D",
      primarySoft: "#EFF4F5", primaryTint: "#D7E7EA", primaryDeep: "#0F4D57",
      accent3: "#389955", accent4: "#3F6EAB", accent5: "#7CAF41", accent6: "#9C4C3A",
    },
  },
  // 3. 活力橙：焦橙 + 深青（互补点缀，亮橙为主色时用深青压场）；系列 = 橙↔青弧阶梯（橄榄/砖红/绿/钢蓝）
  orange: {
    name: "活力橙",
    colors: {
      ...COMMON,
      primary: "#B65020", accent: "#296C70",
      text: "#28221F", muted: "#87766E", line: "#EDEAE8",
      success: "#33A362", warning: "#B4872D", danger: "#BE392D",
      primarySoft: "#F5F1EF", primaryTint: "#EADDD7", primaryDeep: "#8B3D18",
      accent3: "#80943D", accent4: "#A7444F", accent5: "#46AA54", accent6: "#3E6C98",
    },
  },
  // 4. 森林绿：深林绿 + 蜜金；系列 = 绿↔金弧阶梯（叶绿/青/橄榄/锈红）
  green: {
    name: "森林绿",
    colors: {
      ...COMMON,
      primary: "#1D6744", accent: "#CCA133",
      text: "#1F2824", muted: "#6E877B", line: "#E8EDEB",
      success: "#33A362", warning: "#B4872D", danger: "#BE392D",
      primarySoft: "#EFF5F2", primaryTint: "#D7EAE1", primaryDeep: "#0F432A",
      accent3: "#409938", accent4: "#3FABA7", accent5: "#8CAF41", accent6: "#9C563A",
    },
  },
  // 5. 沉稳红：绯红 + 中性钢蓝（商务正式感；点缀压至近中性——大面积色块与红并置不冲突，红蓝双色皆浓饱和时大块并置是灾难）；系列 = 红↔蓝弧阶梯（紫/赭/蓝紫/青）
  red: {
    name: "沉稳红",
    colors: {
      ...COMMON,
      primary: "#A32937", accent: "#444E5A",
      text: "#281F20", muted: "#876E71", line: "#EDE8E9",
      success: "#33A362", warning: "#B4872D", danger: "#BE392D",
      primarySoft: "#F5EFF0", primaryTint: "#EAD7D9", primaryDeep: "#811825",
      accent3: "#8E4386", accent4: "#A0664B", accent5: "#6A4DA3", accent6: "#458892",
    },
  },
  // 6. 优雅紫：深紫罗兰 + 暖琥珀（经典贵气组合）；系列 = 紫↔金弧阶梯（品红/靛/绯/橄榄金）
  purple: {
    name: "优雅紫",
    colors: {
      ...COMMON,
      primary: "#542B82", accent: "#C79738",
      text: "#231F28", muted: "#7A6E87", line: "#EAE8ED",
      success: "#33A362", warning: "#B4872D", danger: "#BE392D",
      primarySoft: "#F2EFF5", primaryTint: "#E0D7EA", primaryDeep: "#3B1A61",
      accent3: "#993885", accent4: "#433FAB", accent5: "#AF4148", accent6: "#939C3A",
    },
  },
  // 7. 高级灰：炭黑 + 金（极简高级感）；系列 = 炭↔金弧阶梯（鼠尾草/灰蓝/橄榄灰/暖褐，S30 低保和）
  mono: {
    name: "高级灰",
    colors: {
      ...COMMON,
      primary: "#1F262D", accent: "#C4943B",
      text: "#1F2328", muted: "#6E7A87", line: "#E8EAED",
      success: "#33A362", warning: "#B4872D", danger: "#BE392D",
      primarySoft: "#EFF2F5", primaryTint: "#D7E0EA", primaryDeep: "#0F141A",
      accent3: "#49886C", accent4: "#525798", accent5: "#719C54", accent6: "#8B594B",
    },
  },
  // 8. 大地棕：可可棕 + 蜂蜜金（温暖自然；棕金弧仅 12°，系列为手排大地家族
  //    锈红/酒红/赭黄/橄榄，靠色相阶梯区分）
  brown: {
    name: "大地棕",
    colors: {
      ...COMMON,
      primary: "#654529", accent: "#C99B40",
      text: "#28231F", muted: "#877A6E", line: "#EDEAE8",
      success: "#33A362", warning: "#B4872D", danger: "#BE392D",
      primarySoft: "#F5F2EF", primaryTint: "#EAE0D7", primaryDeep: "#452C17",
      accent3: "#944B3D", accent4: "#A7445D", accent5: "#AAA246", accent6: "#73983E",
    },
  },
  // 9. 莫兰迪：灰调鼠尾草绿 + 亚麻米（低饱和高级感，S22 家族带；主色深灰绿保白字表头 5.7:1）
  morandi: {
    name: "莫兰迪",
    colors: {
      ...COMMON,
      primary: "#5C6B57", accent: "#B19B81",
      text: "#22281F", muted: "#75876E", line: "#E9EDE8",
      success: "#33A362", warning: "#B4872D", danger: "#BE392D",
      primarySoft: "#F1F5EF", primaryTint: "#DCEAD7", primaryDeep: "#41543B",
      accent3: "#788958", accent4: "#61986C", accent5: "#9C9863", accent6: "#8C5F5A",
    },
  },
  // 10. 樱花粉：深玫红 + 鼠尾草绿（柔美清透，粉绿互补，S24 低饱和家族带；
  //     主色用深玫红而非浅粉 —— 浅粉留给 soft/tint，白字表头对比 7.6:1）
  sakura: {
    name: "樱花粉",
    colors: {
      ...COMMON,
      primary: "#913052", accent: "#61A35C",
      text: "#281F22", muted: "#876E77", line: "#EDE8EA",
      success: "#33A362", warning: "#B4872D", danger: "#BE392D",
      primarySoft: "#F5EFF1", primaryTint: "#EAD7DE", primaryDeep: "#711E3B",
      accent3: "#82644F", accent4: "#915985", accent5: "#8B955B", accent6: "#518564",
    },
  },
};
