# open-pptd — Local PPTD Presentation Skill

> 🌏 中文版: [README.md](README.md)

A "content → editable project → live preview → PPTX" presentation pipeline that runs entirely locally — **zero dependencies, no network required, no npm install**.

**See it in action 👉 https://shingwha.github.io/open-pptd/**

No installation needed — open the online gallery in a browser: curated decks with live-rendered covers; click a card to open it in the editor, tweak it freely, export PPTX, or download the project bundle (zip) for local editing.

## Example Gallery

The repo ships with 5 curated examples in `examples/` — click a title to open it in the online editor:

| Example | Scenario | Highlights |
|---|---|---|
| [Coffee Monthly Report](https://shingwha.github.io/open-pptd/editor/?deck=examples%2Fcoffee-monthly-report%2Fdeck.pptd) | Management review · 5 slides | Six native chart types + KPI cards + booktabs-style tables |
| [EV Range Prediction](https://shingwha.github.io/open-pptd/editor/?deck=examples%2Fev-range%2Fdeck.pptd) | Academic defense · 17 slides | LaTeX formulas, image layout, chapter structure |
| [Islelight Brand Book](https://shingwha.github.io/open-pptd/editor/?deck=examples%2Fislelight-brand-book%2Fdeck.pptd) | Brand creative · 7 slides | Klein-blue Swiss poster style, B&W photography grid |
| [MiaoPai Round-A Pitch](https://shingwha.github.io/open-pptd/editor/?deck=examples%2Fmiaopai-saas-bp%2Fdeck.pptd) | Startup BP · 7 slides | Ink-black × neon-green contrast, TAM/SAM/SOM, timeline |
| [Shanmingji Brand Launch](https://shingwha.github.io/open-pptd/editor/?deck=examples%2Fshanmingji-2026-launch%2Fdeck.pptd) | New-Chinese style · 7 slides | Tables, images, Chinese-style layout, 3-font mixing |

<p align="center">
  <img src="docs/images/coffee-monthly.png" width="45%" alt="Coffee Monthly Report"/>
  <img src="docs/images/ev-range.png" width="45%" alt="EV Range Prediction"/>
</p>

<p align="center">
  <img src="docs/images/shanmingji.png" width="45%" alt="Shanmingji Brand Launch"/>
</p>

## What It Is

- **PPTD** is a human-readable YAML presentation format: one manifest (`deck.pptd`) + one `pages/*.page` per slide + `media/` images
- A browser-based editor for live preview / collaborative editing (edit files, refresh to apply), exporting standard `.pptx`
- **Preview (browser) = Export (PowerPoint)**: single definition, dual consumers (writer / renderer share the same source)
- Capabilities: 13 chart types, 187 preset shapes + custom paths, LaTeX formula mixing, font embedding, fade slide transitions

> This project is fully self-developed (web editor, PPTX writer, icon library, chart & LaTeX rendering, CLI export pipeline) — no third-party editor code or reverse-engineered implementations.

## Installation

The only prerequisite is **Node.js v18+** (no npm install, no network; render command recommended on Node 21+); browser: Chrome / Edge recommended (needed for the "Open Folder" save feature).

Choose either method, installing into your AI tool's **skills folder**:

**Option 1: download the release zip (recommended — no git needed)**

1. Grab the latest `open-pptd-v*.zip` from the [Releases](https://github.com/Shingwha/open-pptd/releases) page
2. Extract it into your skills folder — you get `<your-skills-folder>/open-pptd/`; to update, re-download and overwrite

**Option 2: git clone (for tracking updates / development)**

```bash
git clone https://github.com/Shingwha/open-pptd <your-skills-folder>/open-pptd
```

> A clone brings tests/docs/examples along; the release zip contains only the skill runtime and is much lighter.

Skills folder locations vary by tool:

| AI tool | Skills folder |
|---|---|
| Claude Code | `~/.claude/skills` |
| pi | `~/.pi/agent/skills` |
| Other custom directories | Per your tool's configuration |

> All paths inside the skill are relative to the skill directory, so it works wherever you install it.

### First-time setup: download the font library (optional but recommended)

Font binaries (~155 MB) are not shipped in the package. Choose one of two options before first use:

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

## Using as an AI Skill

Install the whole directory as a skill (SKILL.md is the entry point). The AI works as follows:

1. Confirms content/scenario with the user → decides the theme (colors/fonts/table styles, a one-time design decision written into `deck.theme` at generation; the editor's 10 built-in palette presets can replace `theme.colors` in one click, and CLI export supports `--theme <key>`)
2. Writes `deck.pptd` first (full page list + theme + fonts), **then immediately starts `serve --project` in the background** (nohup; hands the URL to the user), then generates all `pages/*.page` in one pass — the user watches pages appear one by one in real time and can interrupt with feedback at any moment
3. Structural validation always runs; **page-image rendering (`render`) is strictly on demand** — only when the user explicitly asks the agent to check/adjust the visuals itself, AND the model can read images, AND a browser is available
4. Exports and delivers the `.pptx` (fonts embedded + fade transitions by default), reporting the preview server status in the delivery

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
├── scripts/                  # build scripts (icon library / preset geometry / reference doc generation / release packaging)
├── tests/                    # tests (see tests/README.md: component projects + one-shot regression + E2E)
└── package.json
```

## Development

### Contributing to the Gallery

The online gallery is deployed from this repo via GitHub Pages — pushed commits are automatically built by GitHub Actions (regression tests → gallery index rebuild → deploy). To add your own deck: drop the finished project folder (`deck.pptd` + `pages/` + `media/`, optional `meta.yaml` for title/description/tags) into `examples/<name>/`; local `serve` picks it up automatically, then run `node bin/open-pptd.js gallery scan` to rebuild the index and commit & push.

### Testing

```bash
npm test                      # one-shot regression: export all component projects + package consistency + colors + full shapes + formulas + icons
npm run test:live             # project-mode E2E (SSE live reload + save-back to disk, needs Chrome)
npm run test:incremental      # incremental-load E2E (pages show up as a project is being written, needs Chrome)
```

See `tests/README.md` for details (the release zip does not include tests).

### Releases

Pushing a `v*` tag (e.g. `v1.1.0`, matching package.json's version) triggers CI to run regression tests → package the runtime from a whitelist → create a GitHub Release; the attached `open-pptd-v*.zip` is what Installation Option 1 downloads. See **[docs/release-workflow.md](docs/release-workflow.md)** for the full flow and local packaging (`npm run pack`).

> The old publish repo [open-pptd-publish](https://github.com/Shingwha/open-pptd-publish) was retired and archived in 2026-08; switch to the release zip or clone this repo.

## License

MIT
