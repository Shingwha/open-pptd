# open-pptd — Local PPTD Presentation Skill

> 🌏 中文版: [README.md](README.md)

A "content → editable project → live preview → PPTX" presentation pipeline that runs entirely locally — **zero dependencies, no network required, no npm install**.

## What It Is

- **PPTD** is a human-readable YAML presentation format: one manifest (`deck.pptd`) + one `pages/*.page` per slide + `media/` images
- A browser-based editor for live preview / collaborative editing (edit files, refresh to apply), exporting standard `.pptx`
- **Preview (browser) = Export (PowerPoint)**: single definition, dual consumers (writer / renderer share the same source)
- Capabilities: 13 chart types, 187 preset shapes + custom paths, LaTeX formula mixing, font embedding, fade slide transitions

> This project is fully self-developed (web editor, PPTX writer, icon library, chart & LaTeX rendering, CLI export pipeline) — no third-party editor code or reverse-engineered implementations.

## Try It Online

No installation needed — open the live gallery (GitHub Pages):

**https://shingwha.github.io/open-pptd/**

- The gallery showcases curated PPTD example decks with live-rendered covers; click a card to open it in the editor
- Online mode lets you freely edit examples, export PPTX, or click **Save** to download the project bundle (zip) for local editing

## Example Gallery

The repo ships with curated examples in `examples/` (also shown in the online gallery):

| Example | Scenario | Highlights |
|---|---|---|
| [Coffee Monthly Report](examples/coffee-monthly-report/) | Management review · 5 slides | Native charts (bar/line/pie/radar/waterfall/treemap) + KPI cards + table |
| [EV Range Prediction](examples/ev-range/) | Academic defense · 17 slides | LaTeX formulas, image layout, chapter structure |
| [Shanmingji Brand Launch](examples/shanmingji-2026-launch/) | New-Chinese brand · 7 slides | Tables, images, Chinese-style layout, 3-font mixing |

<p align="center">
  <img src="docs/images/coffee-monthly.png" width="45%" alt="Coffee Monthly Report"/>
  <img src="docs/images/ev-range.png" width="45%" alt="EV Range Prediction"/>
</p>

<p align="center">
  <img src="docs/images/shanmingji.png" width="45%" alt="Shanmingji Brand Launch"/>
</p>

### Adding Your Own Deck to the Gallery

1. Drop a finished PPTD project folder (`deck.pptd` + `pages/` + `media/`) into `examples/<name>/`
2. The local gallery picks it up immediately (`serve` scans automatically); optional `meta.yaml` adds title/description/tags
3. Run `node bin/open-pptd.js gallery scan` to rebuild the index, then commit & push — the online gallery (GitHub Pages) updates via CI

## Prerequisites

- **Node.js v18+** (the only dependency; no npm packages to install; render command recommended on Node 21+)
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

> All paths inside the skill are relative to the skill directory, so it works wherever you install it. The only prerequisite is Node.js v18+ (no npm install, no network; render recommended on Node 21+).

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

# 2. AI-assistant flow: write deck.pptd first (full page list + theme + font declarations),
#    then immediately start the live preview in the background (the user sees each page
#    appear in real time while the pages are being generated):
nohup node bin/open-pptd.js serve --project /path/to/project > /tmp/open-pptd-serve.log 2>&1 &
#    Open the URL printed in the log, then generate all pages/*.page — each file landing
#    on disk auto-refreshes the editor

# 3. Export PPTX / project package / page images from the CLI
node bin/open-pptd.js export /path/to/project/deck.pptd -o out.pptx
node bin/open-pptd.js export-project /path/to/project/deck.pptd -o project.zip
node bin/open-pptd.js render /path/to/project/deck.pptd -o out-dir
#   render: export every page as PNG (960×540, headless browser, same renderer as the editor preview)
#   options: --page 3 (single page) --scale 2 (upscale) --browser <path> --timeout <ms>
#   note: render is only for on-demand image-level visual checks (user asks the agent to
#   check layout itself AND the model can read images)

# 4. Manual use: start the web editor in the foreground for live preview/editing/export
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
├── index.html                # Example gallery entry (GitHub Pages site root)
├── examples/                 # Gallery example projects (deck.pptd + pages/ + media/ + optional meta.yaml)
├── bin/open-pptd.js          # CLI (serve / export / export-project / render / fonts)
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

- **Dev repo [open-pptd](https://github.com/Shingwha/open-pptd) (use by default)**: full source, all tests, and the example gallery (`examples/`). **The GitHub Pages site (online gallery) is deployed from this repo**: https://shingwha.github.io/open-pptd/ — pushed commits are automatically built by GitHub Actions (regression tests → gallery index rebuild → deploy).
- **Publish repo [open-pptd-publish](https://github.com/Shingwha/open-pptd-publish)**: a runtime-only snapshot of the skill for direct installation. No tests, icon sources, generation scripts, or example gallery (`examples/` is excluded from sync). If you are not developing the code, clone this one (see Installation above).

The publish repo is kept in sync from the dev repo via `npm run sync:publish -- --push` (a whitelist snapshot, see `scripts/sync-publish.mjs` in the dev repo); its content always tracks the `main` branch of the dev repo.

## Using as an AI Skill

Install the whole directory as a skill (SKILL.md is the entry point). The AI works as follows:

1. Confirms content/scenario with the user → decides the theme (colors/fonts/table styles, a one-time design decision written into `deck.theme` at generation; the editor's 10 built-in palette presets can replace `theme.colors` in one click, and CLI export supports `--theme <key>`)
2. Writes `deck.pptd` first (full page list + theme + fonts), **then immediately starts `serve --project` in the background** (nohup; hands the URL to the user), then generates all `pages/*.page` in one pass — the user watches pages appear one by one in real time and can interrupt with feedback at any moment
3. Structural validation always runs; **page-image rendering (`render`) is strictly on demand** — only when the user explicitly asks the agent to check/adjust the visuals itself, AND the model can read images, AND a browser is available
4. Exports and delivers the `.pptx` (fonts embedded + fade transitions by default), reporting the preview server status in the delivery

## License

MIT
