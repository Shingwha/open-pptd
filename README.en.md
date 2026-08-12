# open-pptd — Local PPTD Presentation Skill

> 🌏 中文版: [README.md](README.md)

A "content → editable project → live preview → PPTX" presentation pipeline that runs entirely locally — **zero dependencies, no network required, no npm install**.

## What It Is

- **PPTD** is a human-readable YAML presentation format: one manifest (`deck.pptd`) + one `pages/*.page` per slide + `media/` images
- A browser-based editor for live preview / collaborative editing (edit files, refresh to apply), exporting standard `.pptx`
- **Preview (browser) = Export (PowerPoint)**: single definition, dual consumers (writer / renderer share the same source)
- Capabilities: 13 chart types, 187 preset shapes + custom paths, LaTeX formula mixing, font embedding, fade slide transitions

> This project is fully self-developed (web editor, PPTX writer, icon library, chart & LaTeX rendering, CLI export pipeline) — no third-party editor code or reverse-engineered implementations.

## Prerequisites

- **Node.js v18+** (the only dependency; no npm packages to install)
- Browser: Chrome / Edge recommended (needed for the "Open Folder" save feature)

## Installation (3 steps)

Clone the repo into your AI tool's **skills folder**:

```bash
# Option 1: clone to a specific location (recommended)
git clone https://github.com/Shingwha/open-pptd <your-skills-folder>/open-pptd

# Option 2: cd into the skills folder first (folder name becomes open-pptd automatically)
cd <your-skills-folder>
git clone https://github.com/Shingwha/open-pptd
```

Skills folder locations vary by tool:

| AI tool | Skills folder |
|---|---|
| Claude Code | `~/.claude/skills` |
| pi | `~/.pi/agent/skills` |
| Other custom directories | Per your tool's configuration |

> All paths inside the skill are relative to the skill directory, so it works wherever you install it. The only prerequisite is Node.js v18+ (no npm install, no network).

### First-time setup: download the font library (optional but recommended)

Font binaries (~155 MB) are not committed to git. Choose one of two options before first use:

```bash
# Option A: one-time full download (one and done, ~155 MB, works offline)
node bin/open-pptd.js fonts download all

# Option B: on-demand download (download what you use, run before export)
node bin/open-pptd.js fonts download Smiley Sans
```

> Missing fonts do not block export: they are skipped with a warning at export and the PPTX is still generated (falls back to system fonts when opened).

## Quick Start

```bash
# 1. Create the project directory
mkdir -p /path/to/project/pages /path/to/project/media

# 2. Have the AI assistant generate deck.pptd + pages/*.page (spec: references/pptd.md)

# 3. Export PPTX / project package from the CLI
node bin/open-pptd.js export /path/to/project/deck.pptd -o out.pptx
node bin/open-pptd.js export-project /path/to/project/deck.pptd -o project.zip

# 4. (Optional) Start the web editor for live preview
node bin/open-pptd.js serve --project /path/to/project --port 55173
# Open the printed local URL in a browser
```

Consult `references/` as needed: `pptd.md` (complete PPTD v2 spec — **the single source of truth for format decisions**), `shapes.md` (187 preset shapes), `fonts.md` (font list), `icons.md` (icon list), `slides_categories.md` (per-scenario layout guidance), `general-poster.md` (poster/infographic single-page design).

## Directory Structure

```
open-pptd/
├── SKILL.md                  # Full workflow guide for AI assistants
├── README.md                 # This project's docs (Chinese)
├── README.en.md              # English version of the docs
├── index.html                # Editor entry (redirects to editor/)
├── bin/open-pptd.js          # CLI (serve / export / export-project / fonts)
├── lib/                      # Local server (static + SSE live reload + save-back) + export logic
├── editor/                   # Web editor (pure frontend, no backend dependency)
│   ├── core/                 #   data model / rich text / theme / geometry / icon library
│   ├── writer/               #   PPTX writer (OOXML generation, aligned with PowerPoint structure)
│   ├── renderer/             #   preview rendering (same source as writer)
│   ├── types/                #   element type registry (text/shape/line/image/icon/table/chart)
│   └── app/                  #   editor assembly (state/views/IO/toolbar)
├── assets/                   # built-in assets (icons/ icon sources; fonts/ 29 free-for-commercial-use fonts, local assets not uploaded to GitHub)
├── references/               # reference docs read on demand (pptd.md / shapes.md / fonts.md / icons.md / …)
├── scripts/                  # build scripts (icon library / preset geometry / reference doc generation)
├── tests/                    # tests (see tests/README.md: component projects + one-shot regression + E2E)
└── package.json
```

## Testing

```bash
npm test                      # one-shot regression: export all component projects + package consistency + colors + full shapes + formulas + icons
npm run test:live             # project-mode E2E (SSE live reload + save-back to disk, needs Chrome)
npm run test:incremental      # incremental-load E2E (pages show up as a project is being written, needs Chrome)
```

See `tests/README.md` for details (the publish repo does not include tests; testing and dev resources live in the dev repo).

## Repository Notes

This project has two repositories:

- **Publish repo [open-pptd-publish](https://github.com/Shingwha/open-pptd-publish) (use by default)**: a runtime-only snapshot of the skill for direct installation. No tests, icon sources, or generation scripts. If you are not developing the code, clone this one (see Installation above).
- **Dev repo [open-pptd](https://github.com/Shingwha/open-pptd) (for contributors)**: full source including all tests, icon sources, and generation scripts.

The publish repo is kept in sync from the dev repo via `npm run sync:publish -- --push` (a whitelist snapshot, see `scripts/sync-publish.mjs` in the dev repo); its content always tracks the `main` branch of the dev repo.

## Using as an AI Skill

Install the whole directory as a skill (SKILL.md is the entry point). The AI works as follows:

1. Confirms content/scenario with the user → decides the theme (colors/fonts/table styles, a one-time design decision written into `deck.theme` at generation; the editor's 10 built-in palette presets can replace `theme.colors` in one click, and CLI export supports `--theme <key>`)
2. Creates the project from scratch (`deck.pptd` + `pages/*.page`), delivering both the PPTD project and a locally exported `.pptx` by default
3. Optionally starts `serve --project` for live preview/editing/export in the user's browser
4. After visual review passes, exports and delivers the `.pptx` (fonts embedded + fade transitions by default)

## License

MIT
