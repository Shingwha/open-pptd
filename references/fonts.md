# Font System

## Overview

- **Built-in font library**: `assets/fonts/` (skill resource folder, not uploaded to GitHub) contains **27 free-for-commercial-use fonts**, all verified for name-table family names, embeddable fsType, and subsetting support.
- **Usage**: declare `{family: <registered-name>}` in `deck.fonts` and the font is embedded automatically (subsetted by default). No need to download or place font files.
- **Default font**: `Microsoft YaHei` (built into Windows, declared only — not embedded). It is not in the built-in library (Microsoft copyright, cannot be redistributed/embedded), so it is a system font: declared only, consistent on any Windows machine. For a cross-machine brand font, declare it in `deck.fonts` and reference it explicitly on pages.
- **System fonts**: any `fontFamily` that misses the registry is declared only (not embedded) and depends on the opening system. Common system fonts and their platform coverage are listed under "System Fonts" below (also queryable via `node bin/open-pptd.js fonts list`).
- **Display names vs registered names**: talk to the user in display names (e.g. 得意黑, 思源宋体) when asking for font preferences; write **registered names** into `deck.fonts` / page `fontFamily`.

## Selection Principles

1. Language matching: when the user's query is in Chinese or a Chinese PPT deliverable is requested, specify both Chinese and English fonts; otherwise set English fonts only.
2. Selection approach: prioritize highly readable fonts for body text; use stylized fonts plus special treatments (all caps, widened letter spacing, bold, italics, etc.) in titles or special pages to strengthen the style.
3. The font combination must support the overall visual style positioning.
4. Name consistency: **the page `fontFamily` must exactly match the registered name in the tables below (including case and spaces) — this is the only requirement for embedding to take effect**. Copy the registered name directly; never write the display name.

> The sans table below is ordered by recommendation: **steady, formal, widely applicable fonts first** — pick from the top of the list for a professional look; stylized/creative fonts follow for titles and special pages.

## Built-in Font Library (27 fonts, all free-for-commercial-use + subsettable embedding)

### Sans (黑体)

| Display name | Registered name (family) | Style & character | Best for |
|---|---|---|---|
| 阿里妈妈数黑体 | `Alimama ShuHeiTi` | Geometric sans, orderly commercial look (bold weight) | Business/tech/e-commerce |
| 霞鹜新晰黑 | `LXGW Neo XiHei` | Clear, modern, clean and neat | Tech/body text/general |
| Liter | `Liter` | Modern sans-serif, rational and clean (Latin only — no Chinese glyphs) | Tech/products (English only) |
| Quattrocento Sans | `Quattrocento Sans` | Classic elegant sans-serif, legible at small sizes (Latin only — no Chinese glyphs) | Academic/business/education (English only) |
| MiSans | `MiSans` | Xiaomi system sans, modern and clear, multiple weights | Tech/enterprise/products (backup choice) |
| 得意黑 | `Smiley Sans` | Narrow slanted sans, balance of humanist and geometric (italic glyphs) | Creative tech/brand display/titles |
| HedvigLettersSans | `Hedvig Letters Sans` | Non-designer perspective, distinctive personality (Latin only — no Chinese glyphs) | Creative design/brand (English only) |
| Coda | `Coda` | Rounded, friendly, open curves (Latin only — no Chinese glyphs) | Business/friendly brands (English only) |

### Serif (宋/衬线)

| Display name | Registered name (family) | Style & character | Best for |
|---|---|---|---|
| 思源宋体 | `Source Han Serif CN` | Strong stroke contrast, elegant | Literature/design/formal presentations |
| 霞鹜文楷 | `LXGW WenKai` | Kai with fangsong fusion, warm and delicate | Literature/education/humanities |
| 霞鹜緻宋 | `LXGW ZhiSong MN` | Modern serif | Literature/classic/print style |
| 霞鹜铭心宋 | `LXGW Heart Serif MN` | Delicate strokes | Literature/classic/titles |
| Oranienbaum | `Oranienbaum` | High-contrast geometric serif, classical elegance (Latin only — no Chinese glyphs) | Culture/art/fashion (English only) |
| Sorts Mill Goudy | `Sorts Mill Goudy` | Classical serif, soft and readable (Latin only — no Chinese glyphs) | Literature/humanities (English only) |
| Unna | `Unna` | Neo-classical serif, vertical rhythm (Latin only — no Chinese glyphs) | Literature/publishing/academic (English only) |

