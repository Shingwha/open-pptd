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
| consult | Consulting Blue | Deep navy #16324F | Vintage gold #C9962E | Steady, professional, business | Consulting reports, management briefings, strategy analysis, finance |
| tech | Tech Teal | Deep sea teal #0B7C8D | Bright amber #F5A623 | Rational, modern, energetic | Tech, internet, product launches, R&D reports |
| orange | Vitality Orange | Burnt orange #C0531F | Deep teal #2A6E72 | Passionate, action-oriented | Marketing campaigns, e-commerce promos, sports, entrepreneurship |
| green | Forest Green | Deep forest green #1D6B45 | Honey gold #D0A437 | Natural, steady, growth | Agriculture, environmental, pharma/health, ESG |
| red | Steady Red | Crimson #B02A3A | Ink blue #2E4A6E | Solemn, formal, alert | Party/government, SOEs, annual summaries, red themes |
| purple | Elegant Purple | Deep violet #5A2E8C | Warm amber #C99A3A | Noble, creative, mysterious | Brand launches, fashion, cultural creativity, women-oriented |
| mono | Premium Gray | Charcoal #20272F | Gold #C9993E | Minimal, restrained, premium | Designer portfolios, architecture, industry, photography |
| brown | Earth Brown | Cocoa brown #6D4A2C | Honey gold #D19A4B | Warm, rustic, vintage | Cultural tourism, dining, real estate, handicrafts, education |
| morandi | Morandi | Gray sage #64725F | Linen beige #B7A187 | Low saturation, elegant, quiet | Home, aesthetics, lifestyle, women-oriented content |
| sakura | Sakura Pink | Rose pink #BC4F76 | Sage green #7FA87C | Soft, clear, friendly | Beauty, mother & baby, weddings, emotional content |

### Full color tables (17 keys × 10 presets)

Primary and chart series colors (chart series cycle = accent1-6, i.e. primary → accent → accent3 → accent4 → accent5 → accent6, taken in series order):

| Preset | primary | accent | accent3 | accent4 | accent5 | accent6 |
|---|---|---|---|---|---|---|
| consult | #16324F | #C9962E | #3D6B99 | #7FA6CB | #C26B4E | #5D8A72 |
| tech | #0B7C8D | #F5A623 | #23A5B8 | #79C7D4 | #8C5BC4 | #5C7D8C |
| orange | #C0531F | #2A6E72 | #E0804A | #F2B48E | #3E8A8F | #8FB5B8 |
| green | #1D6B45 | #D0A437 | #3E8B60 | #7FB593 | #B56A3E | #7C93A5 |
| red | #B02A3A | #2E4A6E | #C94B57 | #E3A0A6 | #4E6F9E | #9AA9C4 |
| purple | #5A2E8C | #C99A3A | #7B4FA8 | #AC8CCB | #C26B8A | #5E7FA3 |
| mono | #20272F | #C9993E | #55606E | #A0A9B4 | #3E8A8C | #B05A4A |
| brown | #6D4A2C | #D19A4B | #8D6742 | #C4A57E | #7E8C5A | #A68B4F |
| morandi | #64725F | #B7A187 | #8FA08A | #C3CDC0 | #AE8B92 | #8E9BA5 |
| sakura | #BC4F76 | #7FA87C | #D97FA4 | #EFB8CD | #4E8A62 | #A98AC0 |

The remaining 11 keys (bg/text/muted/line/success/warning/danger + primarySoft/primaryTint/primaryDeep):

| Key | consult | tech | orange | green | red | purple | mono | brown | morandi | sakura |
|---|---|---|---|---|---|---|---|---|---|---|
| bg | #FFFFFF | #FFFFFF | #FFFFFF | #FFFFFF | #FFFFFF | #FFFFFF | #FFFFFF | #FFFFFF | #FFFFFF | #FFFFFF |
| text | #16222E | #142B33 | #2E241E | #172A20 | #2C2022 | #2A2136 | #232A33 | #2E241D | #33352E | #3A2831 |
| muted | #5C6C7E | #5B7376 | #78685C | #5C6E62 | #75676A | #6E6480 | #66707C | #7A6B5C | #76796F | #8A6E78 |
| line | #E3E8EF | #DDEBEC | #F0E6DE | #E2EAE3 | #F0E3E4 | #E9E2F2 | #E7E9EC | #EDE5DA | #E6E5DE | #F5E4EA |
| success | #2F7D52 | #2E9E5B | #3D7A4F | #2F8A52 | #3D7A52 | #3D7A52 | #3D8A57 | #4F7A4E | #5E7A60 | #4F8A5C |
| warning | #A86A1F | #D98A1F | #C07A12 | #B07816 | #B07A14 | #AD7513 | #B0781C | #B57A1C | #A88A4E | #C08A2E |
| danger | #C0524E | #D64545 | #C0503C | #C05248 | #C64A3E | #BF4A56 | #C7504A | #B55242 | #B07A70 | #C0504E |
| primarySoft | #EEF2F7 | #EFF7F8 | #FCF3EC | #F0F6F1 | #FBF1F2 | #F6F2FA | #F2F3F5 | #F7F4F0 | #F4F6F2 | #FCF4F7 |
| primaryTint | #DCE4EE | #DFEFF2 | #F8E6D8 | #E0EDE4 | #F5E2E4 | #ECE4F5 | #E3E6EA | #EFE8DF | #E8ECE4 | #F9E9EF |
| primaryDeep | #0E2236 | #075E6A | #9A3A12 | #124D31 | #831C28 | #3F1E63 | #141A23 | #4E341E | #4A5646 | #8C3A5B |

> Usage: `primarySoft` = light primary background (zebra striping/light backgrounds), `primaryTint` = primary card background, `primaryDeep` = deep primary background (dark cover/dark blocks). All three are explicit hex values — do not derive them dynamically.

## deck.theme Example

Using "tech" as an example (swap the whole colors block for any preset's or your custom 17 keys; textStyles/tableStyles are the default templates):

```yaml
theme:
  colors:
    primary: "#0B7C8D"
    accent: "#F5A623"
    bg: "#FFFFFF"
    text: "#142B33"
    muted: "#5B7376"
    line: "#DDEBEC"
    success: "#2E9E5B"
    warning: "#D98A1F"
    danger: "#D64545"
    primarySoft: "#EFF7F8"
    primaryTint: "#DFEFF2"
    primaryDeep: "#075E6A"
    accent3: "#23A5B8"
    accent4: "#79C7D4"
    accent5: "#8C5BC4"
    accent6: "#5C7D8C"
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
