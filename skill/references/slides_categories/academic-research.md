# Academic Research — 科研答辩蓝

**Audience:** thesis or project committee, advisor, reviewers, and conference
attendees. **Reader task:** judge the problem, method, evidence, and contribution,
and decide whether the work is credible and worth continuing.

The default visual direction is **科研答辩蓝**: a structured, high-density
research-defense system with stable section navigation, a top-line proposition,
two to four evidence regions, and a concise takeaway. It is not a dark-tech or
business-consulting skin.

## Narrative

For a research defense or paper report:

```text
context → gap → question/hypothesis → method → evidence → interpretation →
limitations → contribution → references (+ backup)
```

For a project proposal or research-program defense:

```text
rationale/significance → objectives/questions → task decomposition →
technical route/method → research foundation/progress → plan → expected outcomes
```

Choose the narrative that fits the material; do not concatenate both into a
generic deck. The first minute must make the problem and claim clear. A contents
page or section divider is useful only when a long defense needs navigation;
a progress marker is usually better on short decks.

## Core page types

| Page | Job |
|---|---|
| Title | Title, authors, affiliation, venue/date, and one visual anchor. |
| Contents | Four to six section rows with aligned page numbers when navigation is needed. |
| Background / gap | What is known or demanded, what is missing, and why it matters. |
| Research question / objective | Exact question, hypothesis, objective, scope, and success criterion. |
| Task decomposition | Tasks, relationships, integration, and overall aim for multi-part work. |
| Method / technical route | Data/sample, instrument, procedure, analysis, and validation. |
| Research foundation / progress | Prior projects, platforms, preliminary results, current state, and support. |
| Results — figure | Main complete evidence figure with its interpretation. |
| Results — table | Comparison or statistics table with a three-line style and reading. |
| Discussion / limitations | Interpretation, alternatives, threats to validity, and bias direction. |
| Conclusion / contribution | Answer, contribution, next step, or expected outcome. |
| References | Real cited works in one consistent, readable style. |

Optional related work when the gap needs positioning, research plan and expected
outcomes for proposals, data availability, and appendix/backup for robustness or
derivations. Optional pages are content-driven.

## Content contracts

- **Title:** state a precise claim, question, or project identity; keep the
  author/affiliation block together.
- **Background / gap:** distinguish established evidence from missing knowledge
  or unmet technical need. Name consequence and scope; cited claims match the
  references page.
- **Question / objective:** define what counts as an answer or success. For
  confirmatory work, state the hypothesis and what could falsify it. For a
  proposal, make expected outcomes observable rather than aspirational.
- **Task decomposition:** each task has a distinct role and explicit relation to
  the overall aim. Show integration and validation; never present a list of
  unrelated work packages as research logic.
- **Method / route:** state n and unit of analysis where applicable, selection
  or data source, setting/period, instruments, measures, comparison baseline,
  analysis, and assumptions. Name software/version when it affects reproduction.
- **Foundation / progress / plan:** identify real projects, platforms, results,
  dates, and owners. Never present planned work as completed evidence.
- **Results figure:** keep the original complete figure with axes, legends,
  units, error bars, significance marks, and subpanel labels. State effect size,
  comparison, condition, n, and one caveat beside it.
- **Results table:** keep the full comparison on one page, align numbers on the
  decimal, state units and significance conventions, and highlight only the row
  or column carrying the argument.
- **Discussion:** connect each alternative explanation to a specific result and
  state how each limitation could bias the claim. Limitations receive the same
  attention as contributions.
- **Conclusion:** answer the exact question/objective and point back to figure,
  table, or section evidence. Introduce no new result or citation.
- **References:** use one citation style and exact author/year/title data. Every
  in-text marker resolves to a real, checked entry; DOI/URL stays where useful.

## Evidence rules

- Original figures and tables first. Re-plot only with real extracted data and
  mark `Redrawn from <source>`; verify values against the source.
- Every figure/table has a number, a caption stating what and under which
  condition, and a source with authors, year, and figure/table number.
- Method diagrams and experimental photos are evidence; never generate them.
  Equipment photos keep model/setting and credit.
