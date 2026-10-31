# Consulting-report theme directions

System: `executive`. Default light mode: **all-light**; a dark section opener
is allowed for a long report. The body stays white/off-white for exhibit
legibility.

The directions below are **seeds**. Pick one, derive the full token set, and
write it into `deck.pptd`. One structural color; the accent marks the
recommended option, the key number, and the second series.

## A. Ink Green & Copper

Strategy, operations, industrial clients. Warm and distinctive without the
default consulting navy.

| Token | Seed |
|---|---|
| bg | `#F6F1E7` |
| text | `#1D2521` |
| muted | `#6E7A72` |
| line | `#DCD3C4` |
| primary | `#1E3B33` |
| accent | `#C15F3C` |
| primarySoft | `#E7EDE9` |
| primaryTint | `#CDDCD3` |
| primaryDeep | `#10231D` |

## B. Slate & Signal

Operations, supply chain, turnaround. Cool, precise, with one warm alarm color.

| Token | Seed |
|---|---|
| bg | `#F4F6F5` |
| text | `#1A2430` |
| muted | `#6B7A85` |
| line | `#DCE3E6` |
| primary | `#1F3240` |
| accent | `#F0A202` |
| primarySoft | `#E9EFF1` |
| primaryTint | `#CFDCE1` |
| primaryDeep | `#0F1D26` |

## C. Ink & Celadon

Digital, consumer, growth strategy. Near-black skeletons with a quiet green.

| Token | Seed |
|---|---|
| bg | `#FFFFFF` |
| text | `#1A1A1A` |
| muted | `#6E7378` |
| line | `#E4E6E5` |
| primary | `#101418` |
| accent | `#3FA68C` |
| primarySoft | `#EDF2F0` |
| primaryTint | `#D5E3DE` |
| primaryDeep | `#0A0D10` |

Avoid deep-navy-plus-gold as an unexamined default; if the client's brand is
navy/gold, derive the palette from the brand, not from a preset.

## Font pairings

| Pairing | Use |
|---|---|
| `MiSans` (titles/numbers) + `Microsoft YaHei` (body) | Chinese default; crisp exhibit titles. |
| `Source Han Serif CN` (titles) + `MiSans` (body) | A more editorial consulting voice; keep serif only for titles and statements. |
| `Quattrocento Sans` (Latin display) + `Source Han Serif CN` (CJK) | English-first decks with a formal reading tone. |

Registered names only; at most two families. Declare embedded families in
`deck.fonts` and use them on pages.

## Type scale

| Role | px |
|---|---|
| Cover title | 40–52 |
| Page title (finding) | 28–34 |
| Exhibit title | 16–20 |
| Body | 14–17 |
| Exhibit label / table cell | 10–14 |
| Source / footnote | 9–11 |
| Key number | 40–64 |

## Motif options

Choose one: a fixed exhibit-number block (`Exhibit 3` + short title), a page
header with the issue-tree branch name, or a small decision-status mark in the
footer. Never a color band or decorative rule.
