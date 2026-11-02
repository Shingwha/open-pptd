# Design Guide — Scenario × Visual Style × Palette × Fonts × Icons

Design decisions are shared by this file; scenario-specific argumentation,
density, page recipes, and worked examples live in `slides_categories/`.
A user-supplied template, reference, or brand system always takes priority.

## 1. Scenario categories and general rules

### Determine the scenario

Choose the category from the audience and reader task, not from the topic alone.
Read exactly one matching scenario file before generating.

| Scenario | Typical work | Reader task | File | Default style |
|---|---|---|---|---|
| Analysis & decision | Consulting, finance, strategy, investment | Compare options and commit | `slides_categories/analysis-decision.md` | `consulting-classic` |
| Business proposal | Marketing, sales, fundraising, partnership | Believe the value and take action | `slides_categories/business-plan.md` | `editorial` |
| Management reporting | Work reports, retrospectives, quarterly reviews | Grasp status, problems, and actions | `slides_categories/management-report.md` | `consulting-classic` |
| Academic research | Thesis, defense, proposal, research report | Judge problem, method, evidence, contribution | `slides_categories/academic-research.md` | `consulting-classic` or the category's research-defense direction |
| Education & training | Courseware, demonstrations, professional teaching | Understand, remember, practise, apply | `slides_categories/education-training.md` | `editorial` |
| Tech & engineering | Architecture, R&D, AI/data/ops/security | See structure, dependencies, metrics, trade-offs | `slides_categories/tech-engineering.md` | `swiss-minimal` or `blueprint` |
| Brand / creative showcase | Brand stories, portfolios, cultural events | Build perception and leave a memory | `slides_categories/brand-creative.md` | `editorial` |

For a poster, infographic, or highly visual single page, use
`slides_categories/poster.md`; never force that format into an ordinary deck.

### General rules

1. Give every page a clear reader task and one focal point.
2. Every page needs a visual element: chart, figure, diagram, table, or composed
   shape group. Text-only pages are reserved for genuine statements or quotes.
3. Alternate text-driven, data-driven, and image/diagram-driven pages when the
   material allows it.
4. Use one signature motif as an element group: section index, exhibit number,
   step counter, corner brackets, caption mark, or running label. A bare color
   bar or decorative title underline is not a motif.
5. Keep page chrome stable while varying body composition. Do not repeat the
   same composition on consecutive pages.
6. Use native charts for quantitative data and shapes for structure, flow,
   relationships, and annotation.
7. Every external fact keeps its source and period. Every figure/table gets a
   number, caption, units, measurement basis, and source.
8. Never invent data, citations, customer cases, results, logos, or sources.
   Missing material remains an explicit placeholder.
9. Use original evidence first. Generated imagery is expression only, requires
   consent, and never stands in for evidence.

### Positive layout vocabulary

| Purpose | Direction |
|---|---|
| Opening / closing | Bold title composition, oversized type, asymmetric field, or full-bleed real image |
| Process / workflow | Numbered step chain, chevrons, timeline, or central spine |
| Comparison | Side-by-side panels or a table on shared dimensions |
| Data / metrics | Chart-centric layout plus one decisive stat or reading |
| Key insight | One conclusion sentence with restrained support |
| Peer items | Full-width rows or parallel columns with hairlines, not a default card grid |
| Evidence | Complete figure/table plus a short adjacent reading |

### Strictly forbidden

- Card grids as a substitute for hierarchy; decorative title underlines;
  decorative gradients, glow, soft shadows, and filler icons.
- Red, purple, yellow, and green collected on one page without a semantic need.
- Centered body text, shrinking below the scenario's font minimum, or leaving a
  planned evidence region mostly empty.
- Decorative SmartArt, stock imagery used as evidence, generated data or
  experimental images, and unverified institutional marks.

## 2. Visual style menu

A scenario controls argumentation; a visual style controls appearance. Choose
them independently. Light mode is independent too: **all-light**, **sandwich**
(dark cover/closing with light body), or **all-dark** when contrast is proven.

