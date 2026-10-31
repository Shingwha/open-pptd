# Design systems

Design here means **content-first structure**, not a style menu. Pick one of
four systems for the deck, state it, and stay inside it. A system constrains
grid, type, color, density, and decoration; it never prescribes a fixed page
order. A user-provided brand guide, template, or design system always wins.

| System | Used by | Character |
|---|---|---|
| `academic` | Academic kit | Paper-like, strict grid, restrained single accent, evidence first |
| `executive` | Business-review, consulting-report kits | White field, single skeleton color, conclusion titles, dense evidence |
| `editorial` | Brand-proposal kit; poster variant | Expressive type, asymmetric grid, one motif, image-led |
| `instructional` | Future lecture kit | Large type, explicit steps, examples, practice |

Choose by the reader's task, not by topic: a research deck for a funding
committee is still `academic`; a research finding turned into a management
decision may be `executive`.

## 1. academic

**Reader task:** judge the problem, method, evidence, and contribution. The
deck is often read on screen and defended in person.

- **Field:** white, ivory (#F7F3E8), titanium gray (#E7E8E5), or archival paper
  (#F1E9DA). No colored header bands, no gradient backgrounds.
- **Color:** one restrained accent drawn from the subject (institutional,
  discipline, or material), used for emphasis, key numbers, and the main data
  series. Keep it under roughly a tenth of a normal page. Neutrals tinted with
  the accent hue; no second decorative accent.
- **Type:** a serif for titles or body evidence and a neutral sans for labels,
  or a single neutral sans with strong size contrast. Latin and CJK roles may
  differ (e.g. serif Latin + hei CJK). Never more than two families.
- **Grid:** strict 12-column grid, generous outer margin (48–72 px on 960×540),
  fixed title/figure/caption/source baselines. Asymmetric proportions (3:9,
  4:8, 5:7) are normal; a full-page figure is normal.
- **Density:** high but readable. Body 16–19 px, captions 10–12 px, line height
  1.25–1.45. A region planned for a figure must be filled by the figure — do
  not leave a planned region 30% empty.
- **Evidence:** the main figure occupies 55–75% of the content area, complete
  with axes, legends, units, and significance marks. One result per page.
  Tables use the three-line (booktabs) convention: top rule, header rule,
  bottom rule; no vertical lines.
- **Decoration:** none in the body. Cover, section, and closing pages may use
  one solid color field or a full-bleed research image. No icons as filler, no
  cards, no soft shadows, no watermark emblems.
- **Motif:** a thin section rule, index numeral, or fixed figure-caption mark —
  an element group, not a color bar under the title.

Do: cite the figure source in the caption; align numbers on the decimal; keep
formula numbering; state the sample and the comparison baseline.
Don't: enlarge an institution emblem as decoration; recolor scientific figures
to match the palette when color carries meaning; use blue-and-white business
styling for a life-sciences talk; center body text.

## 2. executive

**Reader task:** grasp status fast and decide. Titles are conclusions; the page
exists to prove the title.

- **Field:** white or warm off-white. One structural color (navy, ink green,
  charcoal, oxblood) plus 2–3 light tints of the same hue and neutral grays.
  No second decorative accent.
- **Type:** sans titles with a clear weight jump, sans body; a serif title is
  allowed if used consistently. Titles 28–36 px, body 14–17 px, source 9–11 px.
  A title-to-body ratio of roughly 2× keeps the hierarchy legible.
- **Grid:** stable header/footer axes. Title zone, evidence zone, interpretation
  zone, and source line have fixed coordinates across pages; nothing jumps when
  flipping. Section navigation may sit in the header, with the current section
  distinguished by position or weight, not by a rainbow of colors.
- **Density:** high on body pages — charts, tables, and structure diagrams are
  the body; text is annotation. Covers, section openers, and closing pages use
  whitespace as the breath.
- **Charts:** de-default completely. Remove default series colors, vertical
  grid lines, chart borders, and legend boxes where possible. Reassign series
  to the primary ladder and grays. Keep horizontal grid lines extremely light.
  Label endpoints and inflection points; put the "so what" in a short column
  beside the chart, not in a paragraph under it.
- **Tables:** dark header with white text; thin horizontal rules only; no
  vertical lines, no zebra striping unless it is a very wide table. Numbers
  right-aligned, text left-aligned, first column bold. A large table gets an
  interpretation panel, not a caption alone.
- **Decoration:** no shadows, gradients, textures, glow, rounded cards, or
  thick frames. Separation is by whitespace and hairlines. A short primary rule
  or vertical bar may mark emphasis, never as a repeating decorative motif.
- **Motif:** page-number/section block, index numeral, or a stable source-line
  grammar. Reuse the grammar, not a decorative stripe.

Do: make every title a sentence with a verb and a number when available; put
the source and measurement basis at the bottom of every data page; show the
comparison baseline. Don't: use section labels as titles ("Business Review");
use emotive curve narratives; build card grids; use Office default blue.

## 3. editorial

**Reader task:** believe a concept, remember an image, buy a direction. Use it
for brand and creative work, and for single-page posters as a variant — not for
ordinary business or academic decks.

- **Field:** one deliberate ground — paper white, ink black, warm cream, or a
  single saturated field. No generic AI gradient.
- **Color:** a tight palette: ground, ink, one signature accent, one auxiliary.
  Large color fields are allowed on covers and section pages; body pages keep
  the accent to a small area. Reject red+purple+yellow+green on one page.
- **Type:** a display/body pairing with obvious contrast (serif display over
  quiet sans, or heavy grotesque over serif body). Poster-level sizes are
  allowed on covers and statements; body stays readable (15–18 px). One
  family may carry the whole deck through weight and size.
- **Grid:** asymmetric and intentional — 2:8, 3:7, full-bleed image, a narrow
  marginal column. Ratios are allowed; chaos is not. Keep one alignment spine.
- **Motif:** exactly one recurring element group (index numeral, corner
  brackets, section tab, overprint mark) with state changes. It must be an
  element group, not a bare color bar, sidebar strip, or decorative underline.
- **Images:** image-led pages are expected. One main image per page; no photo
  collages or decorative stock filler. Caption and credit every image; see
  `images.md`.
- **Density:** pages alternate — a loud cover/statement, a quiet evidence page,
  a dense system page. Do not make every page a poster.

Do: let the concept drive one visual rule and repeat it; use real subject
material (product, archive, place); use whitespace as a material.
Don't: mix two motifs; use rounded cards, glassmorphism, or soft shadows; use
generated imagery as evidence; apply editorial styling to a quarterly review.

## 4. instructional

**Reader task:** understand, remember, and apply. Use for teaching, training,
and explainers.

- **Field:** light and calm; one accent for the current step or key term.
- **Type:** large — titles 32–40 px, body 18–22 px, line height 1.4–1.6.
  Minimum body size is a readability rule, not a style choice.
- **Grid:** one idea per page; a visible step sequence (1/2/3) or a worked
  example with the prompt, the move, and the result.
- **Density:** lower than executive; white space around the example. A page
  may hold a single diagram and three lines of text.
- **Structure:** objective → concept → example → practice → summary. Practice
  pages give a task and a check, not just content.
- **Decoration:** simple diagrams and one accent; no gamified clutter.

## Cross-system grid

- Canvas 960×540. Outer margin 48–72 px; body column 12 columns with 20–24 px
  gutters. Content never touches the edge.
- Keep a 24 px safe zone inside any full-bleed image for text.
- Align every element to a column edge or a shared baseline. Do not center body
  text; center titles only when the system calls for it.
- One focal point per page. If two objects compete, one is decoration — remove
  it or demote it.
- Every page has at least one visual element (chart, figure, diagram, composed
  shape group). Text-only pages are a last resort for quotes or statements.

## Type scale

Use 5–8 anchors for the whole deck and reuse them. A workable default for
executive/academic:

| Role | px |
|---|---|
| Cover title | 44–64 |
| Page title | 28–36 |
| Section / statement | 32–48 |
| Body | 15–19 |
| Secondary body / annotation | 12–14 |
| Caption / source | 9–11 |
| Big number | 40–72 |

Rules: title-to-body contrast should be obvious (about 2×). Keep one line
length around 28–40 CJK characters or 60–75 Latin characters. Do not shrink
body text to fit; cut copy or split the page. Fonts must be written as
registered family names; at most two families. Font pairing suggestions live in
each kit's `theme.md`; the registry is the authority, not memory.

## Density and rhythm

- Alternate text-driven, data-driven, and image/diagram-driven pages.
- No page recipe repeats on consecutive pages. If two pages share a skeleton,
  change at least the proportion or the emphasis.
- Card grids are capped at roughly one in five content pages and never on
  consecutive pages. Prefer rows, columns, and hairlines to cards.
- A cover and a closing page should close the loop visually; section openers
  may reuse the cover's composition, not its content.
- Optional pages are optional: not every deck needs a table of contents,
  agenda, or section dividers. Add them only when navigation is genuinely hard.

## Chart and table discipline

- Numbers with axes → native chart; boxes and arrows → shapes. Never fake a
  chart with rectangles.
- One message per chart. If a chart needs three conclusions, split it or
  annotate one and move the rest to text.
- Remove chart junk: default palette, 3-D, shadows, heavy grid, redundant
  legends, decimal noise. Keep units, baseline, and source.
- Highlight with one accent series or one callout; gray the rest.
- Tables: fewer columns, more row meaning. Align numbers right and keep
  decimals consistent. Highlight one row or column, not a rainbow. Put the
  reading instruction next to the table.
- Every figure/table: number + caption + source. The caption says what is
  shown and the condition; the source line says where it came from and when.

## Color discipline

- Design a palette per deck from content, industry, audience, and any brand
  asset. Do not reuse a preset blindly, especially deep-blue-plus-gold.
- Full standard token set (semantic + derived + chart slots); no dangling
  tokens. Values are explicit hex in the manifest.
- White-on-primary contrast ≥ 4.5:1; body text on background ≥ 4.5:1; large
  text ≥ 3:1. Check derived tints, not just the primary.
- Semantic colors stay semantic: green success, amber warning, red danger.
- One accent family, one neutral family. A page may use one high-saturation
  field or one accent, not a collection.

## Anti-homogenization

The failure mode is a deck that looks generated: every page a title plus three
cards, a gradient cover, a decorative underline, the same blue. Defend against
it structurally:

1. Build the page order from the argument, not from a template.
2. Vary recipes and variants; no two consecutive pages share a composition.
3. Let the content choose the form: series → chart; 2–3 options → matrix;
   steps → sequence; one conclusion → statement; evidence → figure + reading.
4. Use a kit's fragments as geometry references, never as a deck to copy.
5. Keep one motif and change its state; do not add new decoration per page.
6. Before delivery, flip through titles only: they should read as the argument.
   Then flip through thumbnails: no two pages should be mistakable for each
   other except intentional motif repeats.

## Decision paragraph

Before generating, write one short paragraph with the anchors: system, light
mode (all-light / sandwich / all-dark), palette direction (not a full table),
font pairing (≤2), type scale anchors, signature motif (an element group), and
image policy (none / evidence only / generated expression with consent). This
paragraph is the contract for every page.
