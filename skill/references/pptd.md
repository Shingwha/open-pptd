# PPTD Format Specification

PPTD is a YAML slide DSL that abstracts OOXML themes, layouts, elements, charts,
and formulas. Every page is self-contained; there are no master slides. The CLI
loads a `.pptd` manifest, never an isolated `.page` file.

## 1. Global conventions

### Syntax and geometry

- YAML 1.2. Quote values containing `:`, `#`, `{`, `}`, or use block scalars for
  rich text and markup.
- Geometry is in px; the origin is the top-left. `1px = 1pt` in exported PPTX.
- Recommended canvases: `[960, 540]` for 16:9 and `[720, 540]` for 4:3.
- `bounds: [x, y, width, height]`; later elements paint above earlier elements.
- `rotation` is clockwise degrees; `opacity` is in `[0,1]`; `flip` is
  `[horizontal, vertical]`.

### Multi-file project

```text
project/
  deck.pptd
  pages/
    01_cover.page
    02_method.page
  media/               # when the project uses local media
```

- All project references are relative to the manifest directory and stay inside
  it. Remote `https://` images are the only exception.
- Media formats are PNG, JPEG, and GIF. Convert WebP/SVG/AVIF to PNG first.
- Keep every referenced dependency with the project. A standalone manifest or
  PPTX is not a complete editable deliverable.

### Shared scalar types

```ts
type Color = string                 // #RRGGBB, #RRGGBBAA, or "$token"
type FontFamily = string | { latin: string; ea: string }
type Alignment = ["left"|"center"|"right"|"justify"|"distributed", "top"|"middle"|"bottom"]
type LineStyle = "solid" | "dash" | "dot"
```

`Border` is `{style?, width?, color?}`. `Shadow` is
`{blur, color, offset?: [x,y]}`. Use shadows only when the chosen visual style
needs them; they are not a default hierarchy device.

### Fills

```yaml
fill: { type: solid, color: "$primary" }
```

```yaml
fill:
  type: gradient
  gradientType: linear
  angle: 90
  stops:
    - { position: 0, color: "$primary" }
    - { position: 1, color: "$accent" }
```

```yaml
fill:
  type: image
  src: media/background.png
  fit: { mode: cover }
  opacity: 0.9
```

Gradient angles increase clockwise; `0` is left-to-right and `90` is top-to-bottom.
Do not use gradients as decorative defaults.

### Image fit and crop

`fit.mode` is `contain`, `cover`, or `fill`:

- `contain`: show the complete asset without distortion; required for evidence.
- `cover`: fill the frame proportionally and crop overflow; suitable for photos.
- `fill`: stretch to the frame and distort; almost never appropriate.

`crop` uses proportional `left/top/right/bottom` insets. Crop precedes fit and any
`cropShape`. Never crop axes, legends, units, panel labels, error bars, or
significance marks from evidence figures.

### Style precedence

Text and cells resolve inline rich-text styles first, then direct fields, then a
referenced theme style, then engine defaults. Chart components use their own
component style, then `chart.fontFamily`, then the deck/master font.

`lineHeight` is a multiple; `lineHeightPx` is fixed and wins when both exist.
Text defaults: black, 18px, Microsoft YaHei, line height 1, no background.

## 2. Manifest (`deck.pptd`)

```yaml
version: v2
title: Example presentation
size: [960, 540]
fonts:
  思源宋体: { family: "Source Han Serif CN" }
theme:
  colors:
    primary: "#1D4E89"
    accent: "#C00000"
    bg: "#F5F7FA"
    text: "#182230"
    muted: "#667085"
    line: "#D8E0E8"
    success: "#2F6B57"
    warning: "#B4872D"
    danger: "#BE392D"
    primarySoft: "#EAF1F8"
    primaryTint: "#C7D8EA"
    primaryDeep: "#0D2F55"
    accent3: "#4C83B5"
    accent4: "#86A9C8"
    accent5: "#31587A"
    accent6: "#B8CDDE"
  textStyles:
    title: { fontSize: 32, color: "$text", bold: true, lineHeight: 1.25 }
    body: { fontSize: 17, color: "$text", lineHeight: 1.45 }
    caption: { fontSize: 11, color: "$muted", lineHeight: 1.3 }
  tableStyles:
    default:
      cellStyle: { fontSize: 13, color: "$text", border: { style: solid, width: 1, color: "$line" } }
      firstRowStyle: { fill: { type: solid, color: "$primary" }, color: "#FFFFFF", bold: true }
pages:
  - pages/01_cover.page
  - pages/02_method.page
```