- No stock imagery and no generated imagery by default. Institutional marks come
  from the user or an official source; no decorative watermark or invented logo.
- A claim never exceeds its evidence. State sample, baseline, effect size,
  uncertainty, and limitations when relevant.
- Missing evidence remains an explicit placeholder; never invent a citation,
  policy target, project, platform, result, or expected quantitative outcome.

## Visual system — 科研答辩蓝

### Palette

Use this as the default seed and write the complete token set into `deck.pptd`.
A real institution, user template, or scientific encoding may override it.

| Token | Value | Role |
|---|---|---|
| `primary` | `#1D4E89` | Section titles, module headers, primary series, takeaway band |
| `accent` | `#C00000` | Signal red for one keyword, decisive value, or highlighted series |
| `bg` | `#F5F7FA` | Cool light page field |
| `text` | `#182230` | Main reading text |
| `muted` | `#667085` | Captions, metadata, secondary labels |
| `line` | `#D8E0E8` | Hairlines and region boundaries |
| `success` | `#2F6B57` | Success only |
| `warning` | `#B4872D` | Warning only |
| `danger` | `#BE392D` | Error/danger only, distinct from ordinary emphasis |
| `primarySoft` | `#EAF1F8` | Light evidence regions and zebra support |
| `primaryTint` | `#C7D8EA` | Stronger light-blue boundaries and selected regions |
| `primaryDeep` | `#0D2F55` | Cover, contents field, or deep conclusion field |
| `accent3` | `#4C83B5` | Chart slot 3 |
| `accent4` | `#86A9C8` | Chart slot 4 |
| `accent5` | `#31587A` | Chart slot 5 |
| `accent6` | `#B8CDDE` | Chart slot 6 |

Primary blue carries structure. Signal red is an emphasis role, not a second
decorative palette: never use it for headers, large fields, ordinary bullets, or
multiple competing annotations. Charts use the primary ladder and neutral grays
by default. Keep scientific color encodings unchanged.

### Typography and density

- Chinese default: `MiSans` for titles, section numbers, and key numbers;
  `Microsoft YaHei` for body, labels, captions, and sources.
- English-first decks may use `Quattrocento Sans` for Latin display/body with
  `Microsoft YaHei` for CJK. Never introduce a third family for equations.
- Cover title 44–56px; page title 28–32px; section label 11–13px; body 15–18px;
  module label 13–16px; annotation 12–14px; caption/source 9–11px; key number
  36–56px.
- Use line height 1.25–1.45. Body below 15px is a defect; cut copy, simplify a
  region, or split the page instead of shrinking it.
- A content page normally carries one proposition, two to four information or
  evidence regions, and one takeaway. High density means layered evidence, not
  several unrelated conclusions or a wall of small text.

### Fixed page chrome

The recurring motif is an **overlapping double-circle + section index + title**
group, not a decorative stripe:

- Header: double-circle mark, section index such as `2.1`, specific claim/task
  title, and one thin horizontal rule. The top-right is reserved for a real
  user-supplied institutional mark or a short running label; never invent one.
- Proposition: on background, proposal, and method pages, use a compact module
  label plus one or two sentences immediately below the header. Ring bullets may
  mark two linked lines. Signal red marks only the words carrying the proposition.
- Takeaway: a full-width primary or primaryDeep band may close an argument page
  with one sentence. Omit it when the figure caption/source needs the space or
  the page already ends in a decisive statement.
- Sources: keep a stable source/page-number baseline. The takeaway band is not a
  substitute for a source line.

Use rectangular evidence regions, small primary module headers, hairlines, and
explicit connectors. Do not turn them into rounded cards, decorative arrows, or
colored headers without content.

## Layout grammars

These are proportional composition patterns, not a fixed page sequence. On a
960×540 slide, start with 48–64px outer margins and align all regions to one grid.

### Cover and contents

- **Cover:** title and author block occupy 60–68% on the left; a solid primary
  field or one real research image occupies the right. Alternatively use a
  full-width title over a quiet primary field with one small figure detail.
  Keep one visual anchor and no watermark.
