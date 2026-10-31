# Elements

Common fields (`elementId`, `elementType`, `bounds`, `rotation`, `opacity`,
`flip`) are in `format.md`. Fields below are type-specific.

## text

```yaml
- elementId: body
  elementType: text
  bounds: [64, 140, 560, 300]
  content:
    style: "$body"            # optional theme textStyle reference
    fontSize: 17              # direct fields override the style
    color: "$text"
    lineHeight: 1.5
    align: [left, top]
    text: |
      <p>First paragraph.</p>
      <p style="margin-top:10px">Second paragraph with <strong>emphasis</strong>.</p>
```

`content` fields:

| Field | Notes |
|---|---|
| `text` | Rich text string; use a block scalar. Plain text works: lines become paragraphs. |
| `style` | `"$name"` from `theme.textStyles`. |
| Style | `color`, `fontSize`, `fontFamily`, `bold`, `italic`, `backgroundColor`, `lineHeight` (multiple), `lineHeightPx` (fixed, wins), `letterSpacing`, `marginTop`. |
| Layout | `textDirection: horizontal\|vertical`, `wrap` (default true), `align: [h, v]` where h is left/center/right/justify/distributed and v is top/middle/bottom. |
| Decoration | `gradient` (GradientFill on the glyphs), `shadow: {blur, color, offset}`. |

### Rich text

Supported tags: `<p>`, `<span>`, `<strong>`, `<em>`, `<u>`, `<s>`, `<sup>`,
`<sub>`, `<a href>`, `<ul>/<ol>/<li>`.

- `<p style="...">` supports `text-align`, `line-height` (unitless = multiple,
  `px` = fixed), `margin-top`, `margin-left`, `margin-right`.
- `<li style="...">` adds list styles and letter spacing.
- `<span style="...">` supports `color`, `font-size`, `font-family`,
  `background-color`; inline wins over everything.
- `<a>` gets the link style automatically. Only `https://`, `http://`,
  `mailto:`.
- Prefer multiple `<p>` over `<br/>` when line breaks must survive editing.
- Formulas: LaTeX in `\(...\)`, inline or as a full paragraph, e.g.
  `<p>\(\int_0^1 x^2 \mathrm{d}x = \frac{1}{3}\)</p>`. No rich-text tags inside
  a formula; only color and size are inherited.

## shape

```yaml
- elementId: panel
  elementType: shape
  bounds: [64, 120, 360, 240]
  shapeName: roundRect
  adjustments: [12000]
  fill: { type: solid, color: "$primarySoft" }
  border: { style: solid, width: 1, color: "$line" }
```

Fields: `shapeName`, `adjustments`, `fill`, `border`, `shadow`; custom shapes
add `viewBox: [w, h]` and `path` (svg path string). **Shapes cannot contain
text** — add a separate text box.

- `adjustments` follows OOXML order and is a complete array; values are
  hundred-thousandths of a percent (100000 = 100%). Angle values are in
  1/60000 degree in OOXML; write `degrees × 60000`.
- Custom paths support M/L/H/V/C/S/Q/A/Z. Outer contour clockwise
  (`sweep=1`), inner contour counter-clockwise (`sweep=0`) for a hole. Keep
  `viewBox` ratio equal to `bounds` ratio or the path distorts.
- Use shapes for structure, flow, relationship, and annotation. Charts must be
  native chart elements, never composed shapes.
- Look up names and parameters in `shapes.md`.

## line

```yaml
- elementId: connector
  elementType: line
  bounds: [120, 220, 360, 140]
  viewBox: [360, 140]
  points: "0,70 120,0 240,140 360,20"
  curve: smooth
  arrow: [null, arrow]
  border: { style: solid, width: 2, color: "$accent" }
```

Fields: `viewBox`, `points` (at least two; first/last are the endpoints passed
through, middles are control points), `curve: sharp|round|smooth`,
`arrow: [start, end]` with `arrow|stealth|diamond|oval|null`, `border`,
`shadow`. Keep the `viewBox` ratio equal to `bounds` to avoid stretching.

## image

```yaml
- elementId: figure
  elementType: image
  bounds: [520, 120, 360, 280]
  src: "media/fig-2.png"
  fit: { mode: contain }
  border: { style: solid, width: 1, color: "$line" }
```

Fields: `src` (relative path or https URL, png/jpg/gif), `fit`
(`contain|cover|fill`), `crop` (`left/top/right/bottom` fractions; positive
crops inward, negative pads transparent), `cropShape` (shape definition),
`border`, `shadow`.

Order: `crop` → `fit` → `cropShape`.

- Evidence figures/tables: `fit: contain`, preserve axes, legends, units,
  error bars; never crop data.
- Photography: `cover` may crop; `fill` distorts and is almost never right.
- Local media lives in `media/`; keep the project self-contained. Image rules,
  provenance, and resolution: `images.md`.

## icon

```yaml
- elementId: icon
  elementType: icon
  bounds: [64, 92, 28, 28]
  iconName: "fas:lightbulb"
  fill: { type: solid, color: "$accent" }
```

`iconName` is `style:name` from Font Awesome 7 Free: `fas:` solid (default),
`far:` regular, `fab:` brands. Icons scale proportionally; unknown names are
skipped with a warning. Icons are seasoning at line starts or stat callouts —
never a card-grid filler. `fill` accepts theme tokens or gradients.

## table

```yaml
- elementId: results
  elementType: table
  bounds: [64, 150, 832, 300]
  columnWidths: [0.34, 0.22, 0.22, 0.22]
  rowHeights: [0.2, 0.2, 0.2, 0.2, 0.2]
  style: "$default"
  rows:
    - - text: "Condition"
      - text: "n"
      - text: "Mean"
      - text: "p"
    - - text: "Control"
      - text: "48"
      - text: "12.4"
      - text: "—"
```

Fields: `columnWidths` and `rowHeights` are **ratios in (0,1] summing to 1**;
`rows` is a 2-D array of cells; `style` is `"$name"` or an inline
`TableStyleConfig`; optional `fill`, `shadow`.

Cell fields: `text` (rich text), `textStyle`, text fields (`color`, `fontSize`,
`fontFamily`, `bold`, `italic`, `lineHeight`, …), `fill`, `border`, `align`,
`rowSpan`, `colSpan`.

- Merged cells: declare `rowSpan`/`colSpan`; **omit covered cells entirely** —
  no `null` placeholders.
- Native tables cannot rotate/flip as a whole or take whole-table opacity; if
  that is truly needed, render as an image.
- Table discipline (three-line academic tables, header treatment, alignment,
  sources) is in `design.md` and `quality.md`.
