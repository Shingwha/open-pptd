# Theme and layout directions

This is the single visual-theme entry point for every kit. Read the section for
the selected kit after reading its flat file in `../kits/`. A direction is a seed: derive the
complete theme and write it into `deck.pptd`; never reference a preset by name.

A user-supplied template, brand guide, or design system overrides these visual
directions. The kit's narrative and evidence rules still apply.

## Shared contract

- Use the standard color tokens in `format.md`: 9 semantic tokens, 3
  primary-derived tokens, and 4 additional chart slots. Never emit a partial
  set or leave dangling token references.
- Use registered font names only, with at most two families per deck. Declare
  embedded families in `deck.fonts`; do not use a display face for body copy.
- The layout grammars below are proportional composition guidance, not fixed
  templates. On a 960 × 540 slide, start with 48–64 px outer margins and align
  regions to a shared grid. Choose only the grammars the argument needs.
- Keep page chrome stable while varying the body composition. Do not use the
  same composition on consecutive pages or force every content type into one
  recipe.
- Prefer rows, columns, hairlines, and rectangular evidence regions to rounded
  card grids. No decorative gradients, soft shadows, glow, or filler icons.
- Every external number keeps its source and period. Every figure/table keeps a
  caption, units, and source. Layout density never overrides legibility.

## Academic

**System:** `academic`. **Default light mode:** all-light. A dark cover and
closing may form a sandwich; body pages remain light.

The default voice is a structured, high-density project or thesis defense:
stable section navigation, a top-line proposition, two to four evidence regions,
and a concise takeaway. Blue, green, and purple are alternative structural
palettes for the same system, not colors to mix within one deck.

### Palette

Choose **Defense Blue** unless the user or institution selects another primary.
The three former paper-based directions are retired; do not recreate ivory,
oxblood, titanium, hematoxylin, or ink-green paper themes under new names.

| Token | Defense Blue (default) | Research Green | Scholar Purple |
|---|---|---|---|
| `primary` | `#1D4E89` | `#1F654E` | `#654A7C` |
| `primaryDeep` | `#0D2F55` | `#103B30` | `#392944` |
| `primarySoft` | `#EAF1F8` | `#E9F2ED` | `#F0EBF4` |
| `primaryTint` | `#C7D8EA` | `#C7DCD2` | `#D9CDE1` |

All three variants share these tokens:

| Token | Seed | Use |
|---|---|---|
| `accent` | `#C00000` | Signal red for a keyword, decisive value, or one highlighted series |
| `bg` | `#F5F7FA` | Cool light page field |
| `text` | `#182230` | Main reading text |
| `muted` | `#667085` | Captions, metadata, secondary labels |
| `line` | `#D8E0E8` | Hairlines and region boundaries |

`primary` is the structural color; `accent` is deliberately a separate semantic
signal for this kit. Red is not a second decorative palette: do not use it for
headers, large fields, ordinary bullets, or multiple competing annotations.
Keep scientific color encodings unchanged. Charts use the primary ladder and
neutral grays by default; reserve red for the single series or value that
carries the argument. Complete `success`, `warning`, `danger`, and chart slots
without turning them into additional decoration.

### Typography and density

- Chinese default: `MiSans` for titles, section numbers, and key numbers;
  `Microsoft YaHei` for body, labels, captions, and sources.
- English-first decks may use `Quattrocento Sans` for Latin display/body with
  `Microsoft YaHei` for CJK. Never introduce a third family for equations or
  labels.
- Cover title 44–56 px; page title 28–32 px; section label 11–13 px; body
  15–18 px; module label 13–16 px; annotation 12–14 px; caption/source 9–11 px;
  key number 36–56 px.
- Use line height 1.25–1.45. Body text below 15 px is a defect; cut copy,
  simplify a region, or split the page instead of shrinking it.
- A content page normally carries one proposition, two to four information or
  evidence regions, and one takeaway. High density means layered evidence, not
  several unrelated conclusions or a wall of small text.

### Fixed page chrome

- **Header:** section index such as `2.1`, a specific claim or task title, and
  one thin horizontal rule. Reserve the top-right for a real user-supplied
  institutional mark or a short running label; never invent a logo or add a
  watermark.
