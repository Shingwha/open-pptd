# Kit · poster

**System:** `editorial` (see `../../references/design.md` §3) — the single-page
variant, not a deck style.

**Audience:** conference visitors, exhibition and open-day visitors, reviewers
walking a poster hall. They read from 1–2 m, in 20–90 seconds, and decide
whether to stop, ask, or scan the code.

**Reader task:** get one claim, one piece of evidence, and one reason to talk to
the author — then find the paper or contact.

**Deliverable:** exactly one page. A poster is not a deck with the pages squeezed
onto one slide and it is not a 16:9 slide stretched to portrait.

## Narrative (reading order on the page)

```
title/authors → one-sentence claim → abstract → method and data →
results (main evidence) → conclusion → references + QR
```

Visitors read in a Z pattern: title, then the top-left block, then the figure,
then the bottom band. Put the claim where the eye lands first; never lead with
institutional logos.

## Canvas and safe area

- A-series portrait ratio 1:√2. In PPTD write the page size explicitly, for
  example `size: [1191, 1684]` (A2 at 72 dpi) or `[1684, 1191]` for a landscape
  board. A0/A1 use the same ratio at 2× / 1.41× these numbers.
- **Never** `size: [960, 540]`. A 16:9 slide stretched into a poster distorts
  type and leaves a dead vertical band. If the venue supplies a template or a
  size, follow the venue — then restate the layout, do not rescale a deck.
- Safe margin: at least 6% of the short side (72 px on the A2 page above) on
  every edge; nothing but the background reaches the trim. Keep title, QR, and
  the conclusion ≥ 80 px inside the trim.
- Column count follows the content: one column for a statement-led poster, two
  for method/result pairs, three only for a wide results wall. Gutter ≥ 32 px.

## Density and type (A2; scale ×1.41 for A1, ×2 for A0)

- Title 96–120 px (two lines maximum), authors 28–34, affiliation 22–26.
- Section heads 44–54; body 26–30; captions 20–22; references 18–20.
- Abstract 100–180 words. Three to five evidence blocks on the whole poster.
- Minimum body size is set by the reading distance, not by space left. If the
  content does not fit at 26 px, cut content — do not shrink type.

## Evidence rules

- One main figure carries the result: original, complete, legible at print
  size. Axes, units, n, and significance marks stay visible.
- Every figure/table gets a number, a caption, and a source. Re-plotted data is
  marked "redrawn from <source>".
- Key numbers are repeated once in the result block with unit and n; they must
  match the figure exactly.
- The QR code points at a stable DOI, repository, or PDF — never at a preview
  URL that expires. A placeholder QR is labelled "QR placeholder — replace with
  the real code"; never draw a fake scannable pattern.
- Author photos, logos, and institutional marks come from the user or the
  official source. No stock imagery, no generated evidence.

## Do

- Write the title as a claim or a precise question, not a topic label.
- Put the claim, the main figure, and the takeaway in one vertical reading path.
- Leave real white space between blocks; a poster is read in blocks, not lines.
- Repeat one motif (section number, hairline rule, or a fixed label rail) with
  state changes only.
- End with references and QR where the reader already is — bottom-right, at
  reading height.

## Don't

- Don't paste a slide deck onto one page; don't keep slide footers, page
  numbers, or transition furniture.
- Don't use three columns of continuous text, card grids, drop shadows, or
  gradients.
- Don't put the institutional logo above the title or make it larger than the
  authors.
- Don't set body text below 24 px at A2, or references below 16 px.
- Don't add an agenda, a "thank you" block, or a QR without a label.
- Don't stretch or squash a 16:9 composition to fill the canvas.

## Anti-homogenization

- Choose the zone layout from the content: figure-led, method-led, or
  statement-led. The recipes offer 2–3 variants each; pick one and keep the
  reading path consistent.
- One poster has one hierarchy: one claim, one main figure, one takeaway band.
  A second competing figure means the poster has two stories — cut one.
- The motif repeats; the composition does not repeat inside the page.
- `fragments/` are single-page geometry references. Adapt the zones; never
  reuse the fragment as a finished poster and never place two posters from this
  kit side by side without changing the variant.

## Zone map example (not a template)

```text
┌──────────────────────────────────────────────┐
│ venue line · title (2 lines) · authors        │  8–10%
├──────────────────────────────────────────────┤
│ claim / abstract (full width, 100–150 words) │  12–16%
├───────────────────────┬──────────────────────┤
│ method and data       │ key numbers / design │  20–24%
├───────────────────────┴──────────────────────┤
│ main figure (40–50% of the content area)     │  30–34%
├──────────────────────────────────────────────┤
│ conclusion (≤3 bullets)                      │  8–10%
├──────────────────────────────────────────────┤
│ references (5–8)                  │ QR + link │  rest
└──────────────────────────────────────────────┘
```
