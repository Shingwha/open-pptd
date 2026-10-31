# Quality: evidence, sources, and pre-delivery checks

Quality failures in generated decks are rarely visual. They are missing
sources, invented numbers, ambiguous units, captions that describe nothing,
and placeholders that survive into delivery. This file is the gate.

## Evidence rules

1. **Never fabricate.** No invented data, citations, customer names, quotes,
   experimental results, benchmarks, logos, or source titles. If material is
   missing, write a visible placeholder or ask; do not fill the gap with a
   plausible number.
2. **One claim, one basis.** Every external fact on a page has a source and a
   period (year, quarter, date range) or an explicit "author's analysis".
3. **Keep the baseline.** If the source compares two periods, two groups, or
   two conditions, carry the comparison into the deck. A growth rate without
   its base is misleading.
4. **Do not round away meaning.** Preserve significant digits and the source's
   own units. If you convert units, say so.
5. **Distinguish types of statement.** Observed result, model estimate, and
   opinion must be visibly different. Do not present a projection as a result.
6. **Quotes are verbatim.** If a quote is translated or condensed, mark it.
   Keep speaker, date, and place for interviews.
7. **No uncited images.** A figure, photo, map, or archival scan carries a
   credit and permission status; see `images.md`.

## Source lines

- A source line sits at the bottom of the page or directly under the object it
  supports. It is 9–11 px, muted, and does not compete with the content.
- Format: `Source: <publisher/report>, <period>; <measurement basis>.`
  Add a URL as a hyperlink when the deck is delivered digitally; keep the
  visible label short.
- Multiple sources: separate with `;`, keep order matching the page.
- Author's calculation: `Source: <data source>; author's calculation.`
- If the data is from the user, say so (`Source: client data, FY2024`) rather
  than inventing a public citation.
- A chart's source goes below the chart; a table's source goes below the table;
  a figure's number, caption, and source go below the figure.

## Units and numbers

- State units on axis titles, column headers, or callout labels — not only in
  the body text. Currency needs its unit and scale (`USD m`, `CNY 100m`).
- Keep one unit system per page. Do not mix percent and percentage points.
- Align decimals and use thousands separators for large numbers.
- Round consistently across a series; do not show `12.43`, `12.4`, `12`.
- Percentages sum to 100 only when the category set is exhaustive; otherwise
  say "share of total shown".

## Captions

Every figure and table gets:

1. a number (`Figure 2`, `Table 1`) when more than one appears;
2. a caption that states **what is shown and under what condition**;
3. the source and period line.

The caption is not a title repetition and not an interpretation. Interpretation
belongs in a short reading next to the object.

## Placeholders

Placeholders are allowed only when the material genuinely does not exist yet.
They must be obvious and honest:

- text: `[Data to be supplied: FY2024 churn by region]` — not a fake number or
  an empty chart;
- image slot: a defined frame with `[Figure pending: ...]` and a source line
  saying it is pending;
- never ship a placeholder that looks like a result. Never use lorem ipsum.

Tell the user in the delivery message which placeholders remain.

## Academic checklist

- [ ] Research question and gap are explicit, not implied by the title.
- [ ] Method states sample, instrument/data, and analysis; limitations are
      visible, not buried.
- [ ] Every figure/table is complete (axes, legend, units, error bars,
      significance marks) and carries number/caption/source.
- [ ] Original figures were not redrawn unless the data was re-plotted and the
      caption says "redrawn from [source]".
- [ ] Results are distinguishable from interpretation; claims do not exceed
      the evidence.
- [ ] References follow one citation style; in-text markers match the list.
- [ ] No generated or stock imagery stands in for evidence.

## Business / consulting checklist

- [ ] Every page title is a conclusion with a subject, a verb, and a number
      where the data allows.
- [ ] Each conclusion is supported on the same page by evidence, not by a
      promise on the next page.
- [ ] Every chart/table has a source line and a stated period; baselines and
      comparison groups are present.
- [ ] KPI definitions match across pages; no metric changes definition silently.
- [ ] Risks have owner, trigger, and mitigation; actions have owner and date.
- [ ] Forecasts and estimates are labelled; no synthetic precision.
- [ ] No emotion-curve narrative, decorative SmartArt, or unsourced market size.

## Pre-export checklist

- [ ] `open-pptd check` returns 0 errors. Warnings are understood and either
      fixed or explained (geometry, contrast, font fallback).
- [ ] Every page listed in the manifest exists; no orphan pages remain.
- [ ] All `$tokens` and `$styles` resolve; theme has the full color set.
- [ ] Font families are registered names, ≤2 families, and actually used.
- [ ] Media paths stay inside the project; formats are png/jpg/gif; evidence
      images are `fit: contain` and uncropped.
- [ ] Titles read as an argument when read alone.
- [ ] No two consecutive pages share the same composition.
- [ ] No card grid, gradient decoration, decorative underline, or color-bar
      motif slipped in.
- [ ] Placeholders, if any, are listed for the user.
- [ ] Speaker notes exist only if the user opted in.

## Delivery message

Report: the project and PPTX paths, page count, theme direction, font
embedding result (`embedded` / `skipped` / `missing`), any remaining warnings
worth knowing, placeholder list, and preview status (URL + stop/restart
command). Do not claim PowerPoint/WPS playback compatibility from a successful
build alone.
