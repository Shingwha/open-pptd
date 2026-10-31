# PPTD format essentials

Read this when writing a manifest or a page shell. Element fields are in
`elements.md`; charts in `charts.md`; shape names in `shapes.md`.

## Project layout

```text
project/
  deck.pptd        # manifest: size, theme, fonts, ordered page list
  pages/
    01_cover.page
    02_gap.page
  media/           # only when the deck uses local images
```

- All references are **relative to the manifest's directory** and must stay
  inside the project folder. A remote `https://` image is the only exception.
- The manifest is the entry point. A `.page` file cannot be checked or built
  on its own.
- Media formats: PNG, JPEG, GIF. Convert WebP/SVG/AVIF to PNG first.

## YAML and units

- YAML 1.2. Quote values containing `:`, `#`, `{`, `}`, or use a block scalar
  (`|`) for rich text and copy with markup.
- Geometry is in px; `(0,0)` is the top-left of the page. `1px = 1pt` in the
  exported PPTX. Recommended canvases: `[960, 540]` (16:9) and `[720, 540]`
  (4:3).
- `bounds: [x, y, width, height]`. Elements are painted in array order; later
  elements sit above earlier ones.

## Manifest (`deck.pptd`)

```yaml
version: v2              # required, literal v2
title: Deck title        # optional
size: [960, 540]         # required
fonts:                   # optional; font slots for embedding
  思源宋体: { family: "Source Han Serif CN" }
theme:
  colors: { ... }        # $token source; write the full set
  textStyles: { ... }    # named text styles referenced by style: "$name"
  tableStyles: { ... }   # named table styles referenced by style: "$name"
pages:                   # ordered page files
  - pages/01_cover.page
  - pages/02_gap.page
```

- `fonts` keys are readable slot names; `family` is the **registered family
  name** (name-table ID16 first, ID1 fallback). A family present in the
  built-in library, or carrying a `url`, is embedded (subset by default). A
  family not in the registry and without a `url` is declared only — a system
  font that depends on the opening machine.
- A font must actually be used by a page or text style. Declaring it without
  any reference makes PowerPoint drop the embedded font.
- Do not leave `pages` entries pointing at files that will never exist. While
  previewing, missing pages are skipped; before `check`/`build`, every listed
  page must exist.

## Theme

`theme.colors` is a flat map of named colors. Pages reference them as
`"$primary"`, `"$text"`, etc., in any color/fill field.

Write the full standard set so tokens and chart series never dangle:

| Group | Keys |
|---|---|
| Semantic | `primary`, `accent`, `bg`, `text`, `muted`, `line`, `success`, `warning`, `danger` |
| Primary-derived | `primarySoft`, `primaryTint`, `primaryDeep` |
| Chart slots | `accent3`, `accent4`, `accent5`, `accent6` (slots 1/2 are `primary`/`accent`) |

`design.md` explains how to choose values; never emit a partial set and never
reference a preset by string (`theme: "consult"` is not valid 3.0).

`theme.textStyles` names reusable text styles (title, subtitle, body, caption,
quote are conventional). `theme.tableStyles` names reusable table styles.
Both are plain maps; a page references a style by `"$name"`.

```yaml
theme:
  colors:
    primary: "#18324E"
    accent: "#B08D3E"
    bg: "#FFFFFF"
    text: "#1F2428"
    muted: "#6E7A87"
    line: "#E8EBED"
    success: "#33A362"
    warning: "#B4872D"
    danger: "#BE392D"
    primarySoft: "#EFF2F5"
    primaryTint: "#D7E0EA"
    primaryDeep: "#0A1929"
    accent3: "#38996F"
    accent4: "#3F45AB"
    accent5: "#6BAF41"
    accent6: "#9C513A"
  textStyles:
    title: { fontSize: 34, color: "$text", bold: true, lineHeight: 1.25 }
    body: { fontSize: 17, color: "$text", lineHeight: 1.5 }
    caption: { fontSize: 11, color: "$muted", lineHeight: 1.3 }
  tableStyles:
    default:
      cellStyle: { fontSize: 13, color: "$text", border: { style: solid, width: 1, color: "$line" } }
      firstRowStyle: { fill: { type: solid, color: "$primary" }, color: "#FFFFFF", bold: true }
      bodyStyles:
        - { fill: { type: solid, color: "$primarySoft" } }
        - { fill: { type: solid, color: "#FFFFFF" } }
```

Style precedence, simplified:

- Text: inline `<span>` / paragraph `<p>` styles → fields directly on
  `content` → referenced `$textStyle` → engine defaults.
- Table cells: cell fields → `textStyle` → row/column category styles →
  `bodyStyles` (cycled) → `cellStyle` → defaults. `rowOverColumn` default true.
- Charts: series fields → `seriesDefaults[type]` → theme color cycle; text
  falls back through the component → `chart.fontFamily` → theme.

## Page (`*.page`)

```yaml
pageType: content          # optional label; cover / table_of_contents /
                           # chapter / content / final, or a custom string
background:                # optional; default white solid
  type: solid
  color: "$bg"
notes: |                   # optional; speaker notes, opt-in only
  What to say on this page.
elements:
  - elementId: title
    elementType: text
    bounds: [64, 44, 832, 56]
    content:
      style: "$title"
      text: Conclusion sentence as the page title
```

- `pageType` is a label only; it does not render and does not force a layout.
- Background accepts the same fill forms as elements: solid, gradient, image.
  For a background image use `fit: {mode: cover}` and keep a text-safe zone.
- `notes` is presenter speech, not design commentary. Omit it unless the user
  opted in.

## Element base

```yaml
elementId: unique-id        # unique within the page
elementType: text           # text | shape | line | image | icon | table | chart
bounds: [x, y, w, h]
rotation: 0                 # optional, degrees clockwise
opacity: 1                  # optional, [0,1]
flip: [false, false]        # optional, [horizontal, vertical]
```

Every element shares these. Fields by type are in `elements.md`.

## Validation and failure modes

`open-pptd check` reports schema errors, unknown types, bad bounds, missing
tokens/resources, geometry overflow/overlap, and contrast. Errors block
export; warnings do not. Common causes:

- a `$token` not defined in `theme.colors`, or a `$style` not defined in
  `theme.textStyles`;
- `bounds` outside the canvas or text that outgrows its declared height
  (geometry warnings);
- media path outside the project or a missing file;
- font family typo — the deck still builds, but the font is skipped;
- table `columnWidths`/`rowHeights` not summing to 1.
