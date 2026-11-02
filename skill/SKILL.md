---
name: open-pptd
description: Create, edit, replicate, and export presentations. For every slide,
  deck, PowerPoint, PPTX, PPTD, infographic, or poster task, deliver BOTH a
  self-contained PPTD project directory and a locally generated .pptx, unless
  the user explicitly asks for another format. Deliver with absolute local paths.
disable-model-invocation: false
---

# open-pptd

open-pptd turns content into presentations through **PPTD**, a YAML slide DSL.
Every page is self-contained and editable; there are no master slides to fight.
This file is the operating procedure. Format details and design depth live in
`references/`; audience logic lives in the flat `kits/*.md` files.

## Deliverables — both, unless the user opts out

1. A self-contained project directory: `deck.pptd` + `pages/*.page` + `media/`
   when the deck has local media.
2. A locally generated `deck.pptx` built from that project (fonts embedded by
   default, fade transitions written by the writer).

A bare manifest is not a deliverable. Never deliver a `.pptx` without its PPTD
source, and never claim playback compatibility you have not verified.

## Step 1 — CLI self-check

Run `open-pptd doctor`. Exit 0 with a report means the CLI exists. If the
command is missing, **tell the user first** (installation downloads a script,
writes `~/.open-pptd`, and edits the user-level PATH), then use the official
installer for the platform, and re-run `open-pptd doctor`:

- Windows (PowerShell):
  `irm https://raw.githubusercontent.com/Shingwha/open-pptd/main/install.ps1 | iex`
- Linux / macOS:
  `curl -fsSL https://raw.githubusercontent.com/Shingwha/open-pptd/main/install.sh | sh`

If the CLI cannot be installed (no network/Node), say so explicitly. You may
still author PPTD YAML offline, but preview and export are unavailable; report
the blocker instead of pretending. Do not invent version requirements.

## Step 2 — Classify the job and choose one kit

Classify first: **create** (from a topic, outline, or reference), **edit** (an
existing `.pptd` project), or **replicate** (images/PDF → PPTD). Then pick the
single best kit:

| Kit | Audience and reader task | System |
|---|---|---|
| `kits/academic.md` | Committee, advisor, reviewers; judge problem, method, evidence, contribution | academic |
| `kits/business-review.md` | Managers, board; grasp period status, drivers, risks, actions | executive |
| `kits/consulting-report.md` | Decision makers, clients; compare options and commit to a recommendation | executive |
| `kits/brand-proposal.md` | Brand owner, creative jury; believe the concept and buy the direction | editorial |
| `kits/lecture.md` | Students, trainees; understand, practise, and apply one idea | instructional |
| `kits/poster.md` | Poster-hall visitors at 1–2 m; get one claim from a single page | editorial (single page) |

Read the selected `kits/<kit>.md`, its matching section in
`references/themes.md`, and `references/design.md`. The kit owns narrative and
evidence; `themes.md` is the single source for palette, typography, density,
motif, and layout grammar. If the user supplies a template or design system, it
overrides the visual direction. Mix kits only when the story genuinely changes
mode, and state the primary kit.

## Step 3 — One round of interview, plan first

Ask once, with a concrete default for every dimension; the user overrides what
they care about in one reply, and unaddressed items fall back to your stated
plan. Cover:

1. **Kit and visual direction** — name 2–3 concrete combinations from the
   matching `references/themes.md` section (system + palette + light mode), not
   adjectives. For academic work, default to Defense Blue and offer Research
   Green or Scholar Purple when a choice is useful.
2. **Page count and expansion** — user count wins; an outline matches itself;
   otherwise propose a count from the content. Say whether you will expand
   missing material and with what (search, user files, or leave placeholders).
3. **Sources and citations** — whether every external fact needs a source line
   and whether a references page is required.
4. **Speaker notes** — always ask; notes are opt-in. Default: no `notes` field.
5. **Image plan — conditional.** Ask only when **all** of these hold: an
   image-generation tool actually exists in this session, the page plan needs
   non-evidence visuals (hero, concept art, texture, transparent objects), and
   the kit allows it. Default is **no**. Image search is a separate question,
   also default no. Academic decks default to no generation at all. If the user
   declines, do not ask again. Read `references/images.md` only when images are
   actually in scope.

After the interview, state the confirmed plan in one short paragraph: page
count, kit/system, palette direction, font pairing (≤2 families), density,
layout direction, and whether notes/images are on. Then start building.

## Step 4 — Page map, manifest, live preview

