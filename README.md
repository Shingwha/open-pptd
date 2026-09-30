<div align="center">

# open-pptd

**Say one sentence to your AI — get an editable, exportable deck or poster.**

`v2.0.0` · `MIT` · `Node ≥ 18` · `zero dependencies · zero build`

[Online gallery](https://shingwha.github.io/open-pptd/) (no install, click & edit) · [30-second setup](#30-second-setup) · [Use it with AI](#use-it-with-ai)

<img src="docs/images/editor.png" width="880" alt="open-pptd editor: Qingshan Coffee business review — canvas on the left, property panel on the right, 12-page thumbnail strip at the bottom"/>

</div>

---

中文版: [README.zh-CN.md](README.zh-CN.md)

## 30-second setup

The only prerequisite: **Node.js ≥ 18**.

**Windows (PowerShell)**

```powershell
irm https://raw.githubusercontent.com/Shingwha/open-pptd/main/install.ps1 | iex
```

**macOS / Linux**

```sh
curl -fsSL https://raw.githubusercontent.com/Shingwha/open-pptd/main/install.sh | sh
```

This installs into `~/.open-pptd` and adds a user-level PATH entry (no admin needed); `open-pptd` is then available everywhere. Start a live preview server:

```sh
open-pptd serve --project <project-dir> --detach --json   # open in browser; edits refresh live
open-pptd doctor                                          # environment self-check (CLI / Node / assets / PATH)
```

Or skip installing: clone this repo and run `node bin/open-pptd.js serve …` — same result.

## Use it with AI

Install the skill package into your AI tool's skills directory (`~/.claude/skills` for Claude Code, `~/.pi/agent/skills` for pi, others per your tool's configuration):

```sh
git clone https://github.com/Shingwha/open-pptd-skill <your-skills-directory>/open-pptd
```

Then just talk — no configuration needed:

- "Make me a 7-page annual business review; tell the story with charts"
- "Turn this outline into a presentation" + paste the outline
- "Design a Bailu solar-term poster"

The AI delivers **two things**: an editable PPTD project directory (manifest + pages + media), and a ready-to-send `.pptx` (fonts embedded, opens in PowerPoint without repair). To watch it being built live, have the AI run the `serve` command above — every page appears as it's written.

## What it does

| | |
|---|---|
| **Charts** | 13 types with an Excel-style data grid — edit the numbers, the chart follows |
| **Shapes / icons** | 187 preset shapes + custom paths; ~2000 Font Awesome icons (three styles) |
| **Typography** | LaTeX formula mixing; font embedding (subset / full, with pre-export health checks that auto-fetch what's missing) |
| **Web editor** | Live preview (refreshes on every file change), multi-select / marquee / context menu / group-align-distribute, 13-type chart editor, dark mode |
| **Export** | Standard `.pptx` (fade transitions) and per-page PNG |
| **Round-trip** | Download online work as a project bundle, or "Open Folder" to edit local projects directly |

**Preview = export**: what you see in the browser and what opens in PowerPoint come from the same rendering pipeline, pixel for pixel — the core promise of this project, guarded page-by-page by a 156-page golden baseline.

## How it works

```
your words ──AI (open-pptd-skill methodology)──▶ PPTD project (human-readable YAML: manifest + pages/ + media/)
                                                      │
                                  ┌───────────────────┴──────────────────┐
                            web editor live preview                   PPTX export
                                  └──────── same rendering pipeline ────┘
```

- **This repo**: the engine (packages/*) + web editor + CLI. Zero npm dependencies, zero build steps, fully self-developed
- **[open-pptd-skill](https://github.com/Shingwha/open-pptd-skill)**: the methodology the AI reads (pure markdown) — how to write a good PPTD
- The font library (~155 MB) is not bundled: exports auto-fetch only what a deck actually uses, or pre-fetch everything with `open-pptd assets sync fonts`

## Example gallery

<p align="center">
  <a href="https://shingwha.github.io/open-pptd/editor/?deck=examples%2Fqingshan-coffee-review-12p%2Fdeck.pptd"><img src="docs/images/qingshan.png" width="32%" alt="Qingshan Coffee · H1 2026 business review (all 13 chart types)"/></a>
  <a href="https://shingwha.github.io/open-pptd/editor/?deck=examples%2Fbrand-mori-showcase-7p%2Fdeck.pptd"><img src="docs/images/brand-mori.png" width="32%" alt="MORI brand proposal"/></a>
  <a href="https://shingwha.github.io/open-pptd/editor/?deck=examples%2Fbusiness-review-7p%2Fdeck.pptd"><img src="docs/images/business-review.png" width="32%" alt="Yuanchuan Tech · 2025 annual business review"/></a>
</p>
<p align="center">
  <a href="https://shingwha.github.io/open-pptd/editor/?deck=examples%2Fxiaohongshu-intro-poster%2Fdeck.pptd"><img src="docs/images/xiaohongshu.png" width="27%" alt="open-pptd intro poster (Xiaohongshu)"/></a>
  <a href="https://shingwha.github.io/open-pptd/editor/?deck=examples%2Fposter-artdeco-latelier%2Fdeck.pptd"><img src="docs/images/poster-artdeco.png" width="27%" alt="L'ATELIER · Art Deco fragrance poster"/></a>
  <a href="https://shingwha.github.io/open-pptd/editor/?deck=examples%2Fposter-bailu-solar-term%2Fdeck.pptd"><img src="docs/images/poster-bailu.png" width="27%" alt="Bailu solar-term cultural poster"/></a>
</p>

More examples (data annuals, pitch decks, architecture reviews, festival posters) live in the [online gallery](https://shingwha.github.io/open-pptd/) and the `examples/` directory — every card opens as an editable project.

## CLI quick reference

| Command | What it does |
|---|---|
| `open-pptd serve --project <dir> --detach --json` | Live preview server (`--stop` to end) |
| `open-pptd export <deck.pptd>` | Export PPTX (auto health-checks & fetches fonts; `--json` for structured output) |
| `open-pptd render <deck.pptd>` | Render per-page PNGs |
| `open-pptd check <deck.pptd>` | Validate structure / tokens / geometry / contrast |
| `open-pptd doctor` / `paths` / `assets sync` | Environment self-check / paths / font & icon asset management |

## License

MIT · icons by [Font Awesome Free](https://fontawesome.com/license/free) (CC BY 4.0)