- **Proposition:** on background, proposal, and method pages, use a compact
  module label plus one or two sentences immediately below the header. Signal
  red may mark the few words that carry the proposition.
- **Takeaway:** a full-width primary or primaryDeep band may close an argument
  page with one sentence. Omit it when the figure caption/source area needs the
  space or when the page already ends in a decisive statement.
- **Sources:** keep a stable source/page-number baseline. The takeaway band is
  not a substitute for a source line.

### Layout grammar

Use these as compositional patterns, not as a fixed page sequence.

- **Cover — title + field/evidence:** title and author block occupy 60–68% on
  the left; a solid primary field or one real research image occupies the
  remaining right side. Alternatively use a full-width title over a quiet field
  with one small figure detail. Keep one visual anchor and no watermark.
- **Contents — index field + section list:** a primaryDeep field covers the
  left 28–34%; the right side holds 4–6 full-width section rows with aligned
  page numbers and hairline separators. Use only when a long defense genuinely
  needs navigation.
- **Background / gap — proposition + evidence mosaic + takeaway:** reserve
  10–12% for the header, 14–18% for the core proposition, 54–62% for evidence,
  and 9–12% for the takeaway. Within the evidence area, use either a 38%/62%
  policy-versus-platform split, two equal evidence columns, or known/unknown
  rows. Each region must contain real evidence or a specific claim, not an
  empty decorative box.
- **Task decomposition — objective + linked modules:** place the overall aim in
  a narrow top band. Use a horizontal two-stage flow, a 2×2 task matrix with
  explicit connectors, or left task modules feeding a right mechanism/validation
  column. Show relationships with arrows; do not imply sequence with unrelated
  card placement. Keep one reading direction and mark the integrating task.
- **Technical route — central spine:** after header and proposition, use a
  28% / 8% / 52% left-center-right body. Left holds research tasks, the center
  holds a vertical phase/support spine, and the right holds methods and
  validation. Align left and right nodes to the corresponding spine level. The
  spine carries relationships only; it does not contain paragraphs. Increase
  vertical spacing when branches grow rather than shrinking body text.
- **Research foundation — project/platform evidence:** use a 34%/62% split with
  one prior project or policy document on the left and two stacked platform or
  preliminary-result regions on the right, or use three unequal columns when
  each has comparable evidence. Captions name the platform, project, or result;
  photographs and screenshots need sources.
- **Model / method comparison — model + method ledger:** use 45–50% for a model
  or experimental diagram and 45–50% for two method columns or an instrument /
  measure table. Put the shared objective above both and the applicable range or
  limitation below. When the procedure is purely sequential, replace this with
  one horizontal 4–6 stage flow; never mix two reading directions.
- **Results — dominant figure + reading:** the complete figure occupies 55–75%
  of the content area, with a 2–4 line reading column or strip. Alternate
  figure-left and figure-right across comparable result pages; use full width
  for dense multi-panel figures. Never shrink or crop a figure to preserve a
  takeaway band.
- **Results — three-line table + interpretation:** use a full-width table with
  a reading strip, or a 65%/30% table/interpretation split. Keep 3–6 columns
  and 4–8 rows where possible, align numbers on the decimal, and highlight one
  row or column. No vertical rules or spreadsheet-style cell fills.
- **Discussion / limitations — argument ledger:** choose three stacked bands
  (interpretation, supporting evidence, rival explanation) or a two-column
  supported/not-settled ledger. Give limitations the same visual weight as the
  contribution and state the direction of bias.
- **Conclusion / references:** close with 2–4 numbered answers and evidence
  pointers, or return to the cover composition with the answer in place of the
  title. References use one column for 8–12 entries and two for 12–20; never
  shrink below 11 px to fit more.

Academic body pages may use rectangular primarySoft regions and small primary
module headers when those regions organize actual evidence or reasoning. They
must not become a repeated grid of rounded cards, decorative arrows, or colored
headers without content.

## Business Review

**System:** `executive`. **Default light mode:** all-light. A dark cover and
closing are acceptable on stage; body pages stay light for reading and print.