1. List the pages by **reader task**, not by a fixed template: one line per
   page (purpose + evidence + layout grammar). Choose a suitable grammar from
   the selected `themes.md` section and adapt its proportions; do not repeat
   the same composition on consecutive pages.
2. Create the project directory (`pages/`, `media/` if needed).
3. Write `deck.pptd` with the full page list, theme, and font declarations.
   Missing page files are fine while preview runs.
4. Start preview immediately, detached:
   `open-pptd open /abs/path/project --detach --json`
   The one-line JSON contains the `url` to hand to the user. Pages hot-reload
   as files land. Stop later with `open-pptd open --stop`.
5. For edits/replication, start preview before touching pages so the user sees
   every change. For replication, measure the source geometry and rebuild
   element by element; a `.pptx` is reference material, not an import path.

## Step 5 — Fill pages and check

Generate all pages in one pass; no skeleton batches. Each page needs one focal
point and at least one visual element (chart, figure, diagram, composed shape).

- Run `open-pptd check /abs/path/project/deck.pptd` after the first full pass
  and again after fixes. Errors block; fix them. Warnings (geometry, contrast,
  font fallback) are signals — fix the real ones, explain the rest.
- Visual QA (`build --format png`) only when the user asked you to inspect the
  visuals **and** you can read images **and** a local browser exists. Render
  affected pages only, fix gross defects, and re-render once.
- Fix evidence, overflow, contrast, and source lines before exporting.

## Step 6 — Export and deliver

Run `open-pptd build /abs/path/project/deck.pptd --format pptx -o /abs/path/project/deck.pptx`.
The command runs a full check first: errors block, warnings do not. Relay the
result faithfully: `embedded`, `skipped`, and `missing` mean what they say. If a
font was skipped, say so. Do not manually unzip the PPTX to inspect
transitions; the writer and engine tests own that.

Deliver absolute links to: the project directory, the manifest, `pages/`,
`media/` when present, and the PPTX. End with preview status and the stop or
restart command. Never leave the user guessing whether the server is running.

## Hard rules

- **No fabricated evidence.** Never invent data, citations, cases, results,
  logos, or sources. Mark missing material as a placeholder or assumption.
- **No full-deck template.** Kits provide narrative and evidence rules;
  `themes.md` provides adaptable layout grammars. Build the deck's own page
  order and compositions rather than copying a fixed sequence.
- **No AI visual clichés.** No card grids as a substitute for hierarchy, no
  gradients as decoration, no multicolor palettes on one page, no decorative
  title underlines, no color-bar motifs. See `references/design.md`.
- **Native charts for quantitative data.** Never approximate a chart with
  shapes. Shapes are for structure, flow, relationship, and annotation.
- **One theme per deck, self-contained.** Write the theme into `deck.pptd` and
  reference tokens with `$key`. Do not reference a preset by string.
- **Registered font names only** in `deck.fonts` and `fontFamily`. Ask in
  display names, write registered names. At most two families per deck.
- **Sources, units, captions.** Every external number has a source and period;
  every figure/table has a caption; every chart has units. See
  `references/quality.md`.
- **Images follow `references/images.md`.** Original evidence first; never
  generate or search for evidence; generated art is expression only.
- **Speaker notes are opt-in.** No `notes` field unless confirmed.
- **Do not read engine source by default.** This skill is text; only consult
  source when a reproducible engine defect blocks the job.

## Reference map — read only what the job needs

| File | Read when |
|---|---|
| `references/format.md` | Writing the manifest, page shell, theme, or file layout |
| `references/elements.md` | Text/rich text, shape, line, image, icon, table fields |
| `references/charts.md` | Any chart: type choice, `data`/`encode`, export behavior |
| `references/design.md` | Choosing the system and applying cross-system design rules |
| `references/themes.md` | After choosing a kit: palette, fonts, density, motif, and layout grammar |
| `references/quality.md` | Sources, captions, placeholders, pre-export QA checklists |
| `references/shapes.md` | Choosing a preset shape or its `adjustments` |
| `references/images.md` | Evidence extraction, generation, search, transparency, wiring |
| `kits/<kit>.md` | Always after choosing a kit |

CLI surface (3.0 only): `open`, `build`, `check`, `assets`, `doctor`. The 2.x
command names are gone — do not look for aliases. Use `open --detach --json`
for preview, `build --format pptx|png|bundle` for artifacts, `check` read-only,
`assets` for themes and font/icon libraries, and `doctor` for environment facts.
