# Charts

Quantitative relationships get a native `chart` element. Charts are editable
in PowerPoint, retain real numbers, and export without a browser. Never draw a
chart from shapes.

## Element shape

```yaml
- elementId: trend
  elementType: chart
  bounds: [64, 140, 520, 300]
  data:
    cols: [month, actual, target]
    rows:
      - [Jan, 72, 65]
      - [Feb, 85, 70]
      - [Mar, 91, 78]
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

Top level: `data`, `series` (≥1), `seriesDefaults`, `xAxis`, `yAxis`,
`barWidth`, `barGap`, `categoryGap`, `spokeAxis`, `title`, `legend`,
`dataLabels`, `fontFamily`, `fill`, `border`, `shadow`.

The chart element itself has no `type`; each `series[i].type` decides its form.

## Data

```yaml
data:
  cols: [quarter, revenue, cost]     # unique, non-empty names
  rows:
    - [Q1, 120, 220]                 # every row length = cols.length
    - [Q2, null, 182]                # missing = null, not blank commas
```

Numeric channels parse numeric strings; failures are errors. An `encode`
column must exist in `cols`. The same column may feed several series.

## Encoding by type

| type | encode channels | series count / mixing |
|---|---|---|
| bar, line, area | `x` + `y` | may mix with each other, scatter, bubble; bar/line/area also with candlestick |
| scatter | `x` + `y` | same mix; `marker` cannot be false |
| bubble | `x` + `y` + `size` | same mix; `sizeScale: linear\|sqrt\|log` |
| candlestick | `x` + `high` + `low` + `close` + optional `open` | only with bar/line/area; no `open` = HLC |
| pie | `category` + `value` | exactly one series, alone |
| radar | `category` + `y` | only radar series; all share one `category` column |
| waterfall | `x` + `y` + optional `isTotal` (bool) | exactly one series, alone |
| heatmap | `x` + `y` + `value` | exactly one series, alone |
| treemap, sunburst | `category` + `value` + optional `parent` | exactly one series, alone |
| sankey | `source` + `target` + `flow` | exactly one series, alone; DAG only |

## Type notes

- **bar** — `stack: value|percent`; `symbol` for a pictographic bar;
  `barWidth`, `barGap`, `categoryGap`. Horizontal bar when the category axis is
  `yAxis`.
- **line / area** — shared curve fields: `smooth`, `lineStyle`, `width`,
  `marker`, `nullHandling: zero|gap|connect`, `lineColor`. Area adds
  `areaColor` and `stack: value|percent|stream`. Stacked series of one type
  form one stack; mixed stack modes error.
- **scatter / bubble** — multi-series wide tables with `null` padding;
  `dataFilter` can split a long table by column value.
- **candlestick** — provide `open` for OHLC bodies, omit it for HLC; body
  colors via `upBars`/`downBars`, wick via `wickStyle`. Dates are string
  categories at equal spacing.
- **pie** — `innerRadius` for a donut, `startAngle`; clockwise from 12 o'clock;
  `fill` may be an array cycled by slice; labels `value|percentage|category`.
- **radar** — `spokeAxis` controls the shared min/max, spokes, and spider grid.
- **waterfall** — colors via `totalBars`/`increaseBars`/`decreaseBars`; totals
  must reconcile or a warning fires; `isTotal` accepts bool or null only.
- **heatmap** — `colorScheme` endpoints; `colorScale` linear or diverging
  (3 colors); `colorbar` replaces the legend; explicit full grids avoid holes.
- **treemap** — `fill` may be one color, a 1-D array by root, or a 2-D array
  by root/level; children darken 10% lightness per level.
- **sunburst** — same hierarchy fields; `fill` array cycles by top-level node.
- **sankey** — `nodeAlign`, node order is topological, `fill` may be a color,
  array by node, or a map by node name; cycles error.

## Axes, labels, legend

- `xAxis`/`yAxis`: `show`, `type: category|value` (inferred from data by
  default), `min`, `max`, `reverse`, `title`, `label`, `axisLine`, `gridLine`.
- Secondary axis: make `xAxis`/`yAxis` an array and set
  `series[i].xAxisIndex`/`yAxisIndex`. Mix bar/line/area/scatter/bubble freely.
  The secondary axis sits on the value side.
- `legend`: boolean or config; defaults on for most cartesian/pie/radar types,
  off for waterfall/treemap/sunburst/sankey; heatmap uses `colorbar`.
- `dataLabels`: global default, overridable per series; `content` is
  `value`, `percentage`, or `category` depending on type; `numberFormat`
  accepts a small Excel subset (`0`, `0.0`, `0%`, `0.0%`, `#,##0`,
  `0.0E+00`).
- `barGap` is the gap between grouped bars, `categoryGap` the blank share
  between category slots.

## Color

Resolution: explicit series color → `seriesDefaults[type]` → theme cycle
(`primary` → `accent` → `accent3` … `accent6`, in series order).

| type | color fields |
|---|---|
| bar, bubble, scatter | `fill` (scatter also `marker.fill`) |
| line | `lineColor` |
| area, radar | `lineColor` + `areaColor` (area color derives semi-transparent) |
| candlestick | `upBars` / `downBars` / `wickStyle` + overlay series colors |
| pie, treemap, sunburst, sankey | `fill` (single value, array, or map by node) |
| heatmap | `colorScheme` + `colorScale` |
| waterfall | `totalBars` / `increaseBars` / `decreaseBars` |

Series `fill` does not accept an image. Theme tokens work anywhere a color is
accepted, including inside arrays and nested objects.

## Export routing

All 13 types export. 11 export as **native editable PowerPoint charts**: bar,
line, area, scatter, bubble, candlestick, pie, radar, waterfall, treemap,
sunburst. `heatmap` and `sankey` have no native PowerPoint type and export as a
vector picture (renders in PowerPoint 2019+/365, WPS, LibreOffice; data is not
editable). Combo charts and secondary axes are fully supported. Native charts
cannot be rotated/flipped or take whole-chart opacity; use an image only if
that is truly required.

## Design discipline

- De-default the chart: remove default colors, drop vertical grid lines, keep
  at most faint horizontal lines, and show labels only for key points and
  endpoints.
- Label the point, not the series: annotate the inflection, gap, or growth
  rate next to the mark with a leader line; keep a short interpretation beside
  the chart.
- Units belong on the axis title or the source line. Every chart carries a
  source and period line below it.
- One chart may not own half the page width by default — compose it with a
  conclusion column or a second small chart, unless it is the page's single
  evidence object.
- Actual vs forecast: solid vs dashed/hatched, not two unrelated hues.
