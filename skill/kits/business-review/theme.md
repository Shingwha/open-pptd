# Business-review theme directions

System: `executive`. Default light mode: **all-light**. A sandwich (dark cover
and closing) is acceptable when the deck is presented on stage; body pages stay
light for reading and printing.

The directions below are **seeds**. Pick one, derive the full token set, and
write it into `deck.pptd`. One structural color; the `accent` token is a
secondary tone used for the second chart series and key numbers, not a second
decorative color.

## A. Off-white & Ink Green

Board reporting, operations, finance. Calm and formal without Office blue.

| Token | Seed |
|---|---|
| bg | `#F7F3E8` |
| text | `#1E2A26` |
| muted | `#6E7A72` |
| line | `#DCD6C8` |
| primary | `#123B2F` |
| accent | `#B08D3E` |
| primarySoft | `#E8EFEA` |
| primaryTint | `#CFDDD4` |
| primaryDeep | `#0B241C` |

## B. White & Graphite

Neutral, data-heavy, quarterly review. The safest print-friendly option.

| Token | Seed |
|---|---|
| bg | `#FFFFFF` |
| text | `#1F2328` |
| muted | `#6E7A87` |
| line | `#E8EBED` |
| primary | `#2B2D42` |
| accent | `#4C7A5A` |
| primarySoft | `#EFF1F4` |
| primaryTint | `#D9DEE5` |
| primaryDeep | `#171926` |

## C. Steel & Signal

Manufacturing, supply chain, operations review. A cool field with one warm
signal for exceptions.

| Token | Seed |
|---|---|
| bg | `#F4F7F6` |
| text | `#1A2430` |
| muted | `#6B7A85` |
| line | `#DCE3E6` |
| primary | `#1F3240` |
| accent | `#F0A202` |
| primarySoft | `#E9EFF1` |
| primaryTint | `#CFDCE1` |
| primaryDeep | `#0F1D26` |

The signal color is for exception callouts and one chart series only; it must
not become a header band.

## Font pairings

| Pairing | Use |
|---|---|
| `MiSans` (titles) + `Microsoft YaHei` (body) | Chinese default; clean and available. |
| `LXGW Neo XiHei` (titles/body) + `Alimama ShuHeiTi` (numbers/labels) | Slightly more character; keep the number face for callouts. |
| `Quattrocento Sans` (Latin display) + `Source Han Serif CN` (CJK body) | English-first board decks with a serif reading voice. |

Registered names only; at most two families; declare embedded families in
`deck.fonts` and use them on the page.

## Type scale

| Role | px |
|---|---|
| Cover title | 40–52 |
| Page title (conclusion) | 28–34 |
| Kicker / section label | 11–13 |
| Body | 14–17 |
| Table cell | 12–14 |
| Source / footnote | 9–11 |
| KPI number | 40–64 |
| KPI label | 11–13 |

## Motif options

Choose one: a fixed header with section tab and short title; a page-number
block with the period label; or a small index numeral beside each page title.
Reuse the grammar, never a colored stripe.
