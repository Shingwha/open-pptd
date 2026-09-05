# Design Guide — Scenario × Visual Style × Palette × Fonts

Four design decisions in one file, in reading order: the **scenario layer** decides how a deck argues, the **style menu** how it looks, the **palette** its colors, the **font library** its typefaces. Scenario deep-dives stay as separate on-demand documents under `slides_categories/` — only read the one matching your task.

| Section | Decides |
|---|---|
| §1 Scenario & general rules (+ `slides_categories/*.md`) | reader task, narrative structure, information density, content organization |
| §2 Visual style menu | light mode, shape language, decoration density, type character |
| §3 Palette | the 17-key color set, custom-palette guidelines, presets |
| §4 Font system | font pairing, registered names, embedding |

Reading order: follow §1 general rules (step1) → pick the scenario and read its document (step2) → pick or confirm the visual style (§2; every scenario has a default pairing) → design the palette (§3) → pick typefaces (§4).

# 1. Scenario Categories & General Rules

1. **Follow the general rules**: the general rules apply to all scenarios and all pages, and take effect together with the scenario documents and the chosen visual style
2. **Determine the scenario**: choose the matching scenario based on the user's input
3. **Read the scenario document and the style menu**: read the document for that scenario for its argumentation and density, and §2 for the look

## step1. General rules

### Requirements
1. **Every page has a clear reader task**: what this page should make the reader understand, believe, decide, or do — think this through before designing.
2. **Every page has one focal point**: a chart, an image, an oversized number, or one bold statement dominates the composition; everything else is subordinate to it.
3. **Every page carries a visual element**: a diagram, chart, image, or composed shape group — text-only pages are forgettable.
4. **Paging has rhythm**: alternate text-driven, image-driven, and data-driven pages; decide for yourself whether a table of contents or section dividers are needed; the reader should feel a change of rhythm as they flip through — some pages are taken in at a glance, others are worth stopping to read carefully.
5. **Pick layouts by page purpose** — the positive vocabulary below, not a default skeleton.
6. **Every deck has a signature motif**: at least one repeating element group (progress strip, corner brackets, index numerals, section tabs) that recurs across same-kind pages with only its state changing. Distinct page kinds (cover, section dividers, closing, special pages) get their own composition instead of reusing the entry-page template. A motif is an element group — never a bare color bar, sidebar strip, or decorative title underline.
7. **Use charts and shape combinations flexibly**: if a body of information can be expressed through a complex chart that goes beyond what the current chart syntax can express, you are encouraged to flexibly use shapes and other means to construct the expression.
8. **Master-level output**: every PPT is a carefully crafted work of art that could be entered into a competition; pay close attention to every detail of layout, typography, and color — details determine success or failure.
9. **Use image search/generation sensibly**: use image search/generation tools to obtain images and place them in suitable positions. But image abuse is strictly forbidden. If the user's uploaded files contain useful images, use them on suitable pages.
10. **Defer to the user and the subject**: user-specified templates, brand guidelines, color schemes, fonts, and style references take priority over this guide.
11. **Source attribution**: pages involving external facts and data must state the source, date or time period, and measurement basis. Source text should use an <a href="url"> hyperlink pointing to the original report or data page. When citing specific sources in footnotes, likewise use <a href="url"> hyperlinks to the original source to strengthen professional credibility.

### Positive layout vocabulary

Choose the layout from the page's purpose; same-purpose pages may share a skeleton, but a deck must not collapse into one layout:

| Page purpose | Layout direction |
|---|---|
| Opening / closing | bold title compositions — oversized type, asymmetric color swatches, full-bleed image |
| Process / workflow | numbered step chains, chevrons, timelines |
| Comparison | side-by-side panels or a table on the same dimensions |
| Data / metrics | chart-centric layout + oversized stat callouts |
| Key insight | single-statement emphasis — one conclusion sentence with minimal support |
| Peer items | row list (one full-width row per item) or parallel columns — not a card grid |

