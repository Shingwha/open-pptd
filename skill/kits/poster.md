# Kit · poster

**System:** `editorial` (see `../references/design.md`) — the single-page
variant, not a deck style.
**Theme and layout:** `../references/themes.md` → Poster.
**Audience:** conference, exhibition, and open-day visitors reading from 1–2 m
for 20–90 seconds before deciding whether to stop, ask, or scan.
**Reader task:** get one claim, one piece of evidence, and one reason to talk to
the author — then find the paper or contact.
**Deliverable:** exactly one page, not a deck squeezed onto one slide or a 16:9
slide stretched to portrait.

## Narrative (reading order on the page)

```
title/authors → one-sentence claim → abstract → method and data →
results (main evidence) → conclusion → references + QR
```

Visitors read in a Z pattern: title, top-left block, main figure, bottom band.
Put the claim where the eye lands first; never lead with institutional logos.
Use the zone proportions and alternatives in `themes.md` while preserving one
continuous reading path.

## Canvas and safe area

- A-series portrait ratio 1:√2. In PPTD write page size explicitly, for example
  `size: [1191, 1684]` (A2 at 72 dpi) or `[1684, 1191]` for landscape. A0/A1 use
  the same ratio at 2× / 1.41×.
- **Never** `size: [960, 540]`. If the venue supplies a template or size, follow
  it and rebuild the zones; do not rescale a deck.
- Safe margin is at least 6% of the short side (72 px on the A2 page above) on
  every edge. Only background reaches trim; title, QR, and conclusion stay at
  least 80 px inside it.
- Column count follows content: one for statement-led, two for method/result
  pairs, three only for a wide results wall. Gutter ≥32 px.

## Content contracts and density

- **Title:** claim or precise question, two lines maximum; authors, presenting
  author, affiliation/contact, and accurate venue/poster number. Logos are one
  small strip and never larger than authors.
- **Abstract:** 100–180 words in three to five sentences: problem, approach with
  sample/scale, claim with key number, optional implication. No citation wall or
  copied paper abstract; numbers match results exactly.
- **Method/data:** state n, unit of analysis, period, setting, real instrument /
  version, procedure, comparison, and analysis. Keep at most three blocks and six
  short lines; detailed protocol belongs behind the QR link.
- **Results:** one main complete figure carries the result. Repeat two or three
  decisive numbers with unit and n in a rail, plus a short reading. A compact
  table is allowed only when categorical comparison is clearer than a figure.
- **Conclusion:** at most three bullets answering the title, effect size and
  condition, plus one quotable takeaway. Repeat only evidence already shown;
  observational `associated with` does not become causal `reduced`.
- **References/QR:** 5–8 real references in one style, with DOI/stable URL where
  useful. QR is at least 140 px at A2 (200 px preferred), labelled with what it
  opens, and accompanied by a short text link when possible.
- Use three to five evidence blocks on the whole poster. Cut content rather than
  shrinking type below the A2/A1/A0 sizes in `themes.md`.

## Evidence rules

- The main figure is original, complete, and legible at print size. Axes, units,
  n, error bars, and significance marks stay visible and explained.
- Every figure/table gets number, caption, condition, and source. Re-plotted data
  is marked `Redrawn from <source>` and verified against the source.
- Key numbers in abstract, results, and conclusion match exactly in unit,
  rounding, n, and preliminary/final status.
- QR points to a stable DOI, repository, or PDF and is tested on a phone before
  printing. A placeholder says `QR placeholder — replace with the real code` and
  never looks scannable.
- Author photos, logos, and institutional marks come from the user or official
  source. No stock imagery, generated evidence, or fake references.

## Do

- Put claim, main figure, and takeaway in one vertical reading path.
- Leave real whitespace between blocks; a poster is read in blocks, not lines.
- Repeat one motif with state changes only.
- Put references and QR where the reader already is, at reading height.

## Don't

- Don't paste a slide deck onto one page or keep slide footers, page numbers, and
  transition furniture.
- Don't use continuous-text columns, card grids, drop shadows, or gradients.
- Don't add an agenda, bare `thank you`, unlabeled QR, or second competing figure.
- Don't stretch or squash a 16:9 composition to fill the canvas.

## Anti-homogenization

- Choose figure-led, method-led, or statement-led zones from the content. Keep
  one claim, one main figure, and one takeaway band.
- A second competing figure means two stories: cut one rather than adding a
  column. The motif repeats; the composition does not repeat inside the page.
- Adapt the zone grammars in `themes.md`; never treat one zone map as a finished
  poster or reuse it unchanged for another project.
