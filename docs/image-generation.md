# AI Image Generation Guide（设计稿）

When (and only when) a deck needs generated visual assets — decorative lettering, illustrations, icon families, texture backgrounds, motif elements — how to keep them **on-contract** with the deck's style and **background-clean**. Read on demand: most pages need zero generated images, and the image-abuse red line in the general rules always applies. Generation is a style carrier, not a filler.

## 1. What to generate — and what never to

Worth generating (by value):

1. **Decorative lettering (title wordmarks)** — art-font display titles no font library can provide (pixel, brush, hand-lettered). Use the **dual-layer pattern**: the lettering image as the display layer, plus a native editable title line beside or below it (searchable, editable, survives export). The lettering image is decoration; the real title stays native text.
2. **Hero illustrations** — cover, section, and content-page main visuals whose style must obey the deck's anchors. This is the core advantage over stock search: the style follows your deck, not the stock library's.
3. **Icon families** — industry-specific semantics beyond the built-in 195 icons (catering, medical devices, industrial flows). Generate one consistent family; never mix generated icons with built-in ones on the same page.
4. **Texture / material backgrounds** — paper grain, glow washes, ink diffusion. One large image as `background: {type: image, ...}` beats shapes faking texture. Keep a text-safe zone or add an overlay for readability.
5. **Motif assets** — when the signature motif is illustrative (corner brackets, progress ornaments), a generated element family reused at the same scale across pages is more distinctive than composed shapes.

Never generate:

- **Charts / data visualizations** — native, editable, numerically accurate; generated charts are decorations that lie.
- **Text-heavy images** — generated text garbles, Chinese worst of all. Lettering is the only exception: short strings, quoted exactly, verified glyph by glyph.
- **Photos where authenticity matters** — news, real people, real cases, evidence. Illustration styles avoid the trap; photorealism does not.
- **Brand logos** — copyright; the user supplies them.

## 2. Style contract (one sentence per deck, shared by every asset)

- Add an `images` line to the design anchors stating the rendering contract, derived from the chosen style entry and light mode. Examples — retro-pixel: "strict pixel grid, no anti-aliasing, ≤14 colors, 1px dark outline, no gradients, no shadows"; ink-wash: "xuan-paper ground, ink-density gradation, generous emptiness, no saturated fills".
- **Generate as families, never per-image**: one prompt template per family (fixed style prefix, swap only the subject), generated in one batch or one grid sheet. Per-image generation drifts in style. Family naming is the asset manifest: `dish_*` / `prop_*` / `hud_*` / `letter_*` / `scene_*` / `texture_*`.
- **Composition margin**: the subject fills ~65% of the frame with ≥10% plain background on every side — steam, glow, and effects included. Edge-touching details get eaten by cropping and matting.
- **Fixed negative prompt**: no text, no watermark, no border — lettering excepted (its string is quoted exactly).
- **Match the placement aspect ratio** with ~2× resolution headroom; a large ratio mismatch crops the subject under `fit`.
- Record each family's prompt template in a project-local `assets-prompts.md` (not referenced by the manifest; traceability only).

## 3. Transparent backgrounds — four routes, pick by what your model can do

There is no universal answer; pick the first route your tool supports and note it in the anchors.

| Route | When | How |
|---|---|---|
| **Native alpha** | The model outputs transparent PNG directly | Prompt "isolated on a transparent background". Least processing; use when available. |
| **Key-color matting** (primary) | Any model with solid backgrounds | Prompt "isolated on a solid `#FF00FF` background"; post-process the key color to alpha. |
| **AI matting** (fallback) | Arbitrary solid backgrounds, no key control | rembg/U2Net-class local matting. Good on silhouettes; weak on fine translucency and on lettering outlines. |
| **Base-color avoidance** (no matting) | Full-bleed or clearly zoned images | Prompt the deck background color as the ground ("on a `#1A1C2C` background"). Fakes alpha visually; breaks on theme change or element overlap — full-bleed/zoned use only. |

**Key-color rules**: choose the key far from both the deck palette and the subject hues (magenta/green are usual, but pick per deck); raise the matting tolerance only up to the measured color distance to the subject, never past it; inspect for halos and holes on a checker background.

Minimal matting snippet (any machine with Python):

```python
from PIL import Image
im = Image.open("in.png").convert("RGBA")
key = (255, 0, 255)                       # the prompted key color
tol = 40                                  # color-distance tolerance
px = im.load()
for y in range(im.height):
    for x in range(im.width):
        r, g, b, a = px[x, y]
        if (r-key[0])**2 + (g-key[1])**2 + (b-key[2])**2 <= tol**2 * 3:
            px[x, y] = (r, g, b, 0)
im.save("out.png")
```

**Lettering specifics**: outlines and highlights hug the glyph edge — key-color matting first, never AI matting (it eats the edge detail). And generated Chinese glyphs are frequently wrong: verify every character of a lettering string before using it; a wrong glyph in a hero title is a deck-fatal defect.

## 4. Prompt template

```
[style prefix — the deck's images contract, verbatim]
+ [subject — one per image, from the family list]
+ [composition — centered, ~65% of frame, ≥10% plain margin]
+ [background — transparent / isolated on solid #KEY / on #deck-bg]
+ [negatives — no text, no watermark, no border]
```

Two worked examples:

- retro-pixel dish sprite: "strict 8-bit pixel grid, no anti-aliasing, ≤14-color retro palette, 1px dark outline, block silhouette, slight top-down view; a bowl of hot dry noodles; centered, 65% of frame, plain margin all sides; isolated on solid #FF00FF; no text, no watermark, no border"
- hand-drawn icon (family member): "hand-drawn marker style, uniform 2px ink outline, flat fills, slight paper grain; a steamer basket; centered square composition with margin; isolated on transparent background; no text, no watermark"

## 5. Wiring into PPTD

- **Elements**: `elementType: image` with `src: media/<family>_<name>.png`; `fit`/`crop`/`cropShape`/`rotation`/`opacity` as needed. Family members reused across pages keep the same bounds scale (a HUD icon at 22px on every page is a motif; the same icon at 22px then 90px is noise).
- **Backgrounds**: `background: {type: image, src: ..., fit: {mode: cover}}` — generate at canvas aspect, keep a text-safe zone or overlay.
- **Lettering dual-layer**: lettering image on top, native title text kept in the page (see §1.1); the image never replaces the editable title entirely.
- **Verification**: every matted asset gets one editor-preview look (checker test for halos, overlap test against page elements, stretch test against `fit`).

## 6. Per-family quality checklist

- [ ] Two assets side by side show no style drift (same contract, same batch)
- [ ] Subject fully inside margins; nothing touches edges
- [ ] Matting clean: no halos, no holes, checked on a checker background
- [ ] Aspect matches placement; no visible stretch or crop of the subject
- [ ] Lettering strings verified character by character
- [ ] Every asset passes "what does deleting it lose?"