### Strictly forbidden
- **Evidence boundaries**: do not fabricate data, citations, customer cases, experimental results, or sources; when material is missing, clearly mark it as a placeholder, an assumption, or to-be-supplied information.
- **Classic AI patterns**: it is strictly forbidden to use cards to build hierarchy or alignment (rounded rectangles, rectangular cards, cards with a colored side strip): lines, whitespace, and font-size contrast are better solutions; it is strictly forbidden to use the AI color scheme where red, purple, yellow, and green are all gathered on one page; do not mix elements foreign to the chosen style (e.g. rounded icons or rounded rectangles inside a sharp-cornered style).
- **Template repetition and rigid composition**: do not reuse the same layout on every page (motif-style entry pages that intentionally repeat with state changes are the exception); cap card/tile grids at roughly 1 in 5 content pages and never on consecutive pages; never center body text (center titles only); no decorative underline under titles and no color bars / accent stripes / sidebar strips as motif; do not default to cream/beige backgrounds when unspecified; title-to-body font-size contrast must be obvious (roughly 2× or more).

## step2. Scenario determination
Based on the user's input, analyze the presentation's audience and reader tasks, determine the scenario it belongs to, and read the corresponding scenario document.
> Choose one primary scenario. When truly necessary, you may add one auxiliary scenario, but the primary scenario must prevail.

| Scenario type | Typical queries | Reader task | Scenario document | Default style |
|---|---|---|---|---|
| Analysis & decision | Consulting, finance, industry research, strategy, market opportunities, business analysis, investment analysis | Compare options, form judgments, support decisions | `slides_categories/analysis-decision.md` | `consulting-classic` |
| Business proposal | Marketing plans, sales proposals, fundraising pitches, partnership/investment promotion, product proposals, business plans | Understand the value, believe the plan, take action | `slides_categories/business-plan.md` | `editorial` |
| Management reporting | Work reports, project retrospectives, quarterly summaries, OKR, management briefings | Grasp the current state, surface problems, confirm actions | `slides_categories/management-report.md` | `consulting-classic` |
| Academic research | Graduate research projects, thesis defenses, research projects, proposal reports, mid-term reports, final/concluding reports | Evaluate the problem, method, evidence, and contribution | `slides_categories/academic-research.md` | `swiss-minimal` |
| Education & training / knowledge popularization | K-12 courseware, teaching demonstrations, vocational training, patient education, professional popular science | Understand, remember, apply, or act correctly | `slides_categories/education-training.md` | `editorial` |
| Tech & engineering | Engineering plans, architecture reviews, R&D reports, AI / data / ops / security | See the structure, dependencies, metrics, and trade-offs clearly | `slides_categories/tech-engineering.md` | `swiss-minimal` |
| Brand / creative showcase | Brand stories, design proposals, portfolios, cultural events | Build perception, leave a memory, form identification | `slides_categories/brand-creative.md` | `editorial` |

The default style is the pairing elaborated in each scenario document's visual references; during the interview, offer alternatives from §2 — a different style on the same scenario is usually the fastest way to escape homogenization.

# 2. Visual Style Menu

A **visual style** decides how a deck *looks*; the **scenario** (scenario docs + §1 general rules) decides how it *argues*; the **palette** (§3) decides its *colors*. Choose all three independently — any style pairs with any scenario and any palette.

This menu is a menu, not a cage. Each scenario has a **default pairing** (see the table in §1 step2); several scenario docs elaborate an entry into a full worked example (palette values, type scale, page grammar) — follow a worked example as-is only when it is the confirmed default, otherwise translate the abstract entry below plus a palette built per the Custom Palette Guidelines in §3.

## Light mode (independent of style)

- **all-light** — light background throughout; the steady default for reading decks.
- **sandwich** — dark cover and closing pages, light content pages; strong open/close rhythm.
- **all-dark** — dark canvas throughout; premium, cinematic, or HUD moods; demands stricter text-contrast discipline.

Entries below name a tendency, not a lock-in — most styles can run in more than one light mode.

## Catalog