- **Contents:** a primaryDeep field covers the left 28–34%, with `目录` and
  `CONTENTS` stacked inside; the right holds 4–6 full-width section rows with
  aligned page numbers and hairline separators. Keep this field in the same blue
  family as the rest of the deck. Do not introduce a second green theme.
- **Closing:** return to the cover composition with the answer or contribution
  in place of the title; do not use a bare `Thank you` page.

### Argument and proposal pages

- **Background / gap:** reserve 10–12% for header, 14–18% for core proposition,
  54–62% for evidence, and 9–12% for takeaway when used. Within evidence, use a
  38%/62% policy-versus-platform split, two equal evidence columns, or
  known/unknown rows. Each region must contain real evidence or a specific claim.
- **Research question:** one large question with a narrow scope/definition band;
  or question left and hypothesis/falsification right. Map each hypothesis to
  the figure/table that will answer it.
- **Task decomposition:** place the overall aim in a narrow top band. Use a
  horizontal two-stage flow, a 2×2 task matrix with explicit connectors, or left
  task modules feeding a right mechanism/validation column. Mark the integrating
  task and keep one reading direction.
- **Technical route:** after header and proposition, use a 28% / 8% / 52%
  left-center-right body. Left holds research tasks, center holds a vertical
  phase/support spine, and right holds methods and validation. Align corresponding
  nodes by level. The spine carries relationships only, not paragraphs.
- **Research foundation:** use a 34%/62% split with one prior project or policy
  document left and two stacked platform/preliminary-result regions right, or
  three unequal columns when each has comparable evidence. Captions name the
  platform, project, or result; photographs and screenshots need sources.
- **Plan / expected outcomes:** absolute-stage roadmap with observable outputs,
  or objective → task → evidence mapping. Expected outcomes stay visibly separate
  from completed results.

### Evidence and conclusion pages

- **Model / method comparison:** use 45–50% for a model or experimental diagram
  and 45–50% for two method columns or an instrument/measure table. Put the shared
  objective above both and applicable range/limitation below. For a purely
  sequential procedure, use one horizontal 4–6 stage flow instead.
- **Results — dominant figure:** the complete figure occupies 55–75% of content,
  with a 2–4 line reading column or strip. Alternate figure-left and figure-right
  across comparable result pages; use full width for dense multi-panel figures.
  Never shrink or crop a figure to preserve a takeaway band.
- **Results — three-line table:** use a full-width table with a reading strip,
  or a 65%/30% table/interpretation split. Keep 3–6 columns and 4–8 rows where
  possible, align numbers on the decimal, and highlight one row or column.
  No vertical rules or spreadsheet-style cell fills.
- **Discussion / limitations:** choose three stacked bands for interpretation,
  support, and rival explanation, or a two-column supported/not-settled ledger.
  Give limitations the same visual weight as contribution and state bias direction.
- **Conclusion / contribution:** close with 2–4 numbered answers and evidence
  pointers, or return to the cover with the answer. Do not introduce new numbers.
- **References:** one column for 8–12 entries and two for 12–20. Never shrink
  below 11px to fit more.

## Anti-homogenization

- Page order follows the argument, not the table above. Merge, reorder, or omit
  page types when content demands it.
- Use at least four different layout grammars in a deck of ten or more pages.
  No two consecutive pages share the same composition.
- Keep the header/source grammar stable while varying the evidence canvas.
  Alternate figure-led, table-led, statement-led, and diagram/route-led pages.
- Make titles claims or precise questions, put interpretation beside evidence,
  and keep section, figure, table, and reference numbering consistent.
- Use a takeaway to state what the page's evidence establishes, not to repeat
  the title or introduce a new claim.

## Page map examples — not templates

```text
Research defense:
1 Title
2 Gap / why now
3 Research question
4 Method
5 Data and measures
6 Result 1 — main figure
7 Result 2 — table
8 Robustness / alternative explanation
9 Discussion + limitations
10 Conclusion / contribution
11 References
12 Backup
```

```text
Project proposal:
1 Title
2 Contents (only if navigation is needed)
3 Rationale and significance
4 Objectives and task decomposition
5 Technical route
6 Model / method and validation
7 Research foundation and preliminary work
8 Current progress
9 Research plan
10 Expected outcomes and contribution
11 References / backup
```
