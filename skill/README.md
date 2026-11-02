# open-pptd skill

This directory is the text knowledge pack an AI agent reads to design, write,
preview, and export presentations with open-pptd. It contains no runtime,
executable scripts, complete decks, or page-fragment library.

## Contents

```text
skill/
  SKILL.md
  README.md
  references/
    pptd.md
    design.md
    shapes.md
    slides_categories/
      academic-research.md
      analysis-decision.md
      business-plan.md
      management-report.md
      tech-engineering.md
      brand-creative.md
      education-training.md
      poster.md
```

`pptd.md` is the complete format specification, `design.md` holds shared design
rules and visual choices, and `shapes.md` is the preset geometry table. Each
scenario file owns its audience, narrative, evidence, density, and page recipes.
`poster.md` is reserved for a highly visual single page.

## Requirements

- The `open-pptd` CLI (3.0 surface: `open`, `build`, `check`, `assets`,
  `doctor`). Verify with `open-pptd doctor`; install with the official install
  script from the main repository when missing.
- No npm packages are needed by the skill itself.

## Install

Choose one source:

1. **CLI (recommended)** — with the `open-pptd` CLI installed:

   ```sh
   open-pptd assets skill install --dir ~/.claude/skills
   ```

   `--dir` is your agent's skills directory (`~/.claude/skills` for Claude Code,
   `~/.pi/agent/skills` for pi, or the directory your tool documents); the
   command copies this pack to `<dir>/open-pptd`. Add `--force` to replace an
   existing install and `--json` for a single-line result.
2. **Release zip** — download the stable latest package (or a pinned
   `open-pptd-skill-v<ver>.zip`), unpack it, and place the top-level `open-pptd/`
   folder into your agent's skills directory:

   ```sh
   curl -L -o open-pptd-skill.zip \
     https://github.com/Shingwha/open-pptd/releases/latest/download/open-pptd-skill.zip
   unzip open-pptd-skill.zip -d ~/.claude/skills
   ```

   The release also publishes `SHA256SUMS`; check the download with
   `sha256sum -c` or `Get-FileHash` before installing.
3. **Main repository (source fallback)** — copy `skill/` from the open-pptd
   repository into the same location and rename it to `open-pptd/`.

Keep `SKILL.md` at the skill root. Restart the agent session after installing so
the skill list refreshes.

## Use

Point the agent at a task ("make a 12-page thesis defense deck from this
paper") and let `SKILL.md` drive the flow. The agent self-checks the CLI, picks
one scenario, asks one round of questions, writes a page map and manifest,
starts a detached preview, fills pages, runs `check`, and exports a PPTX.

## Maintenance

- `SKILL.md` is the only entry point. Keep it focused on procedure and routing,
  not format details.
- `pptd.md` and `shapes.md` must track the engine's accepted schema. Update them
  when the engine changes.
- `design.md` holds cross-scenario design rules. Add scenario-specific narrative,
  evidence, density, and layout guidance to the matching `slides_categories/`
  file instead of creating a parallel theme hierarchy.
- Do not recreate per-scenario `theme.md`, `pages/`, or `fragments/` directories.
  Use proportional region, alignment, reading-order, and variant instructions in
  the scenario file.
- Validate edits with `node tests/skill/run.mjs` from the main repository. For a
  visual change, also generate a representative project and run `open-pptd check`
  and `open-pptd build --format pptx`.
- Do not add complete decks, calibration demos, executable scripts, generated
  media, or duplicated format tables to this directory.