| Style | Shape and decoration | Type character | Typical fit |
|---|---|---|---|
| `swiss-minimal` | Strict grid, right angles, hairlines, one heavy rule | Neutral sans, extreme size contrast, giant numerals | Research posters, engineering, portfolios |
| `consulting-classic` | White field, single-color skeleton, thin separators, stable axes | Sans titles, conclusion-led titles, restrained serif optional | Consulting, management, finance |
| `editorial` | Rules, columns, asymmetric grids, pull quotes, image slots | Serif display or heavy sans over quiet body | Brand stories, proposals, teaching |
| `data-journalism` | Structured micro-chart grids, sidebars, chart annotations | Compact body and tabular figures | Industry research, data reviews, atlas |
| `dark-tech` | Geometric precision, restrained line/glow accents | Neo-grotesque sans and monospaced data | Product launches, AI/data platforms |
| `blueprint` | Schematic lines, dashed guides, annotated callouts | Neutral sans with technical accents | Systems, security, engineering walkthroughs |
| `soft-rounded` | Gentle tints and controlled elevation | Humanist sans and friendly small steps | Education, HR, consumer onboarding |
| `hand-drawn` | Sketch strokes, paper texture, slight tilts | Handwriting or rounded display over clean sans | Campus, community, independent events |
| `ink-wash` | Brush gestures, generous emptiness, seal-like marks | Serif/calligraphic display over quiet sans | Culture, literature, ceremony |
| `retro-pixel` | Strict grid, block silhouettes, HUD brackets | Pixel/mono display over plain sans | Games, collections, retro electronics |
| `brutalist` | Thick-thin rules, unequal dense columns, flat tints | Ultra-heavy masthead with serif body | Special reports, bold statements |
| `poster-pop` | Thick outlines, frame-breaking geometry, sticker shapes | Ultra-heavy rounded display with hard offsets | Youth events, campaigns, lineups |

Do not mix foreign elements into a sharp-cornered style or treat the menu as a
fixed template. Commit to one style before writing pages.

### Decision paragraph

Before generating, state the scenario, visual style, light mode, palette
direction, font pairing (at most two families), 5–8 type anchors, density,
signature motif, layout direction, and image policy. This is the deck's design
contract.

## 3. Palette

### Custom palette by default

Design from the subject, reference, institution, and evidence. Write a complete
17-key set into `deck.theme.colors`:

- Semantic: `primary`, `accent`, `bg`, `text`, `muted`, `line`, `success`,
  `warning`, `danger`.
- Primary-derived: `primarySoft`, `primaryTint`, `primaryDeep`.
- Chart slots: `accent3`, `accent4`, `accent5`, `accent6`; slots 1/2 are
  `primary` and `accent`.

Rules:

1. `primary` carries structure, headers, and the first series; `accent` marks a
   keyword, decisive value, or one highlighted series.
2. White on primary and body text on background meet at least 4.5:1 contrast;
   large text meets at least 3:1.
3. Derived colors stay in the primary family; neutrals carry a subtle family hue.
4. Chart slots remain distinguishable by hue or lightness. Keep scientific color
   encodings unchanged.
5. Semantic colors retain their meaning. A signal-red annotation role is not
   permission for a multicolor page.
6. Write explicit hex values into the deck. These presets are authoring seeds,
   not runtime theme names; never reference a preset by string.

### Preset overview

| Key | Name | Primary | Accent | Character |
|---|---|---|---|---|
| consult | Consulting Blue | `#18324E` | `#D19B2E` | Steady consulting and finance |
| tech | Tech Teal | `#0F798A` | `#EB9D1E` | Rational technology and R&D |
| orange | Vitality Orange | `#B65020` | `#296C70` | Marketing and entrepreneurship |
| green | Forest Green | `#1D6744` | `#CCA133` | Environment, agriculture, ESG |
| red | Steady Red | `#A32937` | `#444E5A` | Formal and solemn |
| purple | Elegant Purple | `#542B82` | `#C79738` | Culture, beauty, premium |
| mono | Premium Gray | `#1F262D` | `#C4943B` | Minimal editorial and industrial |
| brown | Earth Brown | `#654529` | `#C99B40` | Culture, tourism, food |
| morandi | Morandi | `#5C6B57` | `#B19B81` | Quiet, low-saturation lifestyle |
| sakura | Sakura Pink | `#913052` | `#61A35C` | Warm, soft, public-facing |

