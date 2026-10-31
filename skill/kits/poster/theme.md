# Poster theme directions

System: `editorial`, single page. Default: **light field**; a dark field is
allowed for evening exhibitions and projection walls, but then the whole poster
must be dark — no dark/light split inside one page.

The three directions below are **seeds**, not theme files. Pick one, derive the
full token set (9 semantic + 3 primary-derived + 4 chart slots), and write it
into `deck.pptd`. A poster carries one accent; the `accent` token is a second
tone of the same language, never a second color story.

## A. Conference Ivory

Ivory paper, ink text, deep teal with a rust mark for key numbers. The default
for academic and public-science posters; reads well under hall lighting.

| Token | Seed |
|---|---|
| bg | `#F7F4EC` |
| text | `#161616` |
| muted | `#6C675E` |
| line | `#DAD2C4` |
| primary | `#14504A` |
| accent | `#B2542D` |
| primarySoft | `#E6EFEC` |
| primaryTint | `#C8DCD6` |
| primaryDeep | `#08302B` |

## B. Poster Blue

Cool paper, near-black, one strong blue and a warm secondary. Engineering,
data, and systems posters; survives a busy hall.

| Token | Seed |
|---|---|
| bg | `#F4F6FA` |
| text | `#10151C` |
| muted | `#65707D` |
| line | `#D4DAE2` |
| primary | `#1D3F8F` |
| accent | `#C2410C` |
| primarySoft | `#E6ECF7` |
| primaryTint | `#C6D3EA` |
| primaryDeep | `#0B1F4D` |

## C. Night Gallery

Charcoal field, warm off-white type, one amber signal. Evening exhibitions,
design and arts posters, screens rather than print.

| Token | Seed |
|---|---|
| bg | `#141414` |
| text | `#F3EEE4` |
| muted | `#A39C8F` |
| line | `#3A3733` |
| primary | `#E0A64A` |
| accent | `#C96F3E` |
| primarySoft | `#242220` |
| primaryTint | `#3A342C` |
| primaryDeep | `#0B0A09` |

Night Gallery is the only allowed dark field. Keep body text off pure white and
check contrast at print size; invert figures only if the source allows it.

## Font pairings

| Pairing | Use |
|---|---|
| `MiSans` (title/body) + `Microsoft YaHei` (labels/references) | Chinese conference default; neutral and legible at distance. |
| `Source Han Serif CN` (title/lead) + `MiSans` (body/labels) | Research posters with a reading tone; serif title, sans evidence. |
| `Smiley Sans` (title) + `MiSans` (body) | Design and public-facing posters; keep every body block in the neutral face. |

Registered names only in `deck.pptd` and `fontFamily`. At most two families.
Declare embedded families in `deck.fonts`.

## Type scale (A2; multiply by 1.41 for A1, 2 for A0)

| Role | px |
|---|---|
| Title | 96–120 |
| Authors | 28–34 |
| Affiliation / venue line | 22–26 |
| Section head | 44–54 |
| Body | 26–30 |
| Key number | 80–120 |
| Figure caption / source | 20–22 |
| References | 18–20 |
| QR label | 18–20 |

Body below 24 px at A2 is a legibility defect, not a style choice.

## Motif options

Choose exactly one: a section numeral in a fixed left rail (`01`, `02`, …); a
hairline rule between blocks at a single weight; or a fixed top-right label
carrying the venue and poster number. Never a color bar, sidebar strip, or a
decorative underline under the title.