### Palette

| Direction | `bg` | `text` | `muted` | `line` | `primary` | `accent` | `primarySoft` | `primaryTint` | `primaryDeep` |
|---|---|---|---|---|---|---|---|---|---|
| Off-white & Ink Green | `#F7F3E8` | `#1E2A26` | `#6E7A72` | `#DCD6C8` | `#123B2F` | `#B08D3E` | `#E8EFEA` | `#CFDDD4` | `#0B241C` |
| White & Graphite | `#FFFFFF` | `#1F2328` | `#6E7A87` | `#E8EBED` | `#2B2D42` | `#4C7A5A` | `#EFF1F4` | `#D9DEE5` | `#171926` |
| Steel & Signal | `#F4F7F6` | `#1A2430` | `#6B7A85` | `#DCE3E6` | `#1F3240` | `#F0A202` | `#E9EFF1` | `#CFDCE1` | `#0F1D26` |

Use Off-white & Ink Green for formal operations/finance, White & Graphite for
neutral data-heavy reviews, and Steel & Signal for manufacturing or supply
chain. The signal color marks exceptions or one series only, never a header
band.

### Typography and motif

- Chinese default: `MiSans` titles + `Microsoft YaHei` body. Alternative:
  `LXGW Neo XiHei` body/titles + `Alimama ShuHeiTi` numbers/labels.
  English-first: `Quattrocento Sans` + `Source Han Serif CN` for CJK.
- Cover 40–52 px; conclusion title 28–34 px; body 14–17 px; table cell 12–14 px;
  section/KPI label 11–13 px; source 9–11 px; KPI number 40–64 px.
- Choose one fixed header with section tab, a page-number/period block, or a
  small title index. Keep title, evidence, source, and page-number axes stable.

### Layout grammar

- **Cover / KPI:** use a hairline-separated row of 3–4 KPIs, one 96–140 px hero
  number with secondary KPIs below, or a left verdict/right status list. Every
  KPI shows period, unit, and target/prior.
- **Executive summary:** use full-width finding rows plus one evidence strip,
  or a left findings/right decision-and-KPI split. Keep 3–4 findings and put
  the ask in its own bottom band; do not repeat the cover KPI row.
- **Trend / drivers:** chart 55–65% with a driver column, or a full-width time
  series with a narrow driver strip. Small multiples require shared scales and
  2–3 panels. Annotate only the inflection supporting the title.
- **Segment:** choose grouped bars + notes, an actual/target/variance table, or
  3–4 shared-scale small multiples. Do not duplicate the same data as both
  chart and table; reconcile segments to the total.
- **Risks:** use a 4–6 row risk/trigger/mitigation/owner table or a likelihood ×
  impact matrix with a narrow mitigation column. Never use both on one page.
- **Actions:** use a 3–6 row action/owner/date/status/measure table, a timeline
  when sequence matters, or three large commitment rows. Dates are absolute and
  every action has one owner and an observable measure of done.
- **Appendix:** use a KPI definition table, matching source list, or one large
  backup exhibit per page. Keep the body's table style and reading order.

## Consulting Report

**System:** `executive`. **Default light mode:** all-light. A dark section
opener is allowed for a long report; exhibits remain on white/off-white.

### Palette

| Direction | `bg` | `text` | `muted` | `line` | `primary` | `accent` | `primarySoft` | `primaryTint` | `primaryDeep` |
|---|---|---|---|---|---|---|---|---|---|
| Ink Green & Copper | `#F6F1E7` | `#1D2521` | `#6E7A72` | `#DCD3C4` | `#1E3B33` | `#C15F3C` | `#E7EDE9` | `#CDDCD3` | `#10231D` |
| Slate & Signal | `#F4F6F5` | `#1A2430` | `#6B7A85` | `#DCE3E6` | `#1F3240` | `#F0A202` | `#E9EFF1` | `#CFDCE1` | `#0F1D26` |
| Ink & Celadon | `#FFFFFF` | `#1A1A1A` | `#6E7378` | `#E4E6E5` | `#101418` | `#3FA68C` | `#EDF2F0` | `#D5E3DE` | `#0A0D10` |