| Style | Light tendency | Shape language | Decoration density | Type character | Fits | Default pairing |
|---|---|---|---|---|---|---|
| `swiss-minimal` | all-light | strict grid, right angles, hairlines + one heavy rule | near zero | one neutral sans, extreme size contrast, giant numerals | design/architecture portfolios, research posters, engineering docs | academic-research, tech-engineering |
| `consulting-classic` | all-light | white field, single-color skeleton, thin separators, stable header/footer axes | very low | sans titles; conclusion sentences as titles; restrained serif optional | consulting reports, management briefs, strategy and finance | analysis-decision, management-report |
| `editorial` | sandwich | rules and columns, asymmetric grids, pull quotes, image slots | medium (typography-led) | deliberate display/body pairing — serif display or heavy sans over quiet body | brand stories, proposals, courseware handbooks, magazines | business-plan, education-training, brand-creative |
| `data-journalism` | all-light or all-dark | micro-chart grids, sidebars, annotation callouts on charts | high but strictly structured | compact body + monospaced figures | industry research, data reviews, yearbooks, atlas decks | — |
| `dark-tech` | all-dark | geometric precision, restrained line/glow accents, HUD-style frames | low–medium | neo-grotesque sans + monospaced data labels | product launches, AI/data platforms, developer conferences | — |
| `blueprint` | all-light (technical paper) or all-dark | schematic line work, isometric hints, dashed guides, annotated callouts | medium (annotation-led) | neutral sans with monospaced technical accents | system designs, security reviews, engineering walkthroughs | — |
| `soft-rounded` | all-light | rounded cards, gentle tints, soft elevation | medium | humanist sans, friendly small type-scale steps | K-12 education, HR and community, consumer onboarding | — |
| `hand-drawn` | all-light | sketch strokes, paper texture, slight tilts, marker highlights | medium | handwriting or rounded display + clean body sans | campus events, grassroots programs, indie zines, workshop notes | — |
| `ink-wash` | all-light | brush gestures, generous emptiness, seal-like accent marks | low | serif/calligraphic display over quiet sans body | culture and humanities, tea/craft, ceremonial themes | — |
| `retro-pixel` | all-dark or all-light | strict pixel grid, block silhouettes, 1px outlines, HUD brackets, progress strips | medium (motif-led) | pixel/mono display + plain body sans | collection/atlas decks, games, nostalgic tech | — |
| `brutalist` | all-light (newsprint) | raw thick-thin rules, unequal dense columns, flat gray tints | high | ultra-heavy masthead sans + serif body | special-edition reports, bold industry statements | — |
| `poster-pop` | all-light | thick outlines, frame-breaking geometry, sticker shapes, checkerboard accents | high | ultra-heavy rounded display with hard offsets | youth events, campaigns, lineup and schedule decks | — |

Worked examples (full recipes inside scenario docs): `swiss-minimal` → "Klein Blue Swiss Posters" (slides_categories/brand-creative.md) and "ETH Swiss Lab Posters" (slides_categories/academic-research.md); `editorial` → "Humanities & Social Sciences Archival Special Issue" (slides_categories/academic-research.md); `hand-drawn` → "Stencil-Printed Indie Magazine" (slides_categories/brand-creative.md); `brutalist` → "Brutalist Newspaper" (slides_categories/brand-creative.md); `poster-pop` → "Memphis Pop Posters" (slides_categories/brand-creative.md); `consulting-classic` → the Visual References section of slides_categories/analysis-decision.md; `data-journalism` → Direction D of slides_categories/education-training.md §7.

Pick actual typefaces from §4 — a display/body pairing, at most 2 families per deck.

## Choosing and committing

1. In the requirements interview, offer 2–3 **named combinations** (scenario × style × light mode) — e.g. "analysis-decision × consulting-classic × all-light" (the steady default) vs "analysis-decision × data-journalism × all-dark" — instead of adjectives like "business" or "tech".
2. Commit the anchors in the decision paragraph: style name, light mode, signature motif, font pairing (≤2 families), size scale (5–8 anchors).
3. A **signature motif** is a repeating element group (progress strip, corner brackets, index numerals, section tabs) that recurs across same-kind pages with only its state changing. It is never a bare color bar, sidebar strip, or decorative title underline — those read as AI-generated.
4. Custom styles are welcome: name it and write one sentence of behavior contract (light tendency + shape language + decoration density + type character) in the decision paragraph, then stay consistent. The catalog is inspiration, not closure.

# 3. Palette — Custom Guidelines & Built-in Presets

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
8. **Homogenization red line**: never mindlessly reuse preset values (especially the "deep blue + gold" combo); never pile red/yellow/green/purple onto one page (see §1 general rules); each palette's primary + accent combination should be explainable in one sentence of design intent.

