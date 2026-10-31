# Preset shapes

Look up `shapeName` here when a page needs a shape. Omit `adjustments` to use
the defaults below; when you pass them, pass the **complete array** in OOXML
order. Values are hundred-thousandths of a percent (100000 = 100%).
Angle parameters are in 1/60000 degree in OOXML; `degrees × 60000`.
`-` means no adjustment.

Use shapes for structure, relationship, flow, and annotation. Shapes hold no
text — place a text box over them. Do not assemble charts from shapes.

## Basic

| shapeName | Description | adjustments (default) |
|---|---|---|
| rect | Rectangle | - |
| roundRect | Rounded rectangle | [corner radius] (16667) |
| ellipse | Ellipse | - |
| triangle | Triangle | [apex x] (50000) |
| rtTriangle | Right triangle | - |
| parallelogram | Parallelogram | [slant] (25000) |
| trapezoid | Trapezoid | [top inset] (25000) |
| nonIsoscelesTrapezoid | Non-isosceles trapezoid | [left, right] (25000, 25000) |
| diamond | Diamond | - |
| pentagon | Regular pentagon | [h, v] (105146, 110557) |
| hexagon | Hexagon | [inset, v] (25000, 115470) |
| heptagon | Heptagon | [h, v] (102572, 105210) |
| octagon | Octagon | [corner cut] (29289) |
| decagon | Decagon | [v] (105146) |
| dodecagon | Dodecagon | - |
| plus | Plus | [arm width] (25000) |
| homePlate | Five-sided arrow | [tip offset] (50000) |
| chevron | Chevron | [tip offset] (50000) |
| pie | Pie | [start°, end°] (0, 16200000) |
| pieWedge | Pie wedge | - |
| arc | Arc | [start°, end°] (16200000, 0) |
| chord | Chord | [start°, end°] (2700000, 16200000) |
| blockArc | Block arc | [start°, end°, thickness] (10800000, 0, 25000) |
| teardrop | Teardrop | [tail] (100000) |
| frame | Frame | [thickness] (12500) |
| halfFrame | Half frame | [h, v] (33333, 33333) |
| corner | Corner | [h, v] (50000, 50000) |
| diagStripe | Diagonal stripe | [width] (50000) |
| foldedCorner | Folded corner | - |
| donut | Donut | [ring width] (25000) |
| noSmoking | Prohibition | [slash width] (18750) |
| heart | Heart | - |
| lightningBolt | Lightning bolt | - |
| sun | Sun | [ray inner radius] (25000) |
| moon | Moon | [crescent width] (50000) |
| cloud | Cloud | - |
| smileyFace | Smiley face | [mouth curve] (4653) |
| bevel | Bevel | [width] (12500) |
| can | Cylinder | [lid height] (25000) |
| cube | Cube | [depth] (25000) |
| funnel | Funnel | - |
| gear6 | Six-tooth gear | [tooth h, tooth w] (15000, 3526) |
| gear9 | Nine-tooth gear | [tooth h, tooth w] (10000, 1763) |
| plaque | Plaque | [corner radius] (16667) |
| doubleWave | Double wave | [amplitude, offset] (6250, 0) |
| wave | Wave | [amplitude, offset] (12500, 0) |
| lineInv | Inverse line | - |

## Rectangle variants

| shapeName | Description | adjustments (default) |
|---|---|---|
| round1Rect | One rounded corner | [radius] (16667) |
| round2DiagRect | Two diagonal rounded corners | [c1, c2] (16667, 0) |
| round2SameRect | Two same-side rounded corners | [top, bottom] (16667, 0) |
| snip1Rect | One cut corner | [cut] (16667) |
| snip2DiagRect | Two diagonal cut corners | [c1, c2] (0, 16667) |
| snip2SameRect | Two same-side cut corners | [top, bottom] (16667, 0) |
| snipRoundRect | One rounded + one cut corner | [radius, cut] (16667, 16667) |

## Stars and bursts

| shapeName | Description | adjustments (default) |
|---|---|---|
| star4 | 4-point star | [inner radius] (12500) |
| star5 | 5-point star | [inner, h, v] (19098, 105146, 110557) |
| star6 | 6-point star | [inner, h] (28868, 115470) |
| star7 | 7-point star | [inner, h, v] (34601, 102572, 105210) |
| star8 | 8-point star | [inner radius] (37500) |
| star10 | 10-point star | [inner, h] (42533, 105146) |
| star12 | 12-point star | [inner radius] (37500) |
| star16 | 16-point star | [inner radius] (37500) |
| star24 | 24-point star | [inner radius] (37500) |
| star32 | 32-point star | [inner radius] (37500) |
| irregularSeal1 / irregularSeal2 | Bursts | - |

## Arrows

All arrows take `[shaft width, arrowhead length]` (50000, 50000) unless noted.