Use Ink Green & Copper for strategy/industrial work, Slate & Signal for
operations or turnaround, and Ink & Celadon for digital/consumer/growth. Avoid
deep-navy-plus-gold unless it comes from the client's actual brand.

### Typography and motif

- Chinese default: `MiSans` titles/numbers + `Microsoft YaHei` body. More
  editorial: `Source Han Serif CN` titles + `MiSans` body. English-first:
  `Quattrocento Sans` + `Source Han Serif CN` for CJK.
- Cover 40–52 px; finding title 28–34 px; exhibit title 16–20 px; body 14–17 px;
  exhibit/table labels 10–14 px; source 9–11 px; key number 40–64 px.
- Choose one exhibit-number block, an issue-tree branch header, or a decision-
  status footer. Reuse the grammar, not a decorative band.

### Layout grammar

- **Problem:** use three stacked situation–complication–question bands, a large
  decision question with a constraint side column, or an issue map when scope is
  contested. Include decision owner, timing, and criteria; no recommendation yet.
- **Answer first:** place the recommendation across the top with three numbered
  evidence-linked reasons below, or answer left/options and verdicts right. Put
  the condition and ask in a separate band so they are not a fourth reason.
- **Issue tree:** use root-left/branches-center/leaves-right for dense logic or
  root-top/three-columns-below for projection. Limit to 3–4 MECE branches and
  2–3 leaves per branch; connectors use one 1–1.5 px weight. Mark decisive and
  answered branches with labels as well as color.
- **Evidence:** one chart/table occupies 55–75%, with a 2–3 line decision
  reading beside it. Use a two-panel exhibit only when chart and table answer
  the same question from necessary angles. Never place three unrelated exhibits
  on one page.
- **Options matrix:** criteria as rows and 3–4 options as columns, with 4–6
  independent criteria. Use weighted scores only when weights are defensible;
  mark the recommendation once and show the strongest counter-case fairly.
- **Recommendation:** use a decision memo with reasons/conditions, a left
  recommendation/right risk ledger, or recommendation above and rejected options
  below. Cost, risk, owner, and kill criterion remain visible.
- **Roadmap / risks:** use a horizontal 3–4 phase axis with gates below, a
  vertical 4–5 milestone ladder, or timeline above/risk ledger below. Use
  absolute dates, one owner per phase, and measurable gate criteria; no detailed
  project-management Gantt wall.

## Brand Proposal

**System:** `editorial`. **Default light mode:** sandwich or all-light with one
saturated field. All-dark is reserved for a cinematic launch with verified
contrast.

### Palette

| Direction | `bg` | `text` | `muted` | `line` | `primary` | `accent` | `primarySoft` | `primaryTint` | `primaryDeep` |
|---|---|---|---|---|---|---|---|---|---|
| Klein Blue Paper | `#F7F5EF` | `#101010` | `#6E6C66` | `#D8D7D2` | `#0038B8` | `#2F5FD0` | `#E8EDF8` | `#CBD8F0` | `#001F66` |
| Ink & Ivory | `#F5F0E6` | `#0D0D0D` | `#6B665D` | `#DCD3C4` | `#0D0D0D` | `#6D1F2C` | `#EFE8DC` | `#DFD3C2` | `#000000` |
| Stencil Two-Ink | `#F1E2C2` | `#171512` | `#6B6154` | `#D4C29C` | `#1646B8` | `#FF4F87` | `#E7D7B6` | `#D8C49D` | `#0D2A70` |

Klein Blue Paper suits modernist systems, Ink & Ivory suits luxury/editorial
work, and Stencil Two-Ink suits an intentionally loud independent magazine
voice. For Stencil Two-Ink, body text stays ink black and pink remains under
roughly 5% of body pages.

### Typography and motif

- Chinese brand default: `Smiley Sans` display + `MiSans` body. Editorial or
  archival: `Source Han Serif CN` display/body + `Microsoft YaHei` labels.
  English-first: `Oranienbaum` display + `Liter` body, with CJK coverage added
  only within the two-family limit.
