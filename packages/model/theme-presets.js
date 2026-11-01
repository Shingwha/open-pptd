// packages/model/theme-presets.js — 默认 theme 数据。
// 纯数据。结构遵循官方 Theme：{ colors, textStyles, tableStyles }。
// Colors 使用固定的 16 个显式 hex key（语义色、主色派生、图表槽 accent3-6；accent1/2 固定映射
// primary/accent）。3.2 已删除全部命名配色预设（THEME_PALETTES），只保留默认主题。

export const DEFAULT_THEME = {
  colors: {
    primary: "#18324E", // deep navy (default theme base color)
    accent: "#D19B2E", // vintage gold (common companion color)
    bg: "#FFFFFF",
    text: "#1F2428",
    muted: "#6E7A87",
    line: "#E8EBED",
    success: "#33A362",
    warning: "#B4872D",
    danger: "#BE392D",
    // Primary derivations (explicit hex; primarySoft=tint fill, primaryTint=card, primaryDeep=deep fill)
    primarySoft: "#EFF2F5",
    primaryTint: "#D7E0EA",
    primaryDeep: "#0A1929",
    // Chart series color slots (accent1-6 cycle: 1=primary, 2=accent, 3-6 as below)
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
      // Whole-table base: white fill + light gray border + 13pt body text (declared
      // explicitly so the editor defaults to a light gray border; only tables that
      // reference no table style at all fall back to the official black border)
      cellStyle: {
        fontSize: 13,
        color: "$text",
        fill: { type: "solid", color: "#FFFFFF" },
        border: { style: "solid", width: 1, color: "$line" },
      },
      // Header row: theme primary fill + bold white text
      firstRowStyle: {
        fill: { type: "solid", color: "$primary" },
        color: "#FFFFFF",
        bold: true,
      },
      // Data-row zebra: alternating very light primary fill (data-row index 0, 2… takes
      // the first entry; 1, 3… takes the second)
      bodyStyles: [
        { fill: { type: "solid", color: "$primarySoft" } },
        { fill: { type: "solid", color: "#FFFFFF" } },
      ],
      rowOverColumn: true,
    },
  },
};
