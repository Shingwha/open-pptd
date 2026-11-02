# Education & Training

**Audience:** students, trainees, workshop participants, and internal learners.
**Reader task:** understand one idea, see it done, try it, and remember it after
the session. **Default style:** `editorial` in `../design.md`.

## Narrative

```text
cover → objective → concept → example → walkthrough → practice → summary
```

One idea per page. Each page answers a learner question in order: what will I be
able to do, what is the idea, what does it look like, how do I do it, can I do
it, what do I keep. Repeat the sequence per topic in a long course.

## Page types

| Page | Job |
|---|---|
| Cover | Course, lecture question/promise, level/scope, instructor, session/date. |
| Objective | 2–4 observable outcomes, prior-knowledge link, and success check. |
| Concept | One idea sentence, one diagram, one key term, one misconception. |
| Example | Real worked case: original prompt, expert move/reason, result. |
| Walkthrough | 3–6 explicit steps with reasons, output, and current-step marker. |
| Practice | Solvable task with input/output, constraints, check, and separate hint. |
| Summary | Three takeaways mapped to objectives, one sentence to remember, next step. |

Optional agenda only past ~45 minutes, a second example when the first is not
representative, or common errors when practice evidence shows a dominant error.

## Content and evidence contracts

- Objectives use observable verbs and conditions; practice must test what the
  objective promises. Never list more than four.
- A concept definition is one sentence. Diagrams use the same terminology as the
  example and need no more than three legend items.
- Examples preserve the original prompt and show 2–4 expert moves with reasons.
- Walkthroughs contain 3–6 steps, only one expanded at a time. More than six
  steps splits into prepare/execute; fewer than three is an example instead.
- Practice states required output, time/tools/format constraints, and `you are
  right when…` criteria visible while working.
- Summaries contain three takeaways and no new concept or result. Map deferred
  objectives honestly rather than implying all were mastered.
- Examples come from real material and carry a source. Simplified examples and
  values are labelled `simplified`.
- Numbers keep units, sample, and condition; calculations show intermediate
  values and rounding, not only the answer.
- Commands, APIs, outputs, tool versions, and environments are copied exactly.
  Real software screenshots are not replaced with mockups.
- Practice uses the same real dataset/case as the example. A fabricated
  `typical student answer` is not evidence.

## Layout recipes

- **Cover / objective:** title and scope on the left 60% with a metadata strip,
  or one full-width question with instructor/scope below. Objectives use 2–4
  observable outcomes plus a visible success check.
- **Concept:** definition left/diagram right with misconception strip below, or
  a term with a small contrast table. Diagram occupies 35–55%; one misconception
  per page.
- **Worked example:** prompt → expert move → result bands; naive versus expert
  columns; or a real annotated artifact beside a narrow reasoning column.
- **Walkthrough:** horizontal 3–6 stepper with only the current step expanded;
  left step stack/right detail panel; or large real tool artifact beside numbered
  steps. Mark current progress consistently.
- **Practice:** task left/check right/hint footer. Mixed groups may use
  warm-up/core/stretch tiers; communication skills may use two roles with a
  shared check.
- **Summary:** three numbered takeaways mapped to objectives; small concept map
  with no new nodes; or one exit-ticket question beside a recap.

Whitespace around the example is instructional. Split pages rather than
shrinking type or exceeding six steps.

## Palette, typography, and motif

| Direction | primary | accent | Use |
|---|---|---|---|
| Chalk & Ink | `#1F6B5C` | `#4C9A86` | Science and quantitative teaching |
| Blueprint Classroom | `#1D3F73` | `#C2622E` | Engineering and programming |
| Studio Amber | `#9A4B1E` | `#C98A3C` | Humanities, design, language workshops |

Chinese default: `MiSans` titles/body + `Microsoft YaHei` labels/captions.
Workshop alternative: `Smiley Sans` titles + `MiSans` body. Reading-heavy:
`Source Han Serif CN` titles/quotes + `Microsoft YaHei` body.

Cover 52–64px; page title 32–40px; step numeral 40–56px; body 18–22px;
example/code label 14–16px; practice task 20–24px; caption/source 11–13px.
Body below 18px is a legibility defect. Use the accent for the current step or
key term only, and one step counter or objective/practice marker as the motif.

## Anti-homogenization and QA

- Merge objective into cover or split walkthrough when the teaching logic needs
  it; the narrative is not a fixed template.
- Use at least three layout grammars in a session deck. Alternate statement,
  numbered steps, worked example, and task + check.
- Never run three text pages in a row or turn practice into a second lecture.
- Do not use gamified clutter, badges, emoji bullets, mascots, decorative color
  bars, or a syllabus table as a full page.