- Cover 72–120 px; statement 48–72 px; page title 36–48 px; section numeral
  72–120 px; body 15–18 px; caption 10–11 px; label/index 9–11 px.
- Choose exactly one motif: fixed section numeral, corner bracket pair,
  overprint mark, or running issue/volume line. It may change state, not shape.

### Layout grammar

- **Cover / closing:** use huge type on one flat field, a full-bleed real subject
  with an opaque title block, or concept-justified cropped type with a readable
  small title elsewhere. Closing reuses the cover composition with one explicit
  approval/funding/next-step ask.
- **Opportunity:** use observation left/24–32 px insight right, a 3–4 signal
  cultural timeline, or a category-convention versus unmet-need comparison.
  Keep this quieter than the concept page and source every external observation.
- **Concept:** let one 40–64 px sentence dominate, with three observable pillars
  in a narrow strip; alternatively pair statement/pillars with one specimen. A
  manifesto is allowed only when the copy is genuinely strong. No moodboard
  without a decision.
- **Visual system:** use palette left/type right with grid and image treatment
  below, or show one real application with numbered rule callouts. Limit to six
  swatches and two type families; show at least one real format and one misuse.
- **Campaign / applications:** use three aligned formats, one hero application
  with two detail crops, or a channel/audience matrix. Keep one motif visibly
  consistent and label mockups as mockups.
- **Proof:** one test metric with comparison, one before/after pilot with a
  metric, or 2–3 sourced precedents. Show method, sample, date, and caveat. If
  untested, say so and propose the test instead of inventing validation.

Alternate loud statement pages with quiet evidence/system pages. One main image
per page; no collage or decorative stock filler.

## Lecture

**System:** `instructional`. **Default light mode:** all-light. A dark cover and
closing summary may form a sandwich; projected body pages stay light.

### Palette

| Direction | `bg` | `text` | `muted` | `line` | `primary` | `accent` | `primarySoft` | `primaryTint` | `primaryDeep` |
|---|---|---|---|---|---|---|---|---|---|
| Chalk & Ink | `#FBFAF6` | `#1F2421` | `#6B726C` | `#DEDCD3` | `#1F6B5C` | `#4C9A86` | `#E8F0EC` | `#CBDDD6` | `#0E3A31` |
| Blueprint Classroom | `#F5F7FA` | `#16202B` | `#66717E` | `#D6DEE7` | `#1D3F73` | `#C2622E` | `#E7EDF6` | `#C9D8EB` | `#0C2140` |
| Studio Amber | `#FAF3E6` | `#2A231C` | `#776B5C` | `#E3D6C2` | `#9A4B1E` | `#C98A3C` | `#F3E7D6` | `#E6CFAF` | `#5C2B10` |

Chalk & Ink is the science/quantitative default, Blueprint Classroom suits
engineering and programming, and Studio Amber suits humanities/design/language
workshops. Use the accent for the current step or key term only.

### Typography and motif

- Chinese default: `MiSans` titles/body + `Microsoft YaHei` labels/captions.
  Workshop alternative: `Smiley Sans` titles + `MiSans` body. Reading-heavy:
  `Source Han Serif CN` titles/quotes + `Microsoft YaHei` body/labels.
- Cover 52–64 px; page title 32–40 px; step numeral 40–56 px; body 18–22 px;
  example/code label 14–16 px; practice task 20–24 px; caption/source 11–13 px;
  key term 26–34 px. Body below 18 px is a legibility defect.
- Use line height 1.4–1.6. Choose one step counter, numbered objective/practice
  marker, or fixed section label; repeat it with state changes only.

### Layout grammar

- **Cover / objective:** title and scope on the left 60% with a metadata strip,
  or one full-width question with instructor/scope below. Objectives use 2–4
  numbered observable outcomes plus a visible success check; independent skills
  may use parallel columns.
- **Concept:** definition left/diagram right with misconception strip below, or
  a term with a small contrast table for classification. The diagram occupies
  35–55%; one concept and one misconception per page.
- **Worked example:** use prompt → expert move → result bands, naive versus
  expert columns, or a real annotated artifact with a narrow reasoning column.
  Preserve the original prompt and show 2–4 moves with reasons, not only the
  answer.