### Handwriting / Calligraphy (手写/书法)

| Display name | Registered name (family) | Style & character | Best for |
|---|---|---|---|
| 飞波正点体 | `Feibo Zheng Dots` | Brush calligraphy, heavy and forceful strokes | Movie posters/e-commerce/brand display |
| 阿里妈妈刀隶体 | `Alimama DaoLiTi` | Clerical-script style, chiseled strokes, archaic and forceful | Guochao/culture/art display |
| 阿里妈妈东方大楷 | `Alimama DongFangDaKai` | Yan-style regular script, full and heavy | Culture/brand launch/Chinese-style themes |
| 站酷文艺体 | `zcoolwenyiti` | Fresh handwritten feel, literary | Light design/lifestyle |
| 站酷快乐体 | `HappyZcool-2016` | Lively cute rounded handwriting | Anime/kids/entertainment |
| 霞鹜臻楷 | `LXGW ZhenKai` | Regular-script charm | Chinese style/literature/formal |

### Display / Artistic (标题/艺术)

| Display name | Registered name (family) | Style & character | Best for |
|---|---|---|---|
| 站酷小薇LOGO体 | `xiaowei` | Logo art type, bold personality | Titles/brand marks |
| 站酷庆科黄油体 | `zcoolqingkehuangyouti` | Rounded, thick butter-body | Titles/food/light brands |
| Jersey15 | `Jersey 15` | Sports jersey style (Latin only) | Sports/tech display |

### Pixel (像素)

| Display name | Registered name (family) | Style & character | Best for |
|---|---|---|---|
| 精品点阵体 | `BoutiqueBitmap9x9 1.9` | 9×9 dot-matrix pixel style | Games/tech/retro electronics |
| 寒蝉点阵体 | `寒蝉点阵体` | 16px dot-matrix pixel style | Games/retro/pixel |
| Jersey20Charted | `Jersey 20 Charted` | Grid-shadow sports numerals (Latin only) | Sports/mechanical/decorative |

> Full table, sizes, licenses, and source URLs: `assets/fonts/registry.json` (machine-readable, shared by CLI and editor).

> ⚠ Coverage notes (GB2312 level-1 = 3755 most common Chinese chars): the two Japanese-oriented fonts 思源真黑 (`Gen Shin Gothic`) and 思源柔黑 (`Gen Jyuu GothicL`) were **removed from the library** — they lack simplified-Chinese-only glyphs (谁/态/创/对/话/图/视/频 etc.). Latin-only fonts (marked above) have zero Chinese glyphs. Minor punctuation gaps: Alimama DaoLiTi/DongFangDaKai/ShuHeiTi lack full-width 『』％＋＝＜＞＃＆＊＠; Feibo Zheng Dots lacks ＜＞; HappyZcool-2016 lacks full-width （）.

## System Fonts (declared only, not embedded — depend on the opening system)

Reference list of common system fonts (**no font bytes, no embedding, no download**): write the registered name directly in page `fontFamily`; the PPTX only declares it. Appearance depends on whether the opening system has the font — **silently falls back if missing**; cross-platform consistency cannot match embedded fonts. Registered names follow the Windows font name table; the `Platform` column shows coverage — macOS-only fonts (e.g. PingFang) fall back on Windows.

### Chinese (built into Windows)

| Display name | Registered name (family) | Platform | Style & character | Best for |
|---|---|---|---|---|
| 微软雅黑 | `Microsoft YaHei` | Windows 7+ | Modern sans, first choice for on-screen reading (**default font**) | Body text/general |
| 宋体 | `SimSun` | All Windows | Classic Song-style serif, standard for official documents/printing | Body text/formal documents |
| 仿宋 | `FangSong` | All Windows | Fang-song style, standard for official documents | Official documents/formal |
| 楷体 | `KaiTi` | All Windows | Regular script, handwritten scholarly feel | Inscriptions/quotes |
| 黑体 | `SimHei` | All Windows | Classic heavy sans, square and sturdy | Titles/body text |
| 幼圆 | `YouYuan` | All Windows | Round style, soft and friendly | Titles/light scenarios |
| 隶书 | `LiSu` | All Windows | Clerical script, archaic | Titles/decorative |
| 等线 | `DengXian` | Windows 10+ / Office | Office default Chinese font, refined | Body text/general |

