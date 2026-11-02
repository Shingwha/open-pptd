# Design systems

Design means **content-first structure**, not a style menu. Choose the system by
the audience's reading task, then read the matching visual and layout direction
in `themes.md`. A user-provided brand guide, template, or design system always
wins over the default visual direction.

| System | Used by | Reader task |
|---|---|---|
| `academic` | Academic kit | Judge the problem, method, evidence, and contribution |
| `executive` | Business-review and consulting-report kits | Grasp status or options and commit to an action |
| `editorial` | Brand-proposal kit and poster variant | Believe a concept, remember an image, or stop at a poster |
| `instructional` | Lecture kit | Understand, practise, and apply one idea |

A research deck for a funding committee is still `academic`; a research finding
turned into a management decision may be `executive`. Do not choose a system
from the topic alone or mix systems for visual variety.

`themes.md` is the single source for palettes, theme-specific type scales,
light/dark mode, motifs, and layout grammars. Each flat `kits/<kit>.md` owns
narrative, page content, and evidence. This file owns only cross-system design rules.

## Grid and composition

- Standard slide canvas: 960 × 540. Use 48–72 px outer margins and a 12-column
  body grid with 20–24 px gutters unless the selected theme specifies otherwise.
  Posters follow their own A-series canvas and safe-area rules.
- Keep a 24 px safe zone inside any full-bleed image for text.
- Align every element to a column edge or a shared baseline. Do not center body
  text; center titles only when the selected direction calls for it.
- Use asymmetric proportions when they clarify priority: 3:9, 4:8, 5:7, a
  narrow reading rail, or a full-page figure. Ratios are guidance; preserve one
  visible alignment spine.
- Give each page one focal point. If two objects compete, demote or remove one.
  On an academic evidence-mosaic page, several regions may support the focal
  proposition, but none becomes a second unrelated story.
- Every page needs at least one visual element: chart, figure, diagram, table,
  or composed shape group. Text-only pages are reserved for genuine statements,
  questions, or quotes.
- Fill planned evidence regions with evidence. Put breathing room between
  regions rather than leaving a figure box 30% empty.

## Typography and information density

- Use 5–8 reusable type anchors for the deck. The selected section of
  `themes.md` defines their sizes; keep title-to-body contrast obvious.
- Keep one line near 28–40 CJK characters or 60–75 Latin characters unless a
  table, label, or caption requires a different measure.
- Do not shrink body text below the selected kit's minimum to fit content. Cut
  copy, remove redundancy, change the composition, or split the page.
- Density comes from evidence and relationships, not repeated prose. Use text
  to state the proposition, label the evidence, and interpret the result.
- One page carries one principal claim or teaching goal. Several supporting
  regions are allowed; several unrelated conclusions are not.

## Density and rhythm

- Alternate text-driven, data-driven, and image/diagram-driven pages when the
  material allows it.
- No page composition repeats on consecutive pages. If two pages need the same
  underlying structure, change the proportion, reading direction, or emphasis.
- Keep page chrome stable and let the body canvas vary. Reuse alignment and
  motif grammar, not a complete page skeleton.
- Card grids are not a hierarchy system and must not become the default answer
  to complex content. Rectangular evidence regions are acceptable when each
  holds distinct, necessary material.
- Covers and closing pages should close the loop visually. Section openers may
  reuse the cover's composition, not its content.
- Agendas, section dividers, and progress pages are optional. Add them only
  when navigation is genuinely difficult or the selected kit calls for them.

## Evidence, charts, and tables

- Numbers with axes require a native chart; boxes and arrows use shapes. Never
  approximate a quantitative chart with rectangles.
- Give each chart one message. Annotate the decisive point and move secondary
  interpretations into the reading text or another page.
- Remove chart junk: default palette, 3-D, shadows, heavy grids, redundant
  legends, and decimal noise. Preserve units, baseline, source, uncertainty,
  and scientific encodings.
- Use one highlight series or callout and neutralize the rest. Do not recolor a
  scientific figure when its colors carry meaning.
- Tables favor fewer columns and meaningful rows. Align numbers right and keep
  decimal conventions consistent. Put the reading instruction beside the table
  or in a short strip.
- Academic and scientific tables normally use the three-line convention;
  executive tables may use a dark header with horizontal rules. Follow the
  selected kit rather than mixing table languages.
- Every figure/table gets a number, a caption stating content and condition,
  and a source. Never crop away axes, legends, units, panel labels, error bars,
  or significance marks.

## Color and motif discipline

- Write the full explicit token set into `deck.pptd`; never reference a theme
  preset by string or leave dangling tokens.
- White-on-primary contrast must be at least 4.5:1, body text on background at
  least 4.5:1, and large text at least 3:1. Check derived tints, not only the
  primary seed.
- Semantic colors stay semantic: green success, amber warning, red danger.
  Academic signal red is an explicit emphasis role, not permission for a
  multicolor page.
- Use one structural color family and one neutral family unless the selected
  theme defines a deliberate semantic exception. Do not collect accents.
- Choose at most one recurring motif element group: section index, exhibit
  number, step counter, corner brackets, caption mark, or running label. It may
  change state, but not become a different decorative device on each page.
- No decorative gradients, soft shadows, glow, generic color-bar motifs,
  watermark emblems, or filler icons.

## Anti-homogenization

The failure mode is a deck that looks generated: every page a title plus three
boxes, a gradient cover, the same decorative underline, and the same default
blue. Defend against it structurally:

1. Build page order from the argument, not from a template.
2. Choose a layout grammar because it fits the content; vary the composition
   between consecutive pages.
3. Let content choose form: series → chart; options → matrix; steps → sequence;
   one conclusion → statement; evidence → figure + reading; related tasks →
   linked modules or a spine.
4. Treat proportional layout descriptions as adaptable guidance, never as YAML
   to copy or as a fixed deck to assemble.
5. Keep one motif and change its state; do not add new decoration per page.
6. Before delivery, flip through titles only: they should read as the argument.
   Then inspect thumbnails: no two pages should be mistakable for each other
   except intentional motif repeats.

## Decision paragraph

Before generating, write one short paragraph naming the system, kit, palette
variant, light mode, font pairing, type-scale anchors, density, signature motif,
layout direction, and image policy (none / evidence only / generated expression
with consent). This paragraph is the visual contract for the deck.
