# Kit · lecture

**System:** `instructional` (see `../../references/design.md` §4).
**Audience:** students, trainees, workshop participants, internal learners.
**Reader task:** understand one idea, see it done, try it, and remember it after
the session — not admire the slides.

## Narrative

```
cover → objective → concept → example → walkthrough → practice → summary
```

One idea per page. Each page answers a learner question in order: what will I
be able to do, what is the idea, what does it look like when it is done, how do
I do it, can I do it, what do I keep. Repeat the sequence per topic in a long
lecture; do not run the whole sequence more than once per session.

## Required pages

| Page | Job |
|---|---|
| Cover | Course, lecture title (as a question or promise), instructor, session/date. |
| Objective | 2–4 observable outcomes and the success check; link to prior knowledge. |
| Concept | The idea in one sentence, one diagram, one key term, one common misconception. |
| Example | A real worked example: the prompt, the expert move, the result. |
| Walkthrough | 3–6 explicit steps with the reason for each; the current step is marked. |
| Practice | A task the learner can do now, with constraints, a check, and a hint. |
| Summary | Three takeaways, one sentence to remember, and the next step or exit ticket. |

Optional: agenda (only when the session runs past ~45 minutes), a second
example when the first is not representative, a "common errors" page when the
practice data shows one dominant error. Optional pages are content-driven.

## Density and type

- Body 18–22 px, page titles 32–40 px, cover 52–64 px, captions/sources 11–13 px.
- Line height 1.4–1.6. Two families maximum.
- One idea per page; white space around the example is part of the teaching, not
  wasted area. Practice pages hold a task, a check, and a hint — not a lecture
  repeated in small type.
- Step sequences never exceed six steps on one page; split into two pages
  instead of shrinking the type.

## Evidence rules

- Examples come from real material (textbook, dataset, product, code, case) and
  carry a source line. A simplified example is labelled "simplified".
- Numbers keep units, sample size, and the condition they came from. A worked
  calculation shows the intermediate values, not only the answer.
- Practice tasks must be solvable from this page plus the concept page. State
  the check ("you are right when…"), not only the answer.
- Never invent a citation, a statistic, or a learner result to fill a slot.
- Diagrams are explanatory, not evidence: they may be redrawn and labelled.
  Photographs of real equipment or specimens are evidence — do not generate them.

## Do

- Write objectives as observable verbs: explain, compute, diagnose, draft.
- Show the expert move and why it beats the naive move.
- Mark the current step consistently (for example `STEP 3 / 6`).
- Put the check next to the practice task, in plain language.
- End with one sentence the learner can repeat tomorrow.

## Don't

- Don't fill a page with a syllabus table or a bulleted chapter summary.
- Don't use gamified clutter, badges, emoji bullets, or decorative mascots.
- Don't shrink body text to fit more content; split the page.
- Don't use gradients, card grids, or a color bar under the title.
- Don't turn a practice page into a second lecture.
- Don't reuse the same composition on consecutive pages.

## Anti-homogenization

- The page order above is the teaching logic, not a template. Merge objective
  into cover, or split walkthrough into two pages, when the content needs it.
- Use at least three different recipes in a session deck; alternate layouts
  (statement, numbered steps, two-column example, task + check).
- No two consecutive pages share the same composition. `pages/*.md` offer 2–3
  variants each — change the variant, not only the text.
- `fragments/` are single-page geometry references. Never assemble them into a
  fixed deck and never copy the kit wholesale.
- Vary the rhythm: explain → show → do → recap. Do not run three text pages in
  a row.

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