### Chart series slots

| Preset | primary | accent | accent3 | accent4 | accent5 | accent6 |
|---|---|---|---|---|---|---|
| consult | `#18324E` | `#D19B2E` | `#38996F` | `#3F45AB` | `#6BAF41` | `#9C513A` |
| tech | `#0F798A` | `#EB9D1E` | `#389955` | `#3F6EAB` | `#7CAF41` | `#9C4C3A` |
| orange | `#B65020` | `#296C70` | `#80943D` | `#A7444F` | `#46AA54` | `#3E6C98` |
| green | `#1D6744` | `#CCA133` | `#409938` | `#3FABA7` | `#8CAF41` | `#9C563A` |
| red | `#A32937` | `#444E5A` | `#8E4386` | `#A0664B` | `#6A4DA3` | `#458892` |
| purple | `#542B82` | `#C79738` | `#993885` | `#433FAB` | `#AF4148` | `#939C3A` |
| mono | `#1F262D` | `#C4943B` | `#49886C` | `#525798` | `#719C54` | `#8B594B` |
| brown | `#654529` | `#C99B40` | `#944B3D` | `#A7445D` | `#AAA246` | `#73983E` |
| morandi | `#5C6B57` | `#B19B81` | `#788958` | `#61986C` | `#9C9863` | `#8C5F5A` |
| sakura | `#913052` | `#61A35C` | `#82644F` | `#915985` | `#8B955B` | `#518564` |

### Neutral, semantic, and derived values

| Preset | bg | text | muted | line | primarySoft | primaryTint | primaryDeep |
|---|---|---|---|---|---|---|---|
| consult | `#FFFFFF` | `#1F2428` | `#6E7A87` | `#E8EBED` | `#EFF2F5` | `#D7E0EA` | `#0A1929` |
| tech | `#FFFFFF` | `#1F2728` | `#6E8387` | `#E8ECED` | `#EFF4F5` | `#D7E7EA` | `#0F4D57` |
| orange | `#FFFFFF` | `#28221F` | `#87766E` | `#EDEAE8` | `#F5F1EF` | `#EADDD7` | `#8B3D18` |
| green | `#FFFFFF` | `#1F2824` | `#6E877B` | `#E8EDEB` | `#EFF5F2` | `#D7EAE1` | `#0F432A` |
| red | `#FFFFFF` | `#281F20` | `#876E71` | `#EDE8E9` | `#F5EFF0` | `#EAD7D9` | `#811825` |
| purple | `#FFFFFF` | `#231F28` | `#7A6E87` | `#EAE8ED` | `#F2EFF5` | `#E0D7EA` | `#3B1A61` |
| mono | `#FFFFFF` | `#1F2328` | `#6E7A87` | `#E8EAED` | `#EFF2F5` | `#D7E0EA` | `#0F141A` |
| brown | `#FFFFFF` | `#28231F` | `#877A6E` | `#EDEAE8` | `#F5F2EF` | `#EAE0D7` | `#452C17` |
| morandi | `#FFFFFF` | `#22281F` | `#75876E` | `#E9EDE8` | `#F1F5EF` | `#DCEAD7` | `#41543B` |
| sakura | `#FFFFFF` | `#281F22` | `#876E77` | `#EDE8EA` | `#F5EFF1` | `#EAD7DE` | `#711E3B` |

All presets use `success #33A362`, `warning #B4872D`, and `danger #BE392D`.
These are authoring values only; adapt them when a reference or institution
requires another system.

## 4. Font system

