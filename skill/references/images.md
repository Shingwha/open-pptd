# Images

Images are either **evidence** or **expression**. Mixing them is the most
common serious defect in generated decks. This file is the single rule set for
obtaining, generating, matting, wiring, and checking images.

## 1. Classify the asset first

| Type | Examples | Source rule |
|---|---|---|
| Evidence | Paper figure, micrograph, experiment photo, archival scan, survey chart, news photo | User's original file or the cited publication. **Never generate, never restyle.** |
| Data | KPI series, comparison, result table | User data → native chart/table. Re-plot only with real data and mark "redrawn from [source]". |
| Structure | Flow, architecture, org chart, timeline, relationship | Native shapes, lines, icons, tables. No generation. |
| Brand asset | Logo, VI element, official product shot, official portrait | User-supplied or official source only. Never generate. |
| Expression | Hero, concept illustration, background, texture, transparent object, decorative lettering | User-supplied, licensed stock, or generated **with consent**. |

## 2. Source priority

1. User's original image or the actual figure/table from the paper.
2. Native chart/table re-plotted from reliable data, labelled "redrawn from …".
3. Licensed or official image library / brand asset pack.
4. Generated imagery — expression only, with the user's consent.
5. Native shapes/icons, or omit the image entirely.

Never generate or search for: data, charts, tables, experimental/paper
figures, logos/VI, real people, real products, news scenes. Never fabricate a
source, watermark, magazine cover, or institutional mark.

## 3. Extract evidence from papers and documents

Use what is available; do not hard-depend on one tool: PDF text/image
extraction (e.g. MinerU, PyMuPDF/pdfimages, pdftotext), OCR for scans, pandoc
or docx converters for office files, screenshots for web sources, Pillow for
crop/convert/alpha.

Process:

1. Extract body text, figures, tables, captions, formulas, and citation data.
2. Check each figure for completeness: axes, legends, units, error bars,
   subpanels, annotations. Do not use a truncated or split half-figure.
3. Method diagrams, complex evidence, experiment photos, micrographs, and
   archival material stay **original**. Keep figure/table numbers, captions,
   and source. Do not redraw or generate them.
4. Simple final metrics (result tables, KPIs, comparison values) may be
   re-plotted natively when the data is reliably extracted; verify every number
   and add "redrawn from [source]".
5. Tables: reliable numbers → native table; complex layout → original image.
   Formulas belong in LaTeX/native math; use an image only as a last resort.
6. Store images in `media/`, use `fit: contain`, never crop axes or legends.
   Every figure/table gets a caption and source.
7. If extraction fails, ask for the original or use an explicit placeholder.
   **Never generate something that looks like a paper figure.**
8. Record provenance in `assets-sources.md`: file/URL, author and year, figure
   or table number, license/permission, extraction tool and version, hash.

## 4. Image generation — conditional and consent-gated

### 4.1 Trigger

Ask only when **all** hold:

- the agent actually has an image-generation tool in this session;
- the page plan needs non-evidence visuals (hero, concept, texture, transparent
  object, icon family);
- the kit permits it (academic defaults to no generation).

Default is **no**. Do not ask on a deck that needs no visuals. Ask once, with:
permission, purpose, transparency, privacy (may material/prompts go to an
external service?), and style. If the user declines, never ask again for this
deck; use originals, licensed images, or native graphics.

### 4.2 Allowed and forbidden

Allowed: concept illustration, hero image, background/texture, transparent
objects, an icon family when the built-in set is insufficient, decorative
lettering (verified glyph by glyph, with a native editable title kept).

Forbidden: data/charts/tables, experimental or paper figures, logos/VI, real
people/products/news scenes, unverified text in images, anything that could be
mistaken for evidence.

Academic decks: no generation by default. Business decks: decorative/hero only
after consent. Brand decks: generation may be primary, still consent-gated.

### 4.3 Style contract — one per deck

Write one sentence describing the rendering contract, derived from the design
system and light mode. Examples: "strict pixel grid, no anti-aliasing, ≤14
colors, 1px dark outline, no gradients, no shadows"; "xuan-paper ground,
ink-density gradation, generous emptiness, no saturated fills".

- Generate **families**, not one-offs: one prompt template per family, fixed
  style prefix, only the subject changes. Per-image generation drifts.
- Keep the subject at ~65% of the frame with ≥10% plain margin on every side,
  including effects such as glow or steam.
