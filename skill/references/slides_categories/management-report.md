# Management Reporting

**Audience:** managers, board, operating team, and cross-functional stakeholders.
**Reader task:** grasp how the period went, why, what is at risk, and who does
what next. **Default style:** `consulting-classic` in `../design.md`.

## Narrative

```text
cover/KPI → executive summary → trend and drivers → segment performance →
risks → actions/owners/dates → appendix and sources
```

The titles alone must tell the story. Put the most important status line on the
cover; do not open with an agenda.

## Page types

| Page | Job |
|---|---|
| Cover / KPI | Period, headline status, 3–4 KPI callouts, one-line verdict. |
| Executive summary | 3–4 findings with evidence pointers and the decision needed. |
| Trend / drivers | Main time series and the 2–3 drivers that explain it. |
| Segment | Unit, region, or product split compared with target/prior. |
| Risks | Threats to plan, observable trigger, mitigation, and one owner. |
| Actions | Action, owner, absolute due date, status, and measure of done. |
| Appendix / sources | KPI formulas, source systems, restatements, and backup exhibits. |

Optional section divider for a long report, `what changed since last review`,
or customer/ops detail when it drives a decision.

## Evidence and content contracts

- Every number has a period, unit, and source. Internal data is labelled
  `company data`; external data gets a report name and date.
- Show target or prior period alongside actuals. Keep the measurement basis
  visible: gross/net, booked/recognized, actual/forecast.
- KPI definitions stay identical across pages. Restatements name old/new values,
  affected period, source system, and owner in the appendix.
- Forecasts show assumptions and use line style as well as text to distinguish
  them from actuals.
- Segment values reconcile to the total, including unallocated/other. Segment
  order and definitions stay consistent.
- Risks are assumptions or judgements unless a sourced model says otherwise;
  never fabricate probability. Actions depending on forecasts state the basis.
- Never invent a market size, benchmark, customer quote, owner, or due date.
- Close with the decision or resource needed, not a summary of the deck.

## Layout recipes

- **Cover / KPI:** hairline-separated row of 3–4 KPIs; one 96–140px hero number
  with secondary KPIs below; or left verdict/right status list. Every KPI shows
  period, unit, and target/prior.
- **Executive summary:** full-width finding rows plus one evidence strip, or
  left findings/right decision-and-KPI split. Put the ask in its own bottom band.
- **Trend / drivers:** chart 55–65% with a driver column, or full-width time
  series with a narrow driver strip. Small multiples use shared scales and 2–3
  panels; annotate only the inflection supporting the title.
- **Segment:** grouped bars plus notes, actual/target/variance table, or 3–4
  shared-scale small multiples. Do not duplicate the same data as chart and table.
- **Risks:** 4–6 row risk/trigger/mitigation/owner table, or likelihood × impact
  matrix with a narrow mitigation column. Never use both on one page.
- **Actions:** 3–6 row action/owner/date/status/measure table, timeline when
  sequence matters, or three large commitment rows.
- **Appendix:** KPI definitions, matching sources, or one large backup exhibit.

Keep stable title/evidence/source/page-number axes while varying chart-led,
table-led, matrix-led, and commitment-led bodies.

## Palette, typography, and density

| Direction | primary | accent | Use |
|---|---|---|---|
| Off-white & Ink Green | `#123B2F` | `#B08D3E` | Formal operations and finance |
| White & Graphite | `#2B2D42` | `#4C7A5A` | Neutral, data-heavy reviews |
| Steel & Signal | `#1F3240` | `#F0A202` | Manufacturing and supply chain |

The signal color marks exceptions or one series only. Chinese default: `MiSans`
titles + `Microsoft YaHei` body. Alternative: `LXGW Neo XiHei` body/titles +
`Alimama ShuHeiTi` numbers/labels.

Cover 40–52px; conclusion title 28–34px; body 14–17px; table cell 12–14px;
section/KPI label 11–13px; source 9–11px; KPI number 40–64px. Body pages are
dense with evidence; covers and closing actions may breathe.

Keep at most four KPIs, four summary findings, three principal drivers, six
risks, and six actions on their respective pages. Split or cut beyond that.

## Anti-homogenization and QA

- Drop empty sections and split the section carrying the decision.
- No two consecutive pages share a composition. Use at least four layout
  grammars in a ten-page deck and never run three KPI pages in a row.
- Put the `so what` beside the chart, not in a paragraph below it.
- Do not use section labels as titles, hide a miss in a footnote, or use an
  agenda unless navigation genuinely needs it.
