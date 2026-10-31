# Lecture theme directions

System: `instructional`. Default light mode: **all-light**; a dark cover and a
dark closing summary are acceptable as a sandwich. Never a dark body page: the
lecture is projected in a lit room and read in notes afterwards.

The three directions below are **seeds**, not theme files. Pick one, derive the
full standard token set (9 semantic + 3 primary-derived + 4 chart slots), and
write it into `deck.pptd`. One accent for the current step or key term; the
`accent` token is a second tone of the same family, not a second color language.

## A. Chalk & Ink

Calm paper white, ink text, a teaching green. The default for science and
quantitative lectures; survives projectors with weak contrast.

| Token | Seed |
|---|---|
| bg | `#FBFAF6` |
| text | `#1F2421` |
| muted | `#6B726C` |
| line | `#DEDCD3` |
| primary | `#1F6B5C` |
| accent | `#4C9A86` |
| primarySoft | `#E8F0EC` |
| primaryTint | `#CBDDD6` |
| primaryDeep | `#0E3A31` |

## B. Blueprint Classroom

Cool white, navy skeleton, one orange marker for the active step. Engineering,
programming, systems, labs.

| Token | Seed |
|---|---|
| bg | `#F5F7FA` |
| text | `#16202B` |
| muted | `#66717E` |
| line | `#D6DEE7` |
| primary | `#1D3F73` |
| accent | `#C2622E` |
| primarySoft | `#E7EDF6` |
| primaryTint | `#C9D8EB` |
| primaryDeep | `#0C2140` |

## C. Studio Amber

Warm studio paper, brown ink, amber highlight. Humanities, design, language,
workshops around a table.

| Token | Seed |
|---|---|
| bg | `#FAF3E6` |
| text | `#2A231C` |
| muted | `#776B5C` |
| line | `#E3D6C2` |
| primary | `#9A4B1E` |
| accent | `#C98A3C` |
| primarySoft | `#F3E7D6` |
| primaryTint | `#E6CFAF` |
| primaryDeep | `#5C2B10` |

## Font pairings

| Pairing | Use |
|---|---|
| `MiSans` (titles/body) + `Microsoft YaHei` (labels/captions) | Chinese lecture default; clean and highly legible at projection size. |
| `Smiley Sans` (titles) + `MiSans` (body) | Younger audiences, workshops, demo-led sessions; body stays neutral. |
| `Source Han Serif CN` (titles/quotes) + `Microsoft YaHei` (body/labels) | Humanities and reading-heavy lectures; serif for voice, sans for steps. |

Registered names only in `deck.pptd` and `fontFamily`. At most two families.
Declare embedded families in `deck.fonts`; a system-only family is declared
without embedding. Never use a display face for step instructions or practice
tasks.

## Type scale

| Role | px |
|---|---|
| Cover title | 52–64 |
| Page title | 32–40 |
| Step numeral / progress marker | 40–56 |
| Body / explanation | 18–22 |
| Example label / code label | 14–16 |
| Practice task | 20–24 |
| Caption / source | 11–13 |
| Key term | 26–34 |

Legibility is a rule, not a style: body never below 18 px in a slide deck.

## Motif options

Choose exactly one element group and repeat it with state changes: a step
counter (`STEP 3 / 6`) fixed in the top-right; a numbered square beside each
objective/practice item; or a fixed left-edge section label carrying the topic
name. Never a color bar, sidebar strip, or decorative underline under the title.
