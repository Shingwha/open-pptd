# Kit · academic

**System:** `academic` (see `../references/design.md`).
**Theme and layout:** `../references/themes.md` → Academic.
**Audience:** thesis or project committee, advisor, reviewers, conference audience.
**Reader task:** judge the problem, method, evidence, and contribution — and
 decide whether the work is credible and worth continuing.

## Narrative

For a research defense or paper report:

```
context → gap → question/hypothesis → method → evidence → interpretation →
limitations → contribution → references (+ backup)
```

For a project proposal or research-program defense:

```
rationale/significance → objectives/questions → task decomposition →
technical route/method → research foundation/progress → plan → expected outcomes
```

Choose the narrative that fits the material; do not concatenate both into a
generic deck. The first minute must make the problem and claim clear. The body
must let a skeptical reader verify the claim without asking. A contents page or
section divider is useful only when a long defense needs navigation; a progress
marker is usually better on short decks.

## Core page types

| Page | Job |
|---|---|
| Title | Title, authors, affiliation, venue/date; one visual anchor. |
| Background / gap | What is known or demanded, what is missing, and why it matters. |
| Research question / objective | The exact question, hypothesis, or objective; scope and definitions. |
| Task decomposition | For multi-part work: tasks, relationships, integration, and overall aim. |
| Method / technical route | Data/sample, instrument, procedure, analysis, and validation; enough to reproduce. |
| Research foundation / progress | Prior projects, platforms, preliminary results, current state, and credible support. |
| Results — figure | The main evidence figure, complete and legible, with its interpretation. |
| Results — table | The comparison or statistics table, three-line style, with its reading. |
| Discussion / limitations | Interpretation, alternative explanations, threats to validity, and bias direction. |
| Conclusion / contribution | Answer the question; state the contribution, next step, or expected outcome. |
| References | Cited works in one style, readable and checkable. |

Optional: related work when the gap needs positioning, research plan and
expected outcomes for proposals, data availability, and appendix/backup for
robustness or derivations. Optional pages are content-driven.

## Content contracts

- **Title:** state a precise claim, question, or project identity; keep the
  author/affiliation block together.
- **Background / gap:** distinguish established evidence from the missing
  knowledge or unmet technical need. Name the consequence and scope; cited
  claims match the references page.
- **Question / objective:** define what would count as an answer or success.
  For confirmatory work, state the hypothesis and what could falsify it. For a
  proposal, make expected outcomes observable rather than aspirational.
- **Task decomposition:** each task has a distinct role and explicit relation
  to the overall aim. Show integration and validation; do not present a list of
  unrelated work packages as a research logic.
- **Method / route:** state n and unit of analysis where applicable, selection
  or data source, setting/period, instruments, measures, comparison baseline,
  analysis, and assumptions. Name software/version when it affects reproduction.
- **Foundation / progress / plan:** identify real projects, platforms, results,
  dates, and owners. Plans use concrete stages and expected outputs; never
  present planned work as completed evidence.
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
- Method diagrams and experimental photos are evidence — never generate them.
  Equipment photos keep model/setting and credit.
- No stock imagery and no generated imagery by default. Institutional marks
  come from the user or an official source; no decorative watermark.
- A claim never exceeds its evidence. State sample, baseline, effect size,
  uncertainty, and limitations when relevant.
- Missing evidence remains an explicit placeholder; never invent a citation,
  policy target, project, platform, result, or expected quantitative outcome.

## Do

- Make titles claims or precise questions, not bare topic labels.
- Put interpretation next to the evidence, not several pages later.
- Keep section, figure, table, and reference numbering consistent.
- Use a takeaway to state what the page's evidence establishes, not to repeat
  the title or introduce a new claim.
- Keep one principal conclusion per page, supported by two to four regions when
  the material benefits from high density.

## Don't

- Don't use decorative card grids, gradients, soft shadows, filler icons, or
  colored headers without informational purpose.
- Don't recolor scientific figures when color carries meaning.
- Don't center body text or shrink it below the theme's minimum to fit more.
- Don't paste an appendix-sized protocol, a spreadsheet, or a full paper
  abstract onto one page.
- Don't add a bare `Thank you` page; close with the answer, contribution, or
  expected outcome.

## Anti-homogenization

- Page order follows the argument, not the table above. Merge, reorder, or omit
  page types when the content demands it.
- Use at least four different layout grammars in a deck of ten or more pages.
  No two consecutive pages share the same composition.
- Keep the header/source grammar stable while varying the evidence canvas.
  Alternate figure-led, table-led, statement-led, and diagram/route-led pages.
- The Academic section of `themes.md` provides proportional layout guidance,
  including complex task-decomposition and central-spine routes. Adapt it to
  the content; never assemble a fixed deck from it.

## Page map examples (not templates)

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