## Built-in Presets (backup path)

### When to use

- The user explicitly asks for built-in theme colors, or
- After discussing the palette with the user, a preset is agreed on (proactively suggest alternatives at delivery, e.g. "if you want a steadier business feel, try consult").

Once a preset is chosen, write its **full 17-key color set** into `deck.theme.colors`; if textStyles/tableStyles need no special design, use the default templates at the end of this section (5 text styles + default table style).

### The 10 presets at a glance

| Key | Name | Primary | Accent | Character | Best for |
|---|---|---|---|---|---|
| consult | Consulting Blue | Deep navy #18324E | Vintage gold #D19B2E | Steady, professional, business | Consulting reports, management briefings, strategy analysis, finance |
| tech | Tech Teal | Deep sea teal #0F798A | Bright amber #EB9D1E | Rational, modern, energetic | Tech, internet, product launches, R&D reports |
| orange | Vitality Orange | Burnt orange #B65020 | Deep teal #296C70 | Passionate, action-oriented | Marketing campaigns, e-commerce promos, sports, entrepreneurship |
| green | Forest Green | Deep forest green #1D6744 | Honey gold #CCA133 | Natural, steady, growth | Agriculture, environmental, pharma/health, ESG |
| red | Steady Red | Crimson #A32937 | Neutral steel blue #444E5A | Solemn, formal, alert | Party/government, SOEs, annual summaries, red themes |
| purple | Elegant Purple | Deep violet #542B82 | Warm amber #C79738 | Noble, creative, mysterious | Brand launches, fashion, cultural creativity, women-oriented |
| mono | Premium Gray | Charcoal #1F262D | Gold #C4943B | Minimal, restrained, premium | Designer portfolios, architecture, industry, photography |
| brown | Earth Brown | Cocoa brown #654529 | Honey gold #C99B40 | Warm, rustic, vintage | Cultural tourism, dining, real estate, handicrafts, education |
| morandi | Morandi | Gray sage #5C6B57 | Linen beige #B19B81 | Low saturation, elegant, quiet | Home, aesthetics, lifestyle, women-oriented content |
| sakura | Sakura Pink | Deep rose #913052 | Sage green #61A35C | Soft, clear, friendly | Beauty, mother & baby, weddings, emotional content |

### Full color tables (17 keys × 10 presets)

Primary and chart series colors (chart series cycle = accent1-6, i.e. primary → accent → accent3 → accent4 → accent5 → accent6, taken in series order):

| Preset | primary | accent | accent3 | accent4 | accent5 | accent6 |
|---|---|---|---|---|---|---|
| consult | #18324E | #D19B2E | #38996F | #3F45AB | #6BAF41 | #9C513A |
| tech | #0F798A | #EB9D1E | #389955 | #3F6EAB | #7CAF41 | #9C4C3A |
| orange | #B65020 | #296C70 | #80943D | #A7444F | #46AA54 | #3E6C98 |
| green | #1D6744 | #CCA133 | #409938 | #3FABA7 | #8CAF41 | #9C563A |
| red | #A32937 | #444E5A | #8E4386 | #A0664B | #6A4DA3 | #458892 |
| purple | #542B82 | #C79738 | #993885 | #433FAB | #AF4148 | #939C3A |
| mono | #1F262D | #C4943B | #49886C | #525798 | #719C54 | #8B594B |
| brown | #654529 | #C99B40 | #944B3D | #A7445D | #AAA246 | #73983E |
| morandi | #5C6B57 | #B19B81 | #788958 | #61986C | #9C9863 | #8C5F5A |
| sakura | #913052 | #61A35C | #82644F | #915985 | #8B955B | #518564 |

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

- **Authoritative source**: `packages/model/theme-presets.js` (`THEME_PALETTES`, DEFAULT_THEME = the 1st preset, consult).
- After modifying preset values, must sync the two color tables above; consistency is guarded by `tests/regression/theme-presets.mjs`.

# 4. Font System

## Overview

