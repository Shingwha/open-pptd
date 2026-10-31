# Kit · business-review

**System:** `executive` (see `../../references/design.md` §2).
**Audience:** managers, board, operating team, cross-functional stakeholders.
**Reader task:** grasp how the period went, why, what is at risk, and who does
what next — fast.

## Narrative

```
cover/KPI → executive summary → trend and drivers → segment performance →
risks → actions/owners/dates → appendix and sources
```

The titles alone must tell the story. A reader flipping only titles should
understand the period, the cause, and the ask. Put the single most important
status line on the cover; do not open with an agenda.

## Required pages

| Page | Job |
|---|---|
| Cover / KPI | Period, headline status, 3–4 KPI callouts, one-line verdict. |
| Executive summary | The period in one page: 3–4 findings, each with evidence, plus the decision needed. |
| Trend / drivers | The main time series and the 2–3 drivers that explain it. |
| Segment | Business unit, region, or product split; compare against target. |
| Risks | What threatens the plan, with owner, trigger, and mitigation. |
| Actions | Action, owner, due date, status; the close of the argument. |
| Appendix / sources | Definitions, cohort notes, source list, extra tables. |

Optional: a section divider only for a long deck; a "what changed since last
review" page if the audience met before; a customer/ops detail page when the
review is operational.

## Density and type

- Body 14–17 px; table cells 12–14 px; source 9–11 px; titles 28–34 px.
- High density on body pages: charts and tables are the body, text is the
  reading. Covers and the closing action page may breathe.
- Stable header/footer axes: title zone, evidence zone, source line, page
  number do not move between pages.

## Evidence rules

- Every number has a period, a unit, and a source. Internal data is labelled
  "company data"; external data gets a report name and date.
- Show the target or prior period alongside actuals. A number without a
  baseline is not a result.
- Keep the KPI definition identical across pages; put changed definitions in
  the appendix.
- Forecasts are labelled as forecasts, with the assumption stated.
- Never invent a market size, benchmark, or customer quote.

## Do

- Make titles conclusions with a subject, verb, and number.
- Put the "so what" in a column beside the chart, not a paragraph below it.
- Use one structural color and neutral grays; highlight one series/row.
- Give every risk an owner and a trigger; give every action a date.
- Close with the decision you need, not a summary of the deck.

## Don't

- Don't use section labels as titles ("Business Review", "Q2 Performance").
- Don't build card grids, use gradients/shadows, or decorate with icons.
- Don't narrate an emotion curve; this is a status review.
- Don't hide a miss in a footnote or change the metric definition silently.
- Don't use an agenda page unless the deck is long enough to need navigation.

## Anti-homogenization

- The page order is a default argument, not a template. Drop a section that has
  no content; split a section that carries the decision.
- No two consecutive pages share a composition. Alternate chart-led, table-led,
  and statement-led pages.
- Use at least four recipes in a deck of ten pages; never run three KPI pages
  in a row.
- `fragments/` are geometry references for a single page. Do not assemble them
  into a fixed deck and do not copy the kit wholesale.