| shapeName | Description | adjustments (default) |
|---|---|---|
| rightArrow / leftArrow / upArrow / downArrow | Directional arrow | [shaft, head] (50000, 50000) |
| leftRightArrow | Two-way arrow | [shaft, head] (50000, 50000) |
| upDownArrow | Two-way vertical | [shaft, head, shaft, head] (50000 ×4) |
| quadArrow | Four-way | [shaft, head w, head l] (22500 ×3) |
| leftRightUpArrow | Three-way | [shaft, head w, head l] (25000 ×3) |
| leftUpArrow | Two-way diagonal | [shaft, head w, head l] (25000 ×3) |
| bentArrow | Bent | [shaft, head w, head l, bend] (25000, 25000, 25000, 43750) |
| bentUpArrow | Bent up | [shaft, head w, head l] (25000 ×3) |
| uturnArrow | U-turn | [shaft, head w, head l, radius, shaft len] |
| circularArrow | Circular | [head w, start°, end°, arc°, tip w] |
| leftCircularArrow | Left circular | [head w, start°, end°, arc°, tip w] |
| leftRightCircularArrow | Two-way circular | [head w, start°, end°, arc°, tip w] |
| curvedRightArrow / curvedLeftArrow / curvedUpArrow / curvedDownArrow | Curved | [head w, curvature, head l] (25000, 50000, 25000) |
| stripedRightArrow | Striped | [shaft, head] (50000, 50000) |
| notchedRightArrow | Notched | [shaft, head] (50000, 50000) |
| swooshArrow | Swoosh | [tail, head] (25000, 16667) |

## Callouts

| shapeName | Description | adjustments (default) |
|---|---|---|
| wedgeRectCallout | Rect callout | [tipX, tipY] (-20833, 62500) |
| wedgeRoundRectCallout | Rounded callout | [tipX, tipY, radius] (-20833, 62500, 16667) |
| wedgeEllipseCallout | Ellipse callout | [tipX, tipY] (-20833, 62500) |
| cloudCallout | Cloud callout | [tipX, tipY] (-20833, 62500) |
| borderCallout1 / callout1 / accentCallout1 / accentBorderCallout1 | Line callout 1 | [Y1, X1, Y2, X2] (18750, -8333, 112500, -38333) |
| borderCallout2 / callout2 / accentCallout2 / accentBorderCallout2 | Line callout 2 | [Y1, X1, kneeY, kneeX, Y2, X2] |
| borderCallout3 / callout3 / accentCallout3 / accentBorderCallout3 | Line callout 3 | [Y1, X1, k1Y, k1X, k2Y, k2X, Y2, X2] |

Callout tip offsets are relative to the shape center, as a percentage of the
shape's width/height; negative means left/above.

## Arrow callouts

| shapeName | adjustments (default) |
|---|---|
| rightArrowCallout / leftArrowCallout / upArrowCallout / downArrowCallout | [shaft, head w, head l, box] (25000, 25000, 25000, 64977) |
| leftRightArrowCallout / upDownArrowCallout | [shaft, head w, head l, box] (25000, 25000, 25000, 48123) |
| quadArrowCallout | [shaft, head w, head l, box] (18515, 18515, 18515, 48123) |

## Brackets, braces, ribbons, scrolls

| shapeName | adjustments (default) |
|---|---|
| leftBrace / rightBrace | [curvature, middle] (8333, 50000) |
| leftBracket / rightBracket / bracePair | [curvature] (8333) |
| bracketPair | [curvature] (16667) |
| ribbon / ribbon2 | [fold h, curvature] (16667, 50000) |
| ellipseRibbon / ellipseRibbon2 | [curvature, mid h, fold h] (25000, 50000, 12500) |
| leftRightRibbon | [fold h, curvature, fold w] (50000, 50000, 16667) |
| horizontalScroll / verticalScroll | [scroll size] (12500) |

## Symbols and tabs

Math: `mathPlus`, `mathMinus`, `mathMultiply`, `mathDivide`, `mathEqual`,
`mathNotEqual` (`[line thickness]` 23520; divide/equal/notEqual add spacing).

Chart: `chartPlus`, `chartStar`, `chartX`. Tabs: `cornerTabs`, `squareTabs`,
`plaqueTabs`. Action buttons: `actionButtonBackPrevious`, `actionButtonBeginning`,
`actionButtonBlank`, `actionButtonDocument`, `actionButtonEnd`,
`actionButtonForwardNext`, `actionButtonHelp`, `actionButtonHome`,
`actionButtonInformation`, `actionButtonMovie`, `actionButtonReturn`,
`actionButtonSound` (no adjustments).

## Flowchart

`flowChartProcess`, `flowChartAlternateProcess`, `flowChartDecision`,
`flowChartDocument`, `flowChartMultidocument`, `flowChartInputOutput`,
`flowChartPredefinedProcess`, `flowChartInternalStorage`, `flowChartManualInput`,
`flowChartManualOperation`, `flowChartPreparation`, `flowChartDelay`,
`flowChartTerminator`, `flowChartConnector`, `flowChartOffpageConnector`,
`flowChartPunchedCard`, `flowChartPunchedTape`, `flowChartCollate`,
`flowChartSort`, `flowChartExtract`, `flowChartMerge`, `flowChartOr`,
`flowChartSummingJunction`, `flowChartOnlineStorage`, `flowChartMagneticDisk`,
`flowChartMagneticDrum`, `flowChartMagneticTape`, `flowChartOfflineStorage`,
`flowChartDisplay` (no adjustments).

## Custom shapes

```yaml
shapeName: custom
viewBox: [1000, 1000]
path: "M500,0 A500,500 0 1 1 499,0 Z M500,200 A300,300 0 1 0 499,200 Z"
```

- Commands: M/L/H/V/C/S/Q/A/Z. Outer contour clockwise (`sweep=1`), inner
  counter-clockwise (`sweep=0`) for a hole.
- The viewBox is stretched to `bounds`; keep `viewBoxW : viewBoxH` equal to
  `bounds.w : bounds.h` to avoid distortion.
- `cropShape` on an image uses the same `{shapeName, adjustments, viewBox,
  path}` structure.
