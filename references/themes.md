# Theme & Color

## Positioning

Two paths, **custom by default**:

1. **Custom palette (default path)**: design a dedicated palette for each deck based on its content/industry/audience, avoiding homogenization. Design guidelines below under "Custom Palette Guidelines".
2. **Built-in presets (backup path)**: 10 presets (same data source as the editor's top-bar "Palette" panel and the CLI `--theme <key>`). **Use them only when the user explicitly asks for built-in theme colors, or after discussing with the user and agreeing on a preset.**

Either way, the deck must be self-contained: write the **full 17-key color set** into `deck.theme.colors` (page elements reference via `$key`). Do not reference a preset by string (`theme: "tech"` is not an official format — only v1 legacy compatibility: a matching preset key resolves to its colors; unknown keys warn and fall back to the default theme).

## Custom Palette Guidelines (default path)

### Structural requirements

1. `theme.colors` has a fixed 17-key set, all explicit hex (`#RRGGBB`), no dynamic derivation or omission:
   - 9 semantic colors: `primary / accent / bg / text / muted / line / success / warning / danger`
   - 3 primary-derived colors: `primarySoft / primaryTint / primaryDeep` (light header backgrounds / cards / deep backgrounds)
   - 4 chart series slots: `accent3 / accent4 / accent5 / accent6` (accent1/2 are fixed = primary/accent)
2. An incomplete key set leaves `$text/$muted` and chart series colors dangling — always write the full set.

### Design guidelines

1. **The primary color sets the tone**: extract design anchors from the content — brand colors, thematic imagery, industry conventions (finance deep blue, eco green, education warm orange), avoiding baseless defaults. Primary = page emphasis, table headers, dark blocks, first chart series.
2. **The accent is the highlight**: accent forms an analogous or complementary relationship with primary (e.g. deep blue + gold, ink green + honey gold), used for emphasis labels, key numbers, second chart series; avoid primary and accent sharing the same hue.
3. **White-on-primary contrast ≥ 4.5:1** (header white text, white text on deep backgrounds): primary must be dark enough; bright colors (orange, pink) as primary should be darkened one step.
4. **The 6 chart series slots must be distinguishable**: separate by hue or lightness (adjacent series ΔE ≥ 15 recommended) and stay harmonious with the family; a lightness staircase within one hue family (dark → light) is a safe approach; avoid two slots that are hard to tell apart.
5. **Derived colors strictly derive from primary**: primarySoft = very light primary background (zebra striping/light backgrounds), primaryTint = light primary card background, primaryDeep = darkened primary (dark cover/dark blocks).
6. **Neutrals carry the family hue**: text/muted/line are not pure gray but black-gray/light-gray tinted with the primary hue (e.g. blue-gray lines in a cool family, warm-gray lines in a warm family) for overall unity.
7. **Semantic colors follow the family temperature**: success/warning/danger hues can harmonize with the neutrals (avoid glaring neon green/red in cool schemes) while staying semantically distinguishable.
8. **Homogenization red line**: never mindlessly reuse preset values (especially the "deep blue + gold" combo); never pile red/yellow/green/purple onto one page (see general rules in slides_categories); each palette's primary + accent combination should be explainable in one sentence of design intent.

## Built-in Presets (backup path)

### When to use

- The user explicitly asks for built-in theme colors, or
- After discussing the palette with the user, a preset is agreed on (proactively suggest alternatives at delivery, e.g. "if you want a steadier business feel, try consult").

Once a preset is chosen, write its **full 17-key color set** into `deck.theme.colors`; if textStyles/tableStyles need no special design, use the default templates at the end of this document (5 text styles + default table style).

### The 10 presets at a glance

| Key | Name | Primary | Accent | Character | Best for |
|---|---|---|---|---|---|
| consult | Consulting Blue | Deep navy #18324E | Vintage gold #D19B2E | Steady, professional, business | Consulting reports, management briefings, strategy analysis, finance |
| tech | Tech Teal | Deep sea teal #0F798A | Bright amber #EB9D1E | Rational, modern, energetic | Tech, internet, product launches, R&D reports |
| orange | Vitality Orange | Burnt orange #B65020 | Deep teal #296C70 | Passionate, action-oriented | Marketing campaigns, e-commerce promos, sports, entrepreneurship |
| green | Forest Green | Deep forest green #1D6744 | Honey gold #CCA133 | Natural, steady, growth | Agriculture, environmental, pharma/health, ESG |
| red | Steady Red | Crimson #A32937 | Ink blue #2B4464 | Solemn, formal, alert | Party/government, SOEs, annual summaries, red themes |
| purple | Elegant Purple | Deep violet #542B82 | Warm amber #C79738 | Noble, creative, mysterious | Brand launches, fashion, cultural creativity, women-oriented |
| mono | Premium Gray | Charcoal #1F262D | Gold #C4943B | Minimal, restrained, premium | Designer portfolios, architecture, industry, photography |
| brown | Earth Brown | Cocoa brown #654529 | Honey gold #C99B40 | Warm, rustic, vintage | Cultural tourism, dining, real estate, handicrafts, education |
| morandi | Morandi | Gray sage #5C6B57 | Linen beige #B19B81 | Low saturation, elegant, quiet | Home, aesthetics, lifestyle, women-oriented content |
| sakura | Sakura Pink | Deep rose #913052 | Sage green #61A35C | Soft, clear, friendly | Beauty, mother & baby, weddings, emotional content |

### Full color tables (17 keys × 10 presets)

Primary and chart series colors (chart series cycle = accent1-6, i.e. primary → accent → accent3 → accent4 → accent5 → accent6, taken in series order):

| Preset | primary | accent | accent3 | accent4 | accent5 | accent6 |
|---|---|---|---|---|---|---|
| consult | #18324E | #D19B2E | #37B2BE | #5A45C4 | #C15533 | #419F73 |
| tech | #0F798A | #EB9D1E | #336FC1 | #36AB70 | #963DC2 | #BE4A2D |
| orange | #B65020 | #296C70 | #D9B23A | #3AA65E | #3B5BBA | #BA3B85 |
| green | #1D6744 | #CCA133 | #3AA643 | #3894B2 | #7B42BD | #AB5936 |
| red | #A32937 | #2B4464 | #CF6530 | #39935F | #7542BD | #63863C |
| purple | #542B82 | #C79738 | #BA3BBA | #3857B2 | #3FA294 | #B94831 |
| mono | #1F262D | #C4943B | #3E9889 | #6F4EA6 | #AB593F | #418B4B |
| brown | #654529 | #C99B40 | #3B9169 | #3F7EAB | #B3427A | #6B883A |
| morandi | #5C6B57 | #B19B81 | #8FA06A | #64907C | #9B6F7D | #6B8094 |
| sakura | #913052 | #61A35C | #974CBD | #4799C2 | #C9B240 | #C25E3D |

The remaining 11 keys (bg/text/muted/line/success/warning/danger + primarySoft/primaryTint/primaryDeep):

| Key | consult | tech | orange | green | red | purple | mono | brown | morandi | sakura |
|---|---|---|---|---|---|---|---|---|---|---|
| bg | #FFFFFF | #FFFFFF | #FFFFFF | #FFFFFF | #FFFFFF | #FFFFFF | #FFFFFF | #FFFFFF | #FFFFFF | #FFFFFF |
| text | #1F2428 | #1F2728 | #28221F | #1F2824 | #281F20 | #231F28 | #1F2328 | #28231F | #22281F | #281F22 |
| muted | #6E7A87 | #6E8387 | #87766E | #6E877B | #876E71 | #7A6E87 | #6E7A87 | #877A6E | #75876E | #876E77 |
| line | #E8EBED | #E8ECED | #EDEAE8 | #E8EDEB | #EDE8E9 | #EAE8ED | #E8EAED | #EDEAE8 | #E9EDE8 | #EDE8EA |
| success | #33A362 | #33A362 | #33A362 | #33A362 | #33A362 | #33A362 | #33A362 | #33A362 | #33A362 | #33A362 |
| warning | #B4872D | #B4872D | #B4872D | #B4872D | #B4872D | #B4872D | #B4872D | #B4872D | #B4872D | #B4872D |
| danger | #BE392D | #BE392D | #BE392D | #BE392D | #BE392D | #BE392D | #BE392D | #BE392D | #BE392D | #BE392D |
| primarySoft | #EFF2F5 | #EFF4F5 | #F5F1EF | #EFF5F2 | #F5EFF0 | #F2EFF5 | #EFF2F5 | #F5F2EF | #F1F5EF | #F5EFF1 |
| primaryTint | #D7E0EA | #D7E7EA | #EADDD7 | #D7EAE1 | #EAD7D9 | #E0D7EA | #D7E0EA | #EAE0D7 | #DCEAD7 | #EAD7DE |
| primaryDeep | #0A1929 | #0F4D57 | #8B3D18 | #0F432A | #811825 | #3B1A61 | #0F141A | #452C17 | #41543B | #711E3B |

> Usage: `primarySoft` = light primary background (zebra striping/light backgrounds), `primaryTint` = primary card background, `primaryDeep` = deep primary background (dark cover/dark blocks). All three are explicit hex values — do not derive them dynamically.

Preset design rules (2026-08 redesign, generated by script — do not hand-tune values or the rules break):
- **White-on-primary contrast ≥ 4.5:1** (WCAG AA): primaries are dark family hues; light variants of the family live in `primarySoft`/`primaryTint`.
- **Chart series 6 slots spread around the hue wheel** (adjacent hue gap ≥ 25°; brown keeps an intentional ~12° primary/accent gap separated by lightness instead).
- **Semantic colors are uniform across presets** (`success #33A362 / warning #B4872D / danger #BE392D`): user intuition stays fixed (green = OK, red = danger) regardless of theme; the custom-palette guideline "semantic colors follow the family temperature" applies only to hand-designed palettes.
- **primarySoft/Tint/Deep derive from primary HSL** (L 95 / 88 / primary −10); neutrals text/muted/line carry the family hue.

## deck.theme Example

Using "tech" as an example (swap the whole colors block for any preset's or your custom 17 keys; textStyles/tableStyles are the default templates):

```yaml
theme:
  colors:
    primary: "#0F798A"
    accent: "#EB9D1E"
    bg: "#FFFFFF"
    text: "#1F2728"
    muted: "#6E8387"
    line: "#E8ECED"
    success: "#33A362"
    warning: "#B4872D"
    danger: "#BE392D"
    primarySoft: "#EFF4F5"
    primaryTint: "#D7E7EA"
    primaryDeep: "#0F4D57"
    accent3: "#336FC1"
    accent4: "#36AB70"
    accent5: "#963DC2"
    accent6: "#BE4A2D"
  textStyles:
    title: { fontSize: 32, color: "$text", bold: true, lineHeight: 1.3 }
    subtitle: { fontSize: 16, color: "$muted", lineHeight: 1.4 }
    body: { fontSize: 16, color: "$text", lineHeight: 1.6 }
    caption: { fontSize: 12, color: "$muted", lineHeight: 1.4 }
    quote: { fontSize: 16, color: "$text", italic: true, lineHeight: 1.6 }
  tableStyles:
    default:
      cellStyle: { fontSize: 13, color: "$text", fill: { type: "solid", color: "#FFFFFF" }, border: { style: "solid", width: 1, color: "$line" } }
      firstRowStyle: { fill: { type: "solid", color: "$primary" }, color: "#FFFFFF", bold: true }
      bodyStyles:
        - { fill: { type: "solid", color: "$primarySoft" } }
        - { fill: { type: "solid", color: "#FFFFFF" } }
      rowOverColumn: true
```

Page element references: text `style: "$title"`, `color: "$primary"`, table `style: "$default"`, chart series `fill: ["$primary", "$accent", "$accent3"]` (series auto-cycle accent1-6 when omitted).

## Post-Generation Re-skinning (complementary to the generation flow)

- **Editor**: top-bar "Palette" panel applies one-click (replaces only `theme.colors`; all page `$key` references and chart series colors update immediately), single keys can be fine-tuned.
- **CLI**: `node bin/open-pptd.js export <deck.pptd> -o out.pptx --theme <key>` (unknown key errors; replaces only colors, keeps the manifest's textStyles/tableStyles).

## Maintenance Convention

- **Authoritative source**: `editor/core/theme-presets.js` (`THEME_PALETTES`, DEFAULT_THEME = the 1st preset, consult).
- After modifying preset values, must sync: this document's two color tables + `docs/editor-v2-ux.md` §1.3; consistency is guarded by `tests/theme-presets-consistency.mjs`.
