# Brand-proposal theme directions

System: `editorial`. Default light mode: **sandwich** (dark cover/closing, light
body) or **all-light** with one saturated field; all-dark is allowed only for a
cinematic launch and needs extra contrast discipline.

The directions are **seeds**. Pick one, derive the full token set, and write it
into `deck.pptd`. One signature accent; the `accent` token is a secondary tone
of the same visual language, not a second decorative color.

## A. Klein Blue Paper

Modernist poster energy: paper white, near-black, one blue.

| Token | Seed |
|---|---|
| bg | `#F7F5EF` |
| text | `#101010` |
| muted | `#6E6C66` |
| line | `#D8D7D2` |
| primary | `#0038B8` |
| accent | `#2F5FD0` |
| primarySoft | `#E8EDF8` |
| primaryTint | `#CBD8F0` |
| primaryDeep | `#001F66` |

## B. Ink & Ivory

Luxury/editorial: ivory ground, ink black, a burgundy mark.

| Token | Seed |
|---|---|
| bg | `#F5F0E6` |
| text | `#0D0D0D` |
| muted | `#6B665D` |
| line | `#DCD3C4` |
| primary | `#0D0D0D` |
| accent | `#6D1F2C` |
| primarySoft | `#EFE8DC` |
| primaryTint | `#DFD3C2` |
| primaryDeep | `#000000` |

## C. Stencil Two-Ink

Indie magazine: warm paper, cobalt, fluorescent pink, ink black.

| Token | Seed |
|---|---|
| bg | `#F1E2C2` |
| text | `#171512` |
| muted | `#6B6154` |
| line | `#D4C29C` |
| primary | `#1646B8` |
| accent | `#FF4F87` |
| primarySoft | `#E7D7B6` |
| primaryTint | `#D8C49D` |
| primaryDeep | `#0D2A70` |

The two-ink direction is intentionally loud; keep body text ink black and the
pink to small areas (under 5% on body pages).

## Font pairings

| Pairing | Use |
|---|---|
| `Smiley Sans` (display) + `MiSans` (body) | Chinese brand work with a sharp, contemporary voice. |
| `Source Han Serif CN` (display/body) + `Microsoft YaHei` (labels) | Editorial, culture, fashion, archival. |
| `Oranienbaum` (Latin display) + `Liter` (Latin body) | English-first identity decks; no CJK coverage — pair with a CJK body face if needed. |

Registered names only; at most two families. Declare embedded families in
`deck.fonts` and use them on pages.

## Type scale

| Role | px |
|---|---|
| Cover title | 72–120 |
| Statement / manifesto | 48–72 |
| Page title | 36–48 |
| Section numeral | 72–120 |
| Body | 15–18 |
| Caption / credit | 10–11 |
| Label / index | 9–11 (letter-spaced) |

Poster-level sizes are for covers and statements. Body text stays readable.

## Motif options

Choose exactly one: a section numeral fixed at the top-left; a corner bracket
pair; a repeated overprint mark; or a running issue/volume line. Never a color
bar, sidebar strip, or decorative underline. The motif may change state (number,
inversion) but not shape.