- Match the placement aspect ratio and generate at ~2× the display resolution.
- Fixed negatives: no text, no watermark, no border (lettering excepted).
- Record `assets-prompts.md`: family, prompt, model/tool/version, seed,
  permission, purpose, matting route.

### 4.4 Lettering

Generated text garbles, Chinese worst of all. Use lettering only for short
display strings, verify every character against the intended string, and keep
a native editable title line beside or below the image (display layer +
native layer). Never let the image replace the whole title.

## 5. Image search

Search only when the agent has a search tool, the page plan needs an external
image, and the user opts in (default no; separate from generation consent).

- Use licensed/official sources; record URL, license, and author.
- Academic decks default to no stock imagery.
- No fabricated attribution, watermarks, covers, or institutional marks.
- Do not use an image you cannot license. When unsure, leave the slot empty and
  ask.

## 6. Transparency

The engine writes PNG/JPEG/GIF bytes; PNG alpha is preserved into the PPTX.
WebP/SVG/AVIF are not supported — convert to PNG first.

Routes, in order of preference:

1. **Native alpha** — the model returns a transparent PNG. Prompt "isolated on
   a transparent background". Least processing.
2. **Key-color matting** — prompt a solid key color far from both the deck
   palette and the subject hues (magenta/green are common), then convert that
   color to alpha. Best for lettering and icons; raise tolerance only to the
   measured color distance of the subject, never past it.
3. **AI matting** — rembg/U2Net-class. Good for silhouettes; weak on fine
   edges, translucency, and lettering outlines.
4. **Base-color avoidance** — prompt the deck background color and rely on a
   full-bleed or clearly zoned placement. Not real alpha; breaks when the
   theme changes or elements overlap.

Rules: transparency is PNG only; JPEG has no alpha and GIF edges are poor.
Inspect on light and dark checker backgrounds for white fringes, halos, holes,
and residual ground color. Do not cut out evidence figures — transparency is
for commercial/brand objects and heroes. Keep a transparent-PNG regression
check when the engine changes.

## 7. Wiring into PPTD

- Files: `media/<family>_<name>.png`. Reference with a path relative to the
  manifest; keep the project self-contained.
- Element: `elementType: image`, `src`, `fit`, optional `crop`, `cropShape`,
  `border`, `shadow`.
  - `contain` — evidence figures, diagrams, screenshots; preserves the whole
    image, may letterbox, never crops data.
  - `cover` — photography where cropping is acceptable.
  - `fill` — stretches and distorts; avoid.
  - `crop` is for design crop only, never for data figures.
- Background: `background: {type: image, src: "media/bg.png", fit: {mode:
  cover}}`. Keep a text-safe zone or add a solid/gradient overlay for
  readability. A full-bleed background must match the canvas aspect ratio.
- Resolution: 2× the display size; do not upscale a low-resolution source.
  Compress large photos; transparent PNGs are heavier, so watch PPTX size.
- Caption and source: every figure/table carries number, caption, source, and
  period. Commercial data charts carry a source line. Generated images are
  expression and are credited as generated/illustrative, never as evidence.
- Provenance: keep `assets-sources.md` and `assets-prompts.md` in the project
  (not referenced by the manifest) so the deck can be audited later.

## 8. QA checklist

- [ ] Every image is classified: evidence, data, structure, brand, expression.
- [ ] Evidence images are original, complete, uncropped, with caption/source.
- [ ] No generated or stock image stands where evidence is expected.
- [ ] Generation/search had consent; prompts/URLs/licenses recorded.
- [ ] Subject is inside margins; aspect matches placement; no visible stretch.
- [ ] Transparent assets: no halo/hole/white fringe on light and dark grounds.
- [ ] Text does not sit on a busy area without a deliberate overlay/safe zone.
- [ ] Images are 2× display resolution and the PPTX size is reasonable.
- [ ] Every image passes "what is lost if I delete it?" — decorative noise goes.

## 9. Kit policy

- **academic** — evidence figures/tables only; no generation; captions and
  sources mandatory; occasional original photo of the setup/materials.
- **business-review** — native charts/tables; optional licensed hero or
  background after consent; source line on every data object.
- **consulting-report** — native structure diagrams and evidence figures;
  minimal photography; no decorative stock.
- **brand-proposal** — expression-led; generated/transparent heroes allowed
  with consent and a style contract; brand assets from the user only.