- **Walkthrough:** use a horizontal 3–6 stepper with only the current step
  expanded, a left step stack/right detail panel, or a large real tool artifact
  beside numbered steps. Mark current progress consistently and keep tool,
  command, and version details exact.
- **Practice:** task left/check right/hint footer is the default. Mixed groups
  may use warm-up/core/stretch tiers; communication skills may use two roles
  with a shared check. The required output, constraints, and observable success
  criteria stay visible while the learner works.
- **Summary:** three numbered takeaways mapped to objectives, a small concept
  map with no new nodes, or one exit-ticket question plus a recap. Introduce no
  new content and end with a concrete next step.

Whitespace around the example is instructional. Split pages rather than
shrinking type or exceeding six steps.

## Poster

**System:** `editorial`, exactly one page. Default to a light field. A dark field
is allowed only for Night Gallery and must cover the whole poster.

### Palette

| Direction | `bg` | `text` | `muted` | `line` | `primary` | `accent` | `primarySoft` | `primaryTint` | `primaryDeep` |
|---|---|---|---|---|---|---|---|---|---|
| Conference Ivory | `#F7F4EC` | `#161616` | `#6C675E` | `#DAD2C4` | `#14504A` | `#B2542D` | `#E6EFEC` | `#C8DCD6` | `#08302B` |
| Poster Blue | `#F4F6FA` | `#10151C` | `#65707D` | `#D4DAE2` | `#1D3F8F` | `#C2410C` | `#E6ECF7` | `#C6D3EA` | `#0B1F4D` |
| Night Gallery | `#141414` | `#F3EEE4` | `#A39C8F` | `#3A3733` | `#E0A64A` | `#C96F3E` | `#242220` | `#3A342C` | `#0B0A09` |

Conference Ivory is the academic/public-science default, Poster Blue suits
engineering/data/systems, and Night Gallery suits evening exhibitions or screen
display. Never invert a scientific figure unless its source permits it.

### Typography and motif

- Chinese default: `MiSans` title/body + `Microsoft YaHei` labels/references.
  Research-reading alternative: `Source Han Serif CN` title/lead + `MiSans`
  body/labels. Design/public-facing: `Smiley Sans` title + `MiSans` body.
- A2 sizes: title 96–120 px; authors 28–34 px; affiliation 22–26 px; section
  head 44–54 px; body 26–30 px; key number 80–120 px; caption/source 20–22 px;
  references 18–20 px; QR label 18–20 px. Multiply by 1.41 for A1 and 2 for A0.
- Body below 24 px at A2 is a defect. Choose one left section-index rail, one
  weight of inter-block hairline, or one fixed venue/poster-number label.

### Layout grammar

Follow the canvas and safe-area rules in `../kits/poster.md`; never stretch a
16:9 slide into a poster. Build one Z-shaped reading path and 3–5 evidence blocks.

- **Title:** full-width top band, title-left/key-figure-right, or one short
  statement with authors below. Keep logos smaller than authors and out of the
  lead position.
- **Abstract:** a 100–180 word full-width block, problem/approach versus
  claim/implication columns on a landscape board, or a 40–48 px claim above
  26–28 px body copy. Never trap the abstract in a narrow side column.
- **Method / data:** three compact sample/procedure/analysis blocks, a design
  diagram left with notes right, or a horizontal longitudinal timeline. Keep it
  smaller than results and state n, period, instrument, and analysis.
- **Results:** the complete main figure occupies 40–55% of the content area,
  with a narrow 2–3 number rail or a 60%/40% figure/reading split. A compact
  table is allowed only when categorical comparison is clearer than a figure.
- **Conclusion:** one full-width takeaway band with at most three bullets, a
  found/means two-column block, or one 44–54 px statement plus qualification.
  Repeat only numbers already present in results.
- **References / QR:** references bottom-left with QR and label bottom-right,
  references/QR in an existing right column, or QR beside the title only when
  the bottom edge will be obstructed. Use a real stable link and test the code;
  a placeholder must be explicitly labelled and non-scannable.

One poster carries one claim, one main figure, and one takeaway band. Cut a
competing story rather than adding another column.
