# Tests

Four layers: **automated regression** (`regression/`, machine-verified by npm test), **component test projects** (`projects/`, export regression + manual PowerPoint verification), **E2E** (`e2e/`, real browser), and **diagnostic tools** (`tools/`, manual triage, not part of the regression).

```
tests/
  run-all.mjs            one-shot regression entry (npm test)
  lib/                   shared test helpers
    run.js               subprocess execution (used by run-all)
    unzip.js             minimal ZIP reader (regression reads pptx parts)
  contract/              package-level public contract (export surface / CONTRACT_VERSION)
  regression/            automated regression (pure Node, all in npm test)
    dep-graph.mjs        architecture gate: dependency direction + environment-global scan (v3)
    validate.mjs         validator + check command + export gate
    background-size.mjs  background cover crop follows deck.size
    color-consistency.mjs  preview/export color consistency
    theme-presets.mjs    theme preset data + normalizeTheme behavior
    preset-shapes.mjs    full preset-shape regression (187 prst + custGeom + XML well-formedness)
    package-integrity.mjs  PPTX in-package reference integrity (also called per project by run-all)
    formula.mjs          formula conversion regression (204 cases vs frozen Microsoft XSLT references)
    icon.mjs             icon export regression (SVG embedding, preview == export)
    line.mjs             line export regression (multi-point curve xfrm + smooth last anchor)
    handle-io.mjs        local project handle read/write (mock handles)
    export-media.mjs     project package image integrity
    resource-paths.mjs   contract 5 resource resolution long-term guard
    measure.mjs          measure package (pure functions + DOM cross-check)
    layout.mjs           layout package (LayoutTree shape / overflow facts / determinism)
  fixtures/
    formula/             formula corpus: formulas.txt (204 cases) + omml-ai/ (frozen official references)
                         + mml/ (KaTeX intermediate output, not committed; npm run test:fixtures)
  golden/                golden baseline: manifest.json (per-page fingerprints) + whitelist.json
  projects/              component test projects (one per component; run-all auto-discovers and
                         runs the export regression; can also be serve'd to the editor for manual
                         preview + export verification)
    text/                text: rich text / formula mixing / gradient / shadow / align / layout / icons /
                         color system / font system (8 pages)
    shape/               shapes: all 187 ECMA-376 presets + custom-path custGeom (8 pages)
    line/                lines: sharp / round / smooth + arrows + color variants (2 pages)
    image/               images: the full crop → fit → cropShape pipeline (1 page)
    icon/                icons: Font Awesome fas:/far:/fab: + gradient/HEX8/wide icons (2 pages)
    table/               tables: styles / borders / align / merge / fills / fonts / colors (9 pages)
    chart/               charts: bar/pie/line/area/scatter etc., all types (24 pages)
    notes/               notes: speaker notes + text (5 pages)
    font-embed/          font embedding: font-library cards (7 pages; a missing font only warns, never embeds)
    <project>/reference/ PowerPoint structural baseline (hand-made, for comparison, not in the regression)
    <project>/out/       export artifacts (iso-* isolated pages / check-* full decks, gitignored)
  tools/                 diagnostic tools (manual triage, not in npm test)
    isolate.mjs          per-component per-page isolated export (locate PowerPoint's "repair" prompt)
    dump-formula-mml.mjs formula corpus → KaTeX MathML (npm run test:fixtures)
    ui-shots.mjs         UI screenshot walkthrough (editor/gallery × desktop/narrow → tests/ui-shots-out/)
    golden-render.mjs    write the golden baseline (render every project page to PNG + manifest.json)
    golden-diff.mjs      compare the current render against the baseline (drift gate)
    golden-run.mjs       shared runner for golden-render / golden-diff
    golden-lib.mjs       shared PNG decode + perceptual hash library
  e2e/                   real browser (needs local Chrome/Edge, driven over CDP)
    render.mjs           render smoke: headless per-page PNG (npm run test:render)
    incremental-load.mjs progressive load: a project being written shows page by page (npm run test:incremental)
```