- `version` is required and remains `v2`; this is the PPTD DSL version, not the
  application's marketing version.
- `size` and `pages` are required. Every listed page must exist before checking
  or building.
- `theme.colors` is a flat map referenced as `$key` in color fields. Write the
  full 17-key set: nine semantic colors, `primarySoft/primaryTint/primaryDeep`,
  and `accent3/accent4/accent5/accent6`. Chart slots 1/2 are `primary/accent`.
- `theme.textStyles` and `theme.tableStyles` are named maps referenced with
  `$name`. Never use a preset name such as `theme: "tech"`.
- `fonts` values use `{family: <registered-name>}`. Built-in families are
  embedded as subsets by default. Unknown families without a URL are declared
  only and depend on the opening system. A declared font must actually be used.

### Table styles

A table style supports `cellStyle`, `firstRowStyle`, `lastRowStyle`,
`firstColumnStyle`, `lastColumnStyle`, alternating `bodyStyles`, and
`rowOverColumn`. Cell styles may contain text fields, `fill`, `border`, and
`align`. Border arrays follow `[top,right,bottom,left]`; `null` clears a side.
Two-element border arrays mean `[top-bottom,left-right]`.

## 3. Pages (`pages/*.page`)

```yaml
pageType: content
background: { type: solid, color: "$bg" }
elements:
  - elementId: title
    elementType: text
    bounds: [64, 44, 832, 56]
    content:
      style: "$title"
      text: A precise page title
```

- `pageType` is a label only: `cover`, `table_of_contents`, `chapter`,
  `content`, `final`, or a custom string. It does not force a layout.
- `background` accepts solid, gradient, or image fills. The default is white.
- `notes` is optional presenter speech and is opt-in only. Do not use it for
  design explanations or generation commentary.
- Every `elementId` must be unique within its page.

## 4. Text

```yaml
- elementId: body
  elementType: text
  bounds: [64, 140, 560, 300]
  content:
    style: "$body"
    fontSize: 17
    color: "$text"
    lineHeight: 1.45
    align: [left, top]
    text: |
      <p>First paragraph.</p>
      <p style="margin-top:10px">Second paragraph with <strong>emphasis</strong>.</p>
```

`content` supports `text`, `style`, `color`, `fontSize`, `fontFamily`, `bold`,
`italic`, `backgroundColor`, `lineHeight`, `lineHeightPx`, `letterSpacing`,
`marginTop`, `textDirection`, `wrap`, and `align`. Text decoration supports
`gradient` and `shadow`, but neither is a default.

### Rich text

Supported tags: `<p>`, `<span>`, `<strong>`, `<em>`, `<u>`, `<s>`, `<sup>`,
`<sub>`, `<a href>`, `<ul>/<ol>/<li>`, and `<br/>` for a soft line break.

- `<p>` supports `text-align`, `line-height`, `margin-top`, `margin-left`, and
  `margin-right`.
- `<span>` supports `color`, `font-size`, `font-family`, and `background-color`.
- `<li>` additionally supports list styles and letter spacing.
- Theme references such as `color:$primary` work in inline styles.
- Links support `https://`, `http://`, and `mailto:`.
- Prefer multiple paragraphs over `<br/>` when stable editing breaks matter.

### Formulas

Use LaTeX inside `\(...\)` for inline, standalone, or full-frame formulas:

```yaml
text: |-
  <p>Pythagorean theorem: \(a^2 + b^2 = c^2\)</p>
  <p>\(\int_0^1 x^2 \mathrm{d}x = \frac{1}{3}\)</p>
```

Do not put rich-text tags inside a formula. Formulas inherit only color and font
size from their context and export as native editable PowerPoint formulas.

## 5. Shapes

```yaml
- elementId: panel
  elementType: shape
  bounds: [64, 120, 360, 240]
  shapeName: rect
  fill: { type: solid, color: "$primarySoft" }
  border: { style: solid, width: 1, color: "$line" }
```