- Match the language and specify CJK and Latin roles where needed.
- Use registered family names exactly. At most two families per deck.
- Built-in families declared in `deck.fonts` are embedded as subsets by default.
  Keep subsetting unless the user explicitly needs editing with new glyphs on a
  machine without the font.
- Unknown families without a URL are declared only. Microsoft YaHei is a Windows
  system font and is not embedded.
- Do not use a display face for body copy.

### Built-in sans

| Display | Registered name | Character / use |
|---|---|---|
| 阿里妈妈数黑体 | `Alimama ShuHeiTi` | Geometric commercial titles and numbers |
| 霞鹜新晰黑 | `LXGW Neo XiHei` | Clear modern Chinese and body text |
| Liter | `Liter` | Latin-only modern sans |
| Quattrocento Sans | `Quattrocento Sans` | Latin academic/business sans |
| MiSans | `MiSans` | Modern CJK titles, body, and products |
| 得意黑 | `Smiley Sans` | Narrow creative display |
| Hedvig Letters Sans | `Hedvig Letters Sans` | Latin creative display |
| Coda | `Coda` | Latin friendly display |

### Built-in serif

| Display | Registered name | Character / use |
|---|---|---|
| 思源宋体 | `Source Han Serif CN` | Formal academic and editorial CJK |
| 霞鹜文楷 | `LXGW WenKai` | Warm teaching and humanities |
| 霞鹜緻宋 | `LXGW ZhiSong MN` | Modern serif |
| 霞鹜铭心宋 | `LXGW Heart Serif MN` | Delicate CJK display |
| Oranienbaum | `Oranienbaum` | Latin high-contrast display |
| Sorts Mill Goudy | `Sorts Mill Goudy` | Latin classical serif |
| Unna | `Unna` | Latin editorial and academic serif |

### Handwriting, display, and pixel

- Handwriting/calligraphy: `Feibo Zheng Dots`, `Alimama DaoLiTi`,
  `Alimama DongFangDaKai`, `zcoolwenyiti`, `HappyZcool-2016`, `LXGW ZhenKai`.
- Display: `xiaowei`, `ZCOOL QingKe HuangYou`, `Jersey 15`.
- Pixel: `BoutiqueBitmap9x9 1.9`, `寒蝉点阵体`, `Jersey 20 Charted`.

Latin-only fonts have no Chinese glyphs. Check glyph coverage before committing,
especially full-width punctuation in display faces.

### Useful system fonts

- Chinese Windows: `Microsoft YaHei`, `SimSun`, `FangSong`, `KaiTi`, `SimHei`,
  `YouYuan`, `LiSu`, `DengXian`.
- Latin: `Times New Roman`, `Arial`, `Calibri`.
- macOS-only `PingFang SC` falls back on Windows and should not be the default.

## 5. Icons

Use Font Awesome Free with `fas:<name>`, `far:<name>`, or `fab:<name>`. Use
official names and theme-token fills. Icons scale proportionally inside bounds.

Icons are seasoning at line starts, stat callouts, or compact labels. Never build
card grids of icons, use them as evidence, or invent logos. Unknown names are
skipped at export with a warning; check the result rather than guessing.

## 6. Evidence, images, and pre-delivery review

- Use original figures and tables first. Re-plot only with reliably extracted
  real values and mark `Redrawn from <source>`.
- Keep axes, legends, units, error bars, significance marks, and panel labels.
  Evidence images use `fit: contain` and are never cropped to fit.
- A figure/table number, caption, source, and period stay with the object.
- Mark projections, model estimates, and interpretations distinctly from
  observed results. Do not round away meaning or change a metric definition
  silently.
- Academic decks default to no stock or generated imagery. Method diagrams,
  experimental photos, logos, and real people/products are evidence or brand
  assets, not generated expression.
- Before delivery, read the titles as the argument and inspect thumbnails for
  overflow, occlusion, distortion, contrast, accidental repetition, and missing
  sources. Fix gross defects rather than chasing renderer-specific pixels.