- **Built-in font library**: `assets/fonts/` (skill resource folder, not uploaded to GitHub) contains **27 free-for-commercial-use fonts**, all verified for name-table family names, embeddable fsType, and subsetting support.
- **Usage**: declare `{family: <registered-name>}` in `deck.fonts` and the font is embedded automatically (subsetted by default). No need to download or place font files.
- **Default font**: `Microsoft YaHei` (built into Windows, declared only — not embedded). It is not in the built-in library (Microsoft copyright, cannot be redistributed/embedded), so it is a system font: declared only, consistent on any Windows machine. For a cross-machine brand font, declare it in `deck.fonts` and reference it explicitly on pages.
- **System fonts**: any `fontFamily` that misses the registry is declared only (not embedded) and depends on the opening system. Common system fonts and their platform coverage are listed under "System Fonts" below (also queryable via `node bin/open-pptd.js fonts list`).
- **Display names vs registered names**: talk to the user in display names (e.g. 得意黑, 思源宋体) when asking for font preferences; write **registered names** into `deck.fonts` / page `fontFamily`.

## Selection Principles

1. Language matching: when the user's query is in Chinese or a Chinese PPT deliverable is requested, specify both Chinese and English fonts; otherwise set English fonts only.
2. Selection approach: prioritize highly readable fonts for body text; use stylized fonts plus special treatments (all caps, widened letter spacing, bold, italics, etc.) in titles or special pages to strengthen the style.
3. The font combination must support the overall visual style positioning.
4. Name consistency: **the page `fontFamily` must exactly match the registered name in the tables below (including case and spaces) — this is the only requirement for embedding to take effect**. Copy the registered name directly; never write the display name.

> The sans table below is ordered by recommendation: **steady, formal, widely applicable fonts first** — pick from the top of the list for a professional look; stylized/creative fonts follow for titles and special pages.

## Built-in Font Library (27 fonts, all free-for-commercial-use + subsettable embedding)

### Sans (黑体)

| Display name | Registered name (family) | Style & character | Best for |
|---|---|---|---|
| 阿里妈妈数黑体 | `Alimama ShuHeiTi` | Geometric sans, orderly commercial look (bold weight) | Business/tech/e-commerce |
| 霞鹜新晰黑 | `LXGW Neo XiHei` | Clear, modern, clean and neat | Tech/body text/general |
| Liter | `Liter` | Modern sans-serif, rational and clean (Latin only — no Chinese glyphs) | Tech/products (English only) |
| Quattrocento Sans | `Quattrocento Sans` | Classic elegant sans-serif, legible at small sizes (Latin only — no Chinese glyphs) | Academic/business/education (English only) |
| MiSans | `MiSans` | Xiaomi system sans, modern and clear, multiple weights | Tech/enterprise/products (backup choice) |
| 得意黑 | `Smiley Sans` | Narrow slanted sans, balance of humanist and geometric (italic glyphs) | Creative tech/brand display/titles |
| HedvigLettersSans | `Hedvig Letters Sans` | Non-designer perspective, distinctive personality (Latin only — no Chinese glyphs) | Creative design/brand (English only) |
| Coda | `Coda` | Rounded, friendly, open curves (Latin only — no Chinese glyphs) | Business/friendly brands (English only) |

### Serif (宋/衬线)

| Display name | Registered name (family) | Style & character | Best for |
|---|---|---|---|
| 思源宋体 | `Source Han Serif CN` | Strong stroke contrast, elegant | Literature/design/formal presentations |
| 霞鹜文楷 | `LXGW WenKai` | Kai with fangsong fusion, warm and delicate | Literature/education/humanities |
| 霞鹜緻宋 | `LXGW ZhiSong MN` | Modern serif | Literature/classic/print style |
| 霞鹜铭心宋 | `LXGW Heart Serif MN` | Delicate strokes | Literature/classic/titles |
| Oranienbaum | `Oranienbaum` | High-contrast geometric serif, classical elegance (Latin only — no Chinese glyphs) | Culture/art/fashion (English only) |
| Sorts Mill Goudy | `Sorts Mill Goudy` | Classical serif, soft and readable (Latin only — no Chinese glyphs) | Literature/humanities (English only) |
| Unna | `Unna` | Neo-classical serif, vertical rhythm (Latin only — no Chinese glyphs) | Literature/publishing/academic (English only) |

### Handwriting / Calligraphy (手写/书法)