Shapes support `shapeName`, `adjustments`, `fill`, `border`, and `shadow`.
`adjustments` follows the complete OOXML parameter array in `shapes.md`; angle
values are degrees × 60000. Shapes cannot contain text; overlay a text element.

Custom shapes use:

```yaml
shapeName: custom
viewBox: [1000, 1000]
path: "M500,0 A500,500 0 1 1 499,0 Z M500,200 A300,300 0 1 0 499,200 Z"
```

Paths support `M/L/H/V/C/S/Q/A/Z`. Keep the viewBox ratio equal to the bounds
ratio. Use a clockwise outer contour and counter-clockwise inner contour for a
hole. Shapes represent structure, flow, relationships, and annotation; never
assemble a quantitative chart from rectangles.

## 6. Lines

```yaml
- elementId: connector
  elementType: line
  bounds: [120, 220, 360, 140]
  viewBox: [360, 140]
  points: "0,70 120,0 240,140 360,20"
  curve: sharp
  arrow: [null, arrow]
  border: { style: solid, width: 2, color: "$primary" }
```

- `points` contains at least two points inside `viewBox`; the first and last are
  endpoints and intermediate points control the curve.
- `curve` is `sharp`, `round`, or `smooth`.
- Arrows are `[start,end]` with `arrow`, `stealth`, `diamond`, `oval`, or `null`.
- Keep viewBox and bounds ratios equal to avoid distortion.

## 7. Images

```yaml
- elementId: figure
  elementType: image
  bounds: [520, 120, 360, 280]
  src: media/fig-2.png
  fit: { mode: contain }
  border: { style: solid, width: 1, color: "$line" }
```

Images support `src`, `fit`, `crop`, `cropShape`, `border`, and `shadow`.
`cropShape` accepts the same shape definition fields as a shape.

Evidence comes from the user's original material or the cited publication. Never
generate or restyle experimental figures, data charts, logos, real people,
products, or archival documents. Generated expression requires consent and must
never stand in for evidence. Keep original figures complete, uncropped, and at
sufficient resolution. Every figure gets a number, caption, condition, source,
and period.

## 8. Icons

```yaml
- elementId: icon
  elementType: icon
  bounds: [64, 92, 28, 28]
  iconName: "fas:lightbulb"
  fill: { type: solid, color: "$primary" }
```

Use Font Awesome Free: `fas:` solid, `far:` regular, and `fab:` brands. Icons
scale proportionally inside bounds. Unknown names are skipped with a warning.
Use icons sparingly at line starts or metric callouts, never as a card-grid
substitute or evidence.

## 9. Tables

```yaml
- elementId: results
  elementType: table
  bounds: [64, 150, 832, 300]
  columnWidths: [0.34, 0.22, 0.22, 0.22]
  rowHeights: [0.2, 0.2, 0.2, 0.2, 0.2]
  style: "$default"
  rows:
    - - text: Condition
      - text: n
      - text: Mean
      - text: p
    - - text: Control
      - text: "48"
      - text: "12.4"
      - text: "—"
```

- `columnWidths` and `rowHeights` are ratios in `(0,1]`, each summing to 1.
- Cells support rich text, text styles, fills, borders, alignment, `rowSpan`, and
  `colSpan`.
- Omit positions covered by a merge; do not insert `null` placeholders.
- Native tables cannot be rotated/flipped or take whole-table opacity.
- Use consistent units and decimal precision. Every table gets a number, caption,
  measurement basis, and source. Academic tables normally use three-line rules;
  executive tables may use a dark header with horizontal rules.

## 10. Charts

A chart has no top-level `type`; each `series[i].type` determines its form.
Thirteen types are supported: `bar`, `line`, `area`, `scatter`, `bubble`,
`candlestick`, `pie`, `radar`, `waterfall`, `heatmap`, `treemap`, `sunburst`, and
`sankey`.

```yaml
- elementId: trend
  elementType: chart
  bounds: [64, 140, 520, 300]
  data:
    cols: [month, actual, target]
    rows:
      - [Jan, 72, 65]
      - [Feb, 91, 78]
  yAxis: { min: 0, max: 100, gridLine: { color: "$line" } }
  series:
    - type: line
      encode: { x: month, y: actual }
      name: Actual
      lineColor: "$primary"
      width: 3
    - type: line
      encode: { x: month, y: target }
      name: Target
      lineColor: "$muted"
      lineStyle: dash
```

