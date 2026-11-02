# open-pptd skill

This directory is the text knowledge pack an AI agent reads to design, write,
preview, and export presentations with open-pptd. It contains no runtime,
executable scripts, complete deck, or page-fragment library.

## Contents

```text
skill/
  SKILL.md          # entry procedure: 6 steps, hard rules, reference map
  README.md         # this file
  references/       # format, elements, charts, design, themes, quality, shapes, images
  kits/             # one narrative and evidence contract per scenario
```

`references/themes.md` is the single theme entry point for all kits. Each flat
`kits/<kit>.md` retains only that audience's narrative, page-content, and
evidence requirements.

## Requirements

- The `open-pptd` CLI (3.0 surface: `open`, `build`, `check`, `assets`,
  `doctor`). Verify with `open-pptd doctor`; install with the official
  install script from the main repository when missing.
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

The folder name is how most agents address the skill: keep `SKILL.md` at its
root. Restart the agent session after installing so the skill list refreshes.

## Use

Point the agent at a task ("make a 12-page thesis defense deck from this
paper") and let `SKILL.md` drive the flow. The agent self-checks the CLI,
picks one kit, asks one round of questions, writes a page map and manifest,
starts a detached preview, fills pages, runs `check`, and exports a PPTX.

## Maintenance

- `SKILL.md` is the only entry point. Keep it focused on procedure and routing,
  not format details. Push detail into `references/` and the flat `kits/*.md` files.
- `references/format.md`, `elements.md`, `charts.md`, and `shapes.md` must track
  the engine's accepted schema. Update these references when the engine changes.
- `references/design.md` holds cross-system design rules; `themes.md` holds all
  theme-specific visual and layout guidance; `quality.md` holds evidence/QA;
  `images.md` is the only image rule set.
- Do not recreate per-kit `theme.md`, `pages/`, or `fragments/` directories.
  Add complex layout guidance as proportional region, alignment, and reading-
  order instructions in the matching `themes.md` section.
- Validate edits by generating representative decks and running `open-pptd
  check` and `build --format pptx`. Run `node tests/skill/run.mjs` from the main
  repository when that test suite is available.
- Do not add complete decks, calibration demos, executable scripts, generated
  media, or duplicated format tables to this directory.