## One-shot regression

```bash
npm run test:fixtures   # first run: generate the KaTeX intermediate output for the formula corpus
                        # (tests/fixtures/formula/mml/, not committed)
npm test                # one-shot regression
```

Flow: `tests/projects/` auto-discovers every component project and exports it (artifacts to `<project>/out/check-<project>.pptx`) → package-integrity check on each artifact → run every suite in `regression/`.

**Extension conventions**:
- New component test project → drop `<name>/deck.pptd` + `pages/` into `tests/projects/`; run-all picks it up with no code change.
- New automated regression → add a `.mjs` under `tests/regression/` (zero dependencies, exit code encodes pass/fail) and one line to `suites` in `run-all.mjs`.

## Component test projects (manual PowerPoint verification)

```bash
# start the editor mounted on a component project
node bin/open-pptd.js serve --project tests/projects/table
# open the printed URL in a browser → check the preview → web export → open in PowerPoint
```

Key checks: **no repair prompt** + render matches preview. Any "effect" code change must go through this step (a correct preview does not imply a correct export; schema violations are repaired silently by PowerPoint).

### Per-project coverage

| Project | Pages | Coverage |
|---|---|---|
| text | 1_cover | dark background + gradient title |
| | 2_richtext | full rich-text tag set (strong/em/u/s/sup/sub/ul/ol/a) |
| | 3_formula | LaTeX formula mixing (inline + standalone + alignment) |
| | 4_layout | layout fields (align/wrap/textDirection/defaults) |
| | 5_effects | element-level transforms (rotation/opacity/flip) + text decoration |
| | 6_icons | icons embedded in rich text |
| | 7_colors | color system: 9 theme-color references / HEX6 / HEX8 alpha / inline span color / background highlight / double gradient |
| | 8_fonts | font system: official font list / {latin,ea} split / inline span font / size-weight combinations |
| table | 01-table | $default basics (blue header / zebra / light gray border) |
| | 02-styles | multiple tableStyles (compact/colorful) compared |
| | 03-borders | BorderSpec per-side / dashed-dotted / null clearing / category-style outline / cell-level override |
| | 04-align | CellStyle.align horizontal×vertical + cell-level override |
| | 05-merge | rowSpan/colSpan merge (official omission rules) |
| | 06-fills | Table.fill whole-table / inline cell (incl. gradient) / theme-reference fill / rich-text cell |
| | 07-fonts | cellStyle.fontFamily / {latin,ea} / category-style font / inline span |
| | 08-colors | theme-color text / HEX6 / HEX8 / background highlight / decoration combinations |
| icon | 01-icon | Font Awesome (fas/far/fab) + gradient + brand icons |
| | 02-colors | theme-color reference / HEX8 alpha / multiple gradients / stacking on light and dark |
| line | 01-curve | straight/diagonal/arrow/sharp/round/smooth |
| | 02-colors | theme color / dashed-dotted / width / arrow color / polyline color / HEX8 |
| shape | 01-07 | all 187 preset shapes (7-page layout) |
| | 08-custom | custom-path custGeom (all M/L/C/A commands + full-circle split) |
| chart | 01-24 | all chart types + axes / secondary axis / colors / property variants |
| notes | 01-05 | speaker notes / text mixing / notes combined with charts |
| font-embed | 1-7 | font-library cards (embed vs fallback; verify visually in PowerPoint) |

## Locating a repair prompt

```bash
node tests/tools/isolate.mjs
```

Exports each page of each project as `tests/projects/<project>/out/iso-<project>-NN.pptx`.
Open them one by one in PowerPoint: the file that triggers "repair" points at the component
on that project page (for shapes, you can bisect further with the artifacts from
`tests/regression/preset-shapes.mjs`).

## E2E (real browser, needs Chrome/Edge)

```bash
npm run test:render           # render smoke (headless per-page PNG: count/size/non-empty/process exit)
npm run test:incremental      # progressive load (a project being written shows page by page + SSE refresh + broken-page placeholder)
```
