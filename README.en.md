# open-pptd — Local PPTD Presentation Skill

> 🌏 中文版: [README.md](README.md)

A "content → editable project → live preview → PPTX" presentation pipeline that runs entirely locally.

**See it in action 👉 https://shingwha.github.io/open-pptd/** — no installation needed: click a card to open it in the editor, tweak it freely, export PPTX, or download the project bundle for local editing.

## Example Gallery

<p align="center">
  <a href="https://shingwha.github.io/open-pptd/editor/?deck=examples%2Fbusiness-review-7p%2Fdeck.pptd"><img src="docs/images/business-review.png" width="32%" alt="Yuanchuan Hydrology Annual Report"/></a>
  <a href="https://shingwha.github.io/open-pptd/editor/?deck=examples%2Fcity-cycling-report-7p%2Fdeck.pptd"><img src="docs/images/city-cycling.png" width="32%" alt="Urban Cycling Data Annual"/></a>
  <a href="https://shingwha.github.io/open-pptd/editor/?deck=examples%2Ftide-festival-sponsorship-7p%2Fdeck.pptd"><img src="docs/images/tide-festival.png" width="32%" alt="Tidal Fest Sponsorship Proposal"/></a>
</p>

<p align="center">
  <a href="https://shingwha.github.io/open-pptd/editor/?deck=examples%2Fmiaopai-saas-bp%2Fdeck.pptd"><img src="docs/images/miaopai.png" width="32%" alt="MiaoPai Round-A Pitch"/></a>
  <a href="https://shingwha.github.io/open-pptd/editor/?deck=examples%2Fislelight-brand-book%2Fdeck.pptd"><img src="docs/images/islelight.png" width="32%" alt="Islelight Brand Book"/></a>
  <a href="https://shingwha.github.io/open-pptd/editor/?deck=examples%2Fbrand-mori-showcase-7p%2Fdeck.pptd"><img src="docs/images/brand-mori.png" width="32%" alt="MORI Brand Proposal"/></a>
</p>

<p align="center">
  <a href="https://shingwha.github.io/open-pptd/editor/?deck=examples%2Fshanmingji-2026-launch%2Fdeck.pptd"><img src="docs/images/shanmingji.png" width="32%" alt="Shanmingji Brand Launch"/></a>
  <a href="https://shingwha.github.io/open-pptd/editor/?deck=examples%2Ftech-architecture-review-7p%2Fdeck.pptd"><img src="docs/images/tech-architecture.png" width="32%" alt="Order Platform Architecture Review"/></a>
  <a href="https://shingwha.github.io/open-pptd/editor/?deck=examples%2Fev-range%2Fdeck.pptd"><img src="docs/images/ev-range.png" width="32%" alt="EV Range Prediction"/></a>
</p>

## What It Is

- **PPTD**: a human-readable YAML presentation format — one manifest (`deck.pptd`) + one `pages/*.page` per slide + `media/` images
- A browser editor for live preview / collaborative editing (edit files, refresh to apply), exporting standard `.pptx`; **preview (browser) = export (PowerPoint)** — writer / renderer share the same source
- Capabilities: 13 chart types, 187 preset shapes + custom paths, ~2000 Font Awesome icons (three styles), LaTeX formula mixing, font embedding (subset / complete), fade slide transitions

> Fully self-developed (web editor, PPTX writer, chart & LaTeX rendering, CLI export pipeline) — zero dependencies, no npm install, no network; icons by [Font Awesome Free](https://fontawesome.com/license/free) (CC BY 4.0).

## Installation

The only prerequisite is **Node.js v18+** (Node 21+ recommended for the render command); Chrome / Edge recommended (needed for the "Open Folder" save feature).

Install into your AI tool's **skills folder** (`~/.claude/skills` for Claude Code, `~/.pi/agent/skills` for pi, others per your tool's configuration; all paths inside the skill are relative, so it works wherever you install it) — pick one:

- **Release zip (recommended — no git needed)**: grab `open-pptd-v*.zip` from [Releases](https://github.com/Shingwha/open-pptd/releases) and extract it into the skills folder; overwrite to update
- **git clone (for tracking updates / development)**:

```bash
git clone https://github.com/Shingwha/open-pptd <your-skills-folder>/open-pptd
```

**Font library (optional but recommended)**: font binaries (~155 MB) are not bundled; download before first use. Missing fonts do not block export (embedding is skipped with a warning; falls back to system fonts when opened).

```bash
node bin/open-pptd.js fonts download all          # one-time full download, works offline
node bin/open-pptd.js fonts download Smiley Sans  # on demand, run before export
```

Then hand it to your AI assistant (`SKILL.md` is the full workflow entry point); CLI usage (serve / export / render / check / fonts) via `node bin/open-pptd.js --help`.

## License

MIT
