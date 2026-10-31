# Academic theme directions

System: `academic`. Default light mode: **all-light**; a sandwich (dark title
and closing, light body) is acceptable for a defense. No all-dark body pages.

The three directions below are **seeds**, not theme files. Pick one, derive the
full standard token set (9 semantic + 3 primary-derived + 4 chart slots), and
write it into `deck.pptd`. Keep one accent family; the `accent` token is a
secondary tone of the same family, not a second decorative color.

## A. Ivory & Oxblood

Archive-paper ground with an annotation vermilion. Humanities, social science,
history, qualitative work.

| Token | Seed |
|---|---|
| bg | `#F7F3E8` |
| text | `#27231F` |
| muted | `#7A7168` |
| line | `#DED5C4` |
| primary | `#8C3B36` |
| accent | `#B5715C` |
| primarySoft | `#F2E7E3` |
| primaryTint | `#E5CFC7` |
| primaryDeep | `#4A1F1C` |

Chart slots: keep the primary ladder plus neutral warm grays; one highlighted
series in primary, the rest muted.

## B. Titanium & Hematoxylin

Titanium-gray ground, pathology purple and eosin pink. Life sciences, medicine,
materials.

| Token | Seed |
|---|---|
| bg | `#E7E8E5` |
| text | `#2B2F33` |
| muted | `#6E7378` |
| line | `#CFD3D2` |
| primary | `#684765` |
| accent | `#C9828B` |
| primarySoft | `#EFE9EE` |
| primaryTint | `#DCCBD9` |
| primaryDeep | `#3B2639` |

Do not fall back to hospital blue/medical green. If the figures use scientific
colors, leave them alone; the page skeleton carries the palette.

## C. Paper & Ink Green

Warm paper, ink green, a brass accent for key numbers. Engineering, climate,
architecture, formal department defenses.

| Token | Seed |
|---|---|
| bg | `#F1E9DA` |
| text | `#27231F` |
| muted | `#8A8175` |
| line | `#DDD2BF` |
| primary | `#355C52` |
| accent | `#B08D3E` |
| primarySoft | `#E7EDE9` |
| primaryTint | `#CBDBD3` |
| primaryDeep | `#1C332D` |

## Font pairings

| Pairing | Use |
|---|---|
| `Source Han Serif CN` (titles/body) + `Microsoft YaHei` (labels/sources) | Chinese academic default; strong serif presence. |
| `LXGW WenKai` (titles/quotes) + `MiSans` (body/captions) | Humanities, warmer voice; keep body sans for screen legibility. |
| `Quattrocento Sans` (Latin display/body) + `Source Han Serif CN` (CJK) | English-first papers with Chinese annotations. |

Registered names only in `deck.pptd` and `fontFamily`. At most two families.
Declare embedded families in `deck.fonts`; a family used only as a system font
is declared without embedding. Never use a display face for body copy.

## Type scale

| Role | px |
|---|---|
| Cover title | 48–64 |
| Page title | 30–36 |
| Section label / kicker | 12–14 (letter-spaced) |
| Body | 17–19 |
| Figure/table caption | 10–12 |
| Source / footnote | 9–10 |
| Key number | 40–64 |

## Motif options

Choose one element group and repeat it: a section index numeral with a thin
rule, a fixed figure-caption mark (number + rule), or a fixed header line
carrying section name and short title. Never a color bar under the title.