### Data and encoding

`data.cols` contains unique non-empty names. Every row has the same length. Use
`null` for missing numeric cells. Numeric channels must parse as numbers.

| Type | Encode channels | Mixing |
|---|---|---|
| bar / line / area | `x` + `y` | May mix with each other, scatter, and bubble; candlestick may also mix with bar/line/area |
| scatter | `x` + `y` | Cartesian mix |
| bubble | `x` + `y` + `size` | Cartesian mix; `sizeScale: linear|sqrt|log` |
| candlestick | `x` + `high` + `low` + `close` + optional `open` | Only bar/line/area overlays |
| pie | `category` + `value` | Exactly one series, alone |
| radar | `category` + `y` | All series share category |
| waterfall | `x` + `y` + optional `isTotal` | Exactly one series, alone |
| heatmap | `x` + `y` + `value` | Exactly one series, alone |
| treemap / sunburst | `category` + `value` + optional `parent` | Exactly one series, alone |
| sankey | `source` + `target` + `flow` | Exactly one series, alone; DAG only |

### Chart fields

Top-level fields include `data`, `series`, `seriesDefaults`, `xAxis`, `yAxis`,
`barWidth`, `barGap`, `categoryGap`, `spokeAxis`, `title`, `legend`, `dataLabels`,
`fontFamily`, `fill`, `border`, and `shadow`.

- Axes support `show`, `type`, `min`, `max`, `reverse`, `title`, `label`,
  `axisLine`, and `gridLine`.
- For a secondary axis, make the axis an array and set `xAxisIndex` or
  `yAxisIndex` on the relevant series. Bar, line, area, scatter, and bubble can
  form combo charts.
- `legend` is `false`, `true`, or `{show, position, color, fontSize}`.
- `dataLabels` supports `show`, `content`, `numberFormat`, `color`, and
  `fontSize`. Allowed content depends on the series type; use `value` for most
  Cartesian charts, `percentage` where meaningful, and `category` for hierarchy.
- Excel number formats include `0`, `0.0`, `0%`, `0.0%`, `#,##0`, and `0.0E+00`.

### Series styling

Common linear fields: `smooth`, `lineStyle`, `width`, `marker`, `nullHandling`,
`lineColor`; area and radar add `areaColor`. Bars, bubbles, and scatter use
`fill`. Pie/treemap/sunburst/sankey accept color arrays or the documented node
mapping. Waterfall uses `totalBars`, `increaseBars`, and `decreaseBars`.
Heatmap uses `colorScheme`, `colorScale`, and `colorbar`.

Series color precedence is explicit series field → `seriesDefaults[type]` →
theme cycle (`primary`, `accent`, `accent3`…`accent6`). Theme tokens work in
nested color fields and arrays. Keep scientific encodings unchanged.

### Export behavior and discipline

- Eleven types export as native editable PowerPoint charts. Heatmap and sankey
  export as vector pictures because PowerPoint has no native equivalent; their
  data is not editable in PowerPoint.
- Native charts cannot be rotated/flipped or take whole-chart opacity.
- Numbers with axes require a native chart, never hand-drawn shapes.
- Give each chart one message, preserve units and the comparison baseline, remove
  heavy grids and redundant legends, and annotate only decisive points.
- Every chart has a source and period line below it. Label estimates and
  forecasts distinctly from observed results.

## 11. Validation and failure modes

Run `open-pptd check /abs/path/project/deck.pptd` after the first full pass and
after fixes. Errors block; warnings require judgement. Build commands run a full
check before producing artifacts.

Check at least:

- required fields, types, unique ids, and canvas bounds;
- unresolved `$tokens` or `$styles`, incomplete theme colors, and font names;
- missing or external resource paths and unsupported media formats;
- text overflow, unintended overlap, contrast, and distorted images;
- figure/table captions, units, periods, sources, and comparison baselines;
- evidence boundaries, placeholders, and unsupported visual claims.

Never invent data, citations, cases, results, logos, or sources. Missing material
stays an explicit placeholder. Do not claim PowerPoint/WPS/Keynote playback
compatibility solely because an export completed.
