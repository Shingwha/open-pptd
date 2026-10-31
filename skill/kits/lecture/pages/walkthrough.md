# Page recipe · walkthrough

**Purpose:** take the learner through the procedure step by step, with the
current step visibly marked, so they can reproduce it afterwards.

**Reader task:** know which step we are on, what to do in it, and why it exists.

## Slots

1. Kicker: "WALKTHROUGH" plus the procedure name.
2. Title: the procedure as an outcome ("Deploy from a clean branch in four
   steps"), 30–36 px.
3. Three to six steps, each: action (verb-first) + reason + the artefact it
   produces.
4. Current-step marker: the step being narrated, one accent treatment only.
5. Optional progress marker (`STEP 3 / 6`) in a fixed corner.
6. Optional live artefact: terminal, code, form, or diagram for the current step.
7. Source: tool version, dataset, or manual section.

## Variants

**A. Horizontal stepper** — steps across the page, the current one expanded
below; the others stay one line. The default for a talk-through.

**B. Vertical stack + detail panel** — steps down the left third, the current
step's detail and artefact on the right. Use when each step needs a full
explanation.

**C. Split demo** — a large artefact (screen, code, instrument) on one side and
the numbered steps on the other; the current step is highlighted. Use for live
software demonstrations.

## Selection

A for procedures with short steps; B when the reasoning is long; C when the
work is visual. Do not use a stepper for fewer than three steps — use an example
page instead. More than six steps: split into "prepare" and "execute" pages.

## Type and density

Title 30–36 px; step title 18–22 px; step detail 15–17 px; artefact labels
12–14 px; progress marker 12–14 px. The page is dense by design, but only one
step is expanded.

## Evidence / caption

Command lines, API names, and outputs are evidence: copy them exactly and note
the version and environment. Screenshots are from the real tool, not mockups.
If a step is simplified for teaching, mark it "simplified — check the manual for
your version".

## Do / Don't

Do: use verb-first step titles; state the reason for the step; show the output
that proves the step worked; keep the numbering identical across pages.
Don't: bury the current step; use six equally-weighted paragraphs; mix a
walkthrough with a practice task; show a tool screenshot without version.
