// ============================================================================
// theme-presets.js — built-in theme data (default theme + 10 color presets, pure data, no logic)
// ----------------------------------------------------------------------------
// Structure strictly follows the official Theme (references/pptd.md §3 Theme):
//   { colors: Record<string, Color>, textStyles: Record<string, TextStyleConfig>,
//     tableStyles: Record<string, TableStyleConfig> }
// No top-level fields beyond the official ones. Colors are a one-time design
// decision made at generation time (aligned with the Kimi skill workflow); the
// editor offers the 10 colors presets for one-click application
// (see docs/editor-v2-ux.md).
//
// colors key conventions (all are valid $reference targets, all explicit hex, no
// dynamic derivation):
//   primary/accent/bg/text/muted/line/success/warning/danger semantic colors
//   primarySoft/primaryTint/primaryDeep primary color shades (header tint / card / deep background)
//   accent3/accent4/accent5/accent6 chart series color slots (PPTX theme accent3-6;
//     accent1/2 are fixed to primary/accent; the chart series cycle = accent1-6,
//     see themeChartPalette)
// The key set is fixed at 17 keys and every preset must be complete (otherwise the
// $text/$muted references in textStyles and the chart cycle dangle).
// textStyles defaults to 5 keys: title/subtitle/body/caption/quote (any key may be extended)
// tableStyles.default is the official TableStyleConfig (whole-table base / header row / zebra / border)
//
// 2026-08 palette redesign (generated from quantitative rules, not eyeballed):
//   - primary = personality hue + dark lightness: white text on the header always
//     reaches ≥ 4.5:1 contrast (WCAG AA)
//   - accent hue is pulled at least 25° away from primary (brown is the exception:
//     honey gold separates by lightness, see that preset)
//   - the 6 chart slots form a family hue ladder (v2, replacing the old evenly
//     spaced wheel): 4 secondary colors interpolate the "primary↔accent short arc"
//     at 1/3 and 2/3 plus ≥26° extension at both ends, in one saturation band
//     (lower of primary/accent; morandi/mono/brown define their own low-saturation
//     band) with narrow lightness band L41-47 interleaved — series colors stay
//     distinguishable (hue gap ≥15° or lightness gap ≥8) and harmonize with the two
//     brand colors, so no neon color floats outside the family
//   - neutral colors text/muted/line carry the family hue (near-black / mid-gray /
//     light-gray, not pure gray)
//   - primarySoft/Tint/Deep are derived precisely from the primary HSL (L 95 / 88 / primary −10)
//   - semantic colors success/warning/danger are identical across presets (fixed user
//     intuition, they do not drift with the theme)
// ============================================================================

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

// ----------------------------------------------------------------------------
// 10 color presets (complete colors key set, each one = all 17 keys)
// Each preset is an independent color family: a composed primary + a personality
// accent + 6 chart series slots. The values were generated by a script following
// the quantitative rules above (see the file header); do not break the rules with
// hand-tuned eyeballing.
// ----------------------------------------------------------------------------

/** Key shared by all presets (white background). */
const COMMON = {
  bg: "#FFFFFF",
};

export const THEME_PALETTES = {
  // 1. consult: deep navy + vintage gold; series = blue<->gold arc ladder (teal / blue-violet / olive / rust)
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
  // 2. tech: deep sea teal + bright amber; series = teal<->amber arc ladder (green / steel blue / yellow-green / rust)
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
  // 3. orange: burnt orange + deep teal (complementary accent; deep teal anchors the composition when bright orange leads); series = orange<->teal arc ladder (olive / brick red / green / steel blue)
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
  // 4. green: deep forest green + honey gold; series = green<->gold arc ladder (leaf green / teal / olive / rust)
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
  // 5. red: crimson + neutral steel blue (formal business feel; the accent is pushed
  //    near-neutral so large color blocks do not clash with red — placing two highly
  //    saturated red and blue blocks side by side is a disaster); series = red<->blue arc ladder (purple / ochre / blue-violet / teal)
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
  // 6. purple: deep violet + warm amber (a classic opulent pairing); series = purple<->gold arc ladder (magenta / indigo / crimson / olive gold)
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
  // 7. mono: charcoal + gold (minimal, premium); series = charcoal<->gold arc ladder (sage / gray-blue / olive gray / warm brown, S30 low saturation)
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
  // 8. brown: cocoa brown + honey gold (warm, natural; the brown<->gold arc is only
  //    12°, so the series is a hand-picked earth family — rust / wine red / ochre /
  //    olive — separated by hue steps)
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
  // 9. morandi: grayish sage green + linen beige (low-saturation premium feel, S22
  //    family band; the dark gray-green primary keeps white header text at 5.7:1)
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
  // 10. sakura: deep rose + sage green (soft and airy, pink and green complement each
  //     other, S24 low-saturation family band; the primary uses deep rose rather than
  //     light pink — light pink is reserved for soft/tint — keeping white header text
  //     at 7.6:1)
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