| Display name | Registered name (family) | Style & character | Best for |
|---|---|---|---|
| 飞波正点体 | `Feibo Zheng Dots` | Brush calligraphy, heavy and forceful strokes | Movie posters/e-commerce/brand display |
| 阿里妈妈刀隶体 | `Alimama DaoLiTi` | Clerical-script style, chiseled strokes, archaic and forceful | Guochao/culture/art display |
| 阿里妈妈东方大楷 | `Alimama DongFangDaKai` | Yan-style regular script, full and heavy | Culture/brand launch/Chinese-style themes |
| 站酷文艺体 | `zcoolwenyiti` | Fresh handwritten feel, literary | Light design/lifestyle |
| 站酷快乐体 | `HappyZcool-2016` | Lively cute rounded handwriting | Anime/kids/entertainment |
| 霞鹜臻楷 | `LXGW ZhenKai` | Regular-script charm | Chinese style/literature/formal |

### Display / Artistic (标题/艺术)

| Display name | Registered name (family) | Style & character | Best for |
|---|---|---|---|
| 站酷小薇LOGO体 | `xiaowei` | Logo art type, bold personality | Titles/brand marks |
| 站酷庆科黄油体 | `ZCOOL QingKe HuangYou` | Rounded, thick butter-body | Titles/food/light brands |
| Jersey15 | `Jersey 15` | Sports jersey style (Latin only) | Sports/tech display |

### Pixel (像素)

| Display name | Registered name (family) | Style & character | Best for |
|---|---|---|---|
| 精品点阵体 | `BoutiqueBitmap9x9 1.9` | 9×9 dot-matrix pixel style | Games/tech/retro electronics |
| 寒蝉点阵体 | `寒蝉点阵体` | 16px dot-matrix pixel style | Games/retro/pixel |
| Jersey20Charted | `Jersey 20 Charted` | Grid-shadow sports numerals (Latin only) | Sports/mechanical/decorative |

> Full table, sizes, licenses, and source URLs: `assets/fonts/registry.json` (machine-readable, shared by CLI and editor).

> ⚠ Coverage notes (GB2312 level-1 = 3755 most common Chinese chars): the two Japanese-oriented fonts 思源真黑 (`Gen Shin Gothic`) and 思源柔黑 (`Gen Jyuu GothicL`) were **removed from the library** — they lack simplified-Chinese-only glyphs (谁/态/创/对/话/图/视/频 etc.). Latin-only fonts (marked above) have zero Chinese glyphs. Minor punctuation gaps: Alimama DaoLiTi/DongFangDaKai/ShuHeiTi lack full-width 『』％＋＝＜＞＃＆＊＠; Feibo Zheng Dots lacks ＜＞; HappyZcool-2016 lacks full-width （）.

## System Fonts (declared only, not embedded — depend on the opening system)

Reference list of common system fonts (**no font bytes, no embedding, no download**): write the registered name directly in page `fontFamily`; the PPTX only declares it. Appearance depends on whether the opening system has the font — **silently falls back if missing**; cross-platform consistency cannot match embedded fonts. Registered names follow the Windows font name table; the `Platform` column shows coverage — macOS-only fonts (e.g. PingFang) fall back on Windows.

### Chinese (built into Windows)

| Display name | Registered name (family) | Platform | Style & character | Best for |
|---|---|---|---|---|
| 微软雅黑 | `Microsoft YaHei` | Windows 7+ | Modern sans, first choice for on-screen reading (**default font**) | Body text/general |
| 宋体 | `SimSun` | All Windows | Classic Song-style serif, standard for official documents/printing | Body text/formal documents |
| 仿宋 | `FangSong` | All Windows | Fang-song style, standard for official documents | Official documents/formal |
| 楷体 | `KaiTi` | All Windows | Regular script, handwritten scholarly feel | Inscriptions/quotes |
| 黑体 | `SimHei` | All Windows | Classic heavy sans, square and sturdy | Titles/body text |
| 幼圆 | `YouYuan` | All Windows | Round style, soft and friendly | Titles/light scenarios |
| 隶书 | `LiSu` | All Windows | Clerical script, archaic | Titles/decorative |
| 等线 | `DengXian` | Windows 10+ / Office | Office default Chinese font, refined | Body text/general |

### Latin (bundled with Windows / Office)

