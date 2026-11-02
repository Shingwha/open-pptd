# Kit · lecture

**System:** `instructional` (see `../references/design.md`).
**Theme and layout:** `../references/themes.md` → Lecture.
**Audience:** students, trainees, workshop participants, internal learners.
**Reader task:** understand one idea, see it done, try it, and remember it after
the session — not admire the slides.

## Narrative

```
cover → objective → concept → example → walkthrough → practice → summary
```

One idea per page. Each page answers a learner question in order: what will I be
able to do, what is the idea, what does it look like when done, how do I do it,
can I do it, what do I keep. Repeat the sequence per topic in a long lecture.

## Core page types

| Page | Job |
|---|---|
| Cover | Course, lecture question/promise, level/scope, instructor, session/date. |
| Objective | 2–4 observable outcomes, prior-knowledge link, and success check. |
| Concept | One idea sentence, one diagram, one key term, one misconception. |
| Example | A real worked case: original prompt, expert move/reason, result. |
| Walkthrough | 3–6 explicit steps with reasons, output, and current-step marker. |
| Practice | Solvable task with input/output, constraints, check, and separate hint. |
| Summary | Three takeaways mapped to objectives, one sentence to remember, next step. |

Optional: agenda only past ~45 minutes, a second example when the first is not
representative, or common errors when practice evidence shows a dominant error.

## Content contracts and density

- Objectives use observable verbs and conditions; the practice page must test
  what the objective promises. Never list more than four.
- A concept definition is one sentence. Diagrams use the same terminology as the
  example and need no more than three legend items.
- Examples preserve the original prompt and show 2–4 expert moves with reasons.
  More than four moves becomes two pages or a walkthrough.
- Walkthroughs contain 3–6 steps, only one expanded at a time. More than six
  steps splits into prepare/execute; fewer than three is an example instead.
- Practice states required output, time/tools/format constraints, and `you are
  right when…` criteria visible while working. Do not add an unrelated task.
- Summaries contain three takeaways and no new concept or result. Map deferred
  objectives honestly rather than implying all were mastered.
- Whitespace around the example is part of teaching. Split pages instead of
  shrinking type; follow the projection sizes in `themes.md`.

## Evidence rules

- Examples come from real material (textbook, dataset, product, code, case) and
  carry a source. Simplified examples and values are labelled `simplified`.
- Numbers keep units, sample, and condition; worked calculations show
  intermediate values and rounding, not only the answer.
- Command lines, APIs, outputs, tool versions, and environments are copied
  exactly. Real software screenshots are not replaced with mockups.
- Practice uses the same real dataset/case as the example so the learner can
  transfer. An answer key is allowed; a fabricated `typical student answer` is
  not.
- Explanatory diagrams may be redrawn and labelled. Photographs of equipment or
  specimens are evidence and must not be generated.

## Do

- Show the expert move and why it beats the naive move.
- Mark the current step consistently, for example `STEP 3 / 6`.
- Keep hints separate from answers and success checks next to the task.
- End with one sentence the learner can repeat tomorrow and a concrete next step.

## Don't

- Don't fill a page with a syllabus table or bulleted chapter summary.
- Don't use gamified clutter, badges, emoji bullets, or decorative mascots.
- Don't turn practice into a second lecture or hide its success criteria.
- Don't use gradients, card grids, or a decorative color bar under the title.

## Anti-homogenization

- Merge objective into cover or split walkthrough when the teaching logic needs
  it; the narrative is not a fixed template.
- Use at least three layout grammars in a session deck. Alternate statement,
  numbered steps, worked example, and task + check.
- No two consecutive pages share a composition. Vary the rhythm:
  explain → show → do → recap; never run three text pages in a row.
- Adapt the proportional layout directions in `themes.md`; do not reuse a fixed
  page merely by replacing its text.

## Page map example (not a template)

```text
1 Cover — the question this lecture answers
2 Objective — 3 things you can do afterwards
3 Concept — one idea, one diagram
4 Example — a real worked case
5 Walkthrough — 4 steps, current step marked
6 Practice — task + check + hint
7 Summary — 3 takeaways + exit ticket
```
