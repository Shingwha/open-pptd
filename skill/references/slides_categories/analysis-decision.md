# Analysis & Decision

**Audience:** decision makers and clients who must choose and fund a direction.
**Reader task:** accept the diagnosis, compare real options, and commit to a
recommendation. **Default style:** `consulting-classic` in `../design.md`.

## Narrative

```text
problem → conclusion (answer first) → issue tree → evidence → options matrix →
recommendation → roadmap and risks → appendix
```

The answer arrives early. The remainder proves it and shows how to execute.
This is an argument with exhibits, not a tour of work performed.

## Page types and reader tasks

| Page | Job |
|---|---|
| Problem | Decision at stake, scope, constraints, criteria, owner, and timing. |
| Conclusion | Recommendation in one sentence, evidence-linked reasons, condition, and ask. |
| Issue tree | MECE decomposition showing how the answer was reached. |
| Evidence | Exhibits that decide the case, each with a decision reading. |
| Options matrix | Options × explicit criteria, with recommendation and trade-offs. |
| Recommendation | Choice, rationale, cost, risks, conditions, and kill criteria. |
| Roadmap / risks | Phases, owners, milestones, dependencies, gates, and stop conditions. |

Optional market/context, financial summary, governance, and appendix exhibits.
Move supporting detail to the appendix; keep the body on the decision.

## Content contracts

- One page carries one principal reasoning object or exhibit and one reading.
- Problem pages state at most three situation facts and explicit decision
  criteria. Agree on the question before recommending.
- Answer pages normally use three evidence-linked reasons; conditions and asks
  are not additional reasons.
- Issue trees use 3–4 MECE branches and 2–3 short leaves per branch. Mark the
  decisive branch and evidence status with labels, not color alone.
- Options matrices use 3–4 real options and 4–6 independent criteria. Weighted
  scores require agreed, defensible weights and a stated derivation.
- Recommendations include cost/resources, strongest counter-case, risk owner,
  trigger, and stop condition. Roadmaps use absolute dates and measurable gates.
- Every exhibit answers an issue-tree question and displays source, period,
  units, definitions, and comparison basis.
- Options receive comparable evidence. Never tune weights after seeing results.
- Show the strongest reason against the recommendation and why it does or does
  not change the answer. Market sizes, benchmarks, and effort estimates are
  never invented; estimates state method and range.

## Layout recipes and variants

Choose the recipe from the reasoning task; do not assemble a fixed deck.

- **Problem:** three stacked situation–complication–question bands; a large
  decision question with a constraint side column; or an issue map when scope
  is contested.
- **Answer first:** recommendation across the top with three numbered reasons
  below; or answer left and options/verdicts right. Put condition and ask in a
  separate band, not as a fourth reason.
- **Issue tree:** root-left/branches-center/leaves-right for dense logic, or
  root-top/three-columns-below for projection. Use one 1–1.5px connector weight.
- **Evidence:** one chart/table occupies 55–75% with a 2–3 line decision reading
  beside it. Two panels are allowed only when they answer the same question.
- **Options matrix:** criteria as rows and 3–4 options as columns. Highlight the
  recommendation once and show the strongest counter-case fairly.
- **Recommendation:** decision memo with reasons/conditions; recommendation left
  and risk ledger right; or recommendation above and rejected options below.
- **Roadmap / risks:** horizontal phase axis with gates below, vertical milestone
  ladder, or timeline above and risk ledger below. Use absolute dates and one
  owner per phase.

## Palette, typography, and density

Current direction seeds, to be expanded into the full token set in `../design.md`:

| Direction | primary | accent | Character |
|---|---|---|---|
| Ink Green & Copper | `#1E3B33` | `#C15F3C` | Strategy, industrial, transformation |
| Slate & Signal | `#1F3240` | `#F0A202` | Operations, turnaround, exceptions |
| Ink & Celadon | `#101418` | `#3FA68C` | Digital, consumer, growth |

Avoid deep-navy-plus-gold unless it comes from the client's actual brand.
Chinese default: `MiSans` titles/numbers + `Microsoft YaHei` body. More
editorial: `Source Han Serif CN` titles + `MiSans` body.

Cover 40–52px; finding title 28–34px; exhibit title 16–20px; body 14–17px;
exhibit/table labels 10–14px; source 9–11px; key number 40–64px. Use one exhibit
number block, issue-tree branch header, or decision-status footer as the motif.

## Anti-homogenization and QA

- Page order follows logic, not a template. Some cases need two evidence pages
  and no issue tree; others need options before diagnosis.
- No two consecutive pages share a composition. Alternate exhibit-led,
  matrix-led, tree-led, and statement-led pages.
- Use at least four layout grammars in a ten-page deck and never run three
  matrices in a row.
- Read the titles alone: they should state the decision argument.
- Do not narrate the team's process, use decorative SmartArt, or end on a
  roadmap without restating the decision.