| Display name | Registered name (family) | Platform | Style & character | Best for |
|---|---|---|---|---|
| Times New Roman | `Times New Roman` | All platforms | Classic serif | Latin body text/academic |
| Arial | `Arial` | All platforms | Classic sans-serif | Latin body text |
| Calibri | `Calibri` | Office | Office default Latin font, rounded | Latin body text |

### macOS Chinese (absent on Windows — falls back cross-platform)

| Display name | Registered name (family) | Platform | Style & character | Best for |
|---|---|---|---|---|
| 苹方 | `PingFang SC` | macOS | macOS default sans | Body text/general (macOS) |

> System fonts are maintained in `registry.json` under `systemFonts` (shared by `fonts list` / `fonts check` and the editor font panel).

## First-Time Setup (after cloning the repo)

Font file binaries (~155 MB) are not committed to git (only `registry.json` metadata is); choose one of two options before first use:

```bash
# Option A: one-time full download (one and done, ~155 MB, works offline)
node bin/open-pptd.js fonts download all

# Option B: on-demand download (download what you use, run before export)
node bin/open-pptd.js fonts download 得意黑
node bin/open-pptd.js fonts check <deck.pptd>   # health check, then download what ✗ marks
```

Missing fonts do not block export: they are skipped with a warning, the PPTX is still generated (family name kept, falls back to system fonts when opened).

## PPTX Font Embedding

By default, export embeds fonts in the `deck.fonts` resource table that **hit the built-in library or carry a `url`** (disable with `--no-embed-fonts`). The embedded PPTX carries its fonts, so any machine opens without missing glyphs.

### 1. deck.fonts declaration syntax

```yaml
fonts:
  得意黑: { family: "Smiley Sans" }          # registry reference: export takes font from built-in library → subsets → embeds
  title-font: { family: "Alimama DaoLiTi", subset: false }   # explicitly disable subsetting (default true)
  web-font:  { family: "SomeFont", url: https://cdn.example.com/somefont.ttf }  # web font (needs CORS)
  body: MiSans                              # slot string: reference only, no embedding
```

- `family` is the **embedding registered name**: must exactly match the tables above (including case and spaces); **a family that misses the registry and has no `url` is treated as a system font — declared only, not embedded**
- The `fonts` map key is an arbitrary slot name; using the display name as the key keeps the deck readable
- `subset: true` (default) embeds only the characters used in the document (TTF subsetting; Chinese can shrink by 100× or more)
- The embedding registered name = font name-table ID16 (typographic family) first, ID1 fallback — all names above are tested, **copy them directly; never write display names**

### 2. No fonts directory needed in a project

Font bytes all live in the skill's built-in library `assets/fonts/`; a deck project stays clean with `deck.pptd + pages/ + media/`.

### 3. CLI font management

```bash
node bin/open-pptd.js fonts list                  # full table + download status ✓/✗
node bin/open-pptd.js fonts download <name|all>   # on-demand / full download into the library (display name or registered name)
node bin/open-pptd.js fonts check <deck.pptd>     # health check: embedded / declared-only / missing
```

### 4. Editor (serve mode)

Toolbar "Fonts" → font management dialog: browse the built-in library by category (Sans / Serif / Handwriting / Display / Pixel), click "Use" to add and write into `deck.fonts` (registered name auto-corrected). Preview and export share the same font bytes (`/assets/fonts/` static service + FontFace).

### 5. Notes

- **Use = embed**: fonts referenced via the registry are always embedded (whether or not installed locally), guaranteeing consistency on any machine; size is controlled by subsetting
- **Do not use embedded fonts as the theme default font** (PowerPoint treats theme fonts as "in use" and forces embedding, bloating the file)
- **A run must actually use the font**: declaring fonts while no page/theme style references the family → PowerPoint drops the embedded declaration. After declaring in `deck.fonts`, remember to use it in `theme.textStyles` or element `fontFamily`
- **Licensing**: all 27 built-in fonts are free for commercial use (OFL / IPA / Alimama / ZCOOL licenses), embeddable and redistributable; Windows commercial fonts such as Microsoft YaHei cannot be redistributed/embedded
- **Restricted fonts**: fonts with fsType = Restricted (0x0002) are skipped with a warning at export (none in the built-in library)