### Latin (bundled with Windows / Office)

| Display name | Registered name (family) | Platform | Style & character | Best for |
|---|---|---|---|---|
| Times New Roman | `Times New Roman` | All platforms | Classic serif | Latin body text/academic |
| Arial | `Arial` | All platforms | Classic sans-serif | Latin body text |
| Calibri | `Calibri` | Office | Office default Latin font, rounded | Latin body text |

### macOS Chinese (absent on Windows — falls back cross-platform)

| Display name | Registered name (family) | Platform | Style & character | Best for |
|---|---|---|---|---|
| 苹方 | `PingFang SC` | macOS | macOS default sans | Body text/general (macOS) |

> System fonts are maintained in `registry.json` under `systemFonts` (shared by `fonts list` / `fonts check` and the editor font panel).

## First-Time Setup (after cloning the repo)

Font file binaries (~155 MB) are not committed to git (only `registry.json` metadata is); choose one of two options before first use:

```bash
# Option A: one-time full download (one and done, ~155 MB, works offline)
node bin/open-pptd.js fonts download all

# Option B: on-demand download (download what you use, run before export)
node bin/open-pptd.js fonts download 得意黑
node bin/open-pptd.js fonts check <deck.pptd>   # health check, then download what ✗ marks
```

Missing fonts do not block export: they are skipped with a warning, the PPTX is still generated (family name kept, falls back to system fonts when opened).

## PPTX Font Embedding

By default, export embeds fonts in the `deck.fonts` resource table that **hit the built-in library or carry a `url`** (disable with `--no-embed-fonts`). The embedded PPTX carries its fonts, so any machine opens without missing glyphs.

### 1. deck.fonts declaration syntax

```yaml
fonts:
  得意黑: { family: "Smiley Sans" }          # registry reference: export takes font from built-in library → subsets → embeds
  title-font: { family: "Alimama DaoLiTi", subset: false }   # explicitly disable subsetting (default true)
  web-font:  { family: "SomeFont", url: https://cdn.example.com/somefont.ttf }  # web font (needs CORS)
  body: MiSans                              # slot string: reference only, no embedding
```

- `family` is the **embedding registered name**: must exactly match the tables above (including case and spaces); **a family that misses the registry and has no `url` is treated as a system font — declared only, not embedded**
- The `fonts` map key is an arbitrary slot name; using the display name as the key keeps the deck readable
- `subset: true` (default) embeds only the characters used in the document (TTF subsetting; Chinese can shrink by 100× or more)
- The embedding registered name = font name-table ID16 (typographic family) first, ID1 fallback — all names above are tested, **copy them directly; never write display names**

### 2. No fonts directory needed in a project

Font bytes all live in the skill's built-in library `assets/fonts/`; a deck project stays clean with `deck.pptd + pages/ + media/`.

### 3. CLI font management

```bash
node bin/open-pptd.js fonts list                  # full table + download status ✓/✗
node bin/open-pptd.js fonts download <name|all>   # on-demand / full download into the library (display name or registered name)
node bin/open-pptd.js fonts check <deck.pptd>     # health check: embedded / declared-only / missing
```

### 4. Editor (serve mode)

Toolbar "Fonts" → font management dialog: browse the built-in library by category (Sans / Serif / Handwriting / Display / Pixel), click "Use" to add and write into `deck.fonts` (registered name auto-corrected). Preview and export share the same font bytes (`/assets/fonts/` static service + FontFace).

### 5. Notes

- **Use = embed**: fonts referenced via the registry are always embedded (whether or not installed locally), guaranteeing consistency on any machine; size is controlled by subsetting
- **Do not use embedded fonts as the theme default font** (PowerPoint treats theme fonts as "in use" and forces embedding, bloating the file)
- **A run must actually use the font**: declaring fonts while no page/theme style references the family → PowerPoint drops the embedded declaration. After declaring in `deck.fonts`, remember to use it in `theme.textStyles` or element `fontFamily`
- **Licensing**: all 27 built-in fonts are free for commercial use (OFL / IPA / Alimama / ZCOOL licenses), embeddable and redistributable; Windows commercial fonts such as Microsoft YaHei cannot be redistributed/embedded
- **Restricted fonts**: fonts with fsType = Restricted (0x0002) are skipped with a warning at export (none in the built-in library)
- Embedding implementation details: `docs/font-embedding.md` (developer doc, consult when troubleshooting)
