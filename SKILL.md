---
name: open-pptd
description: Create, edit, replicate, read, and export presentations. For every
  PPT task, the default deliverables are BOTH (1) a self-contained PPTD project
  folder containing the .pptd manifest plus pages/media dependencies and (2) a
  locally generated .pptx with embedded fonts and fade slide transitions. Use
  for any presentation, PowerPoint, PPT/PPTX, slide deck, PPTD, infographic, or
  poster task unless the user explicitly requests another format. Deliver with
  normal local file/folder links using absolute paths.
disable-model-invocation: false
---

# Definition

open-pptd is a presentation creation and export skill built around the **PPTD format** — a YAML intermediate DSL that abstracts OOXML (theme, page layout, element positions and definitions) while removing complex nesting such as Masters; every page is self-contained — what you see is what you get. The complete definition of this DSL is `references/pptd.md`.

**Default deliverables — both, unless the user explicitly opts out:**

1. the complete editable PPTD project directory (`.pptd` manifest + `pages/*.page` + `media/` and other referenced dependencies);
2. the matching locally generated `.pptx`, with fonts embedded and fade slide transitions applied by default.

## Capability Scope (Important Constraints)

0. **References reading map — each file is read once, in full, at its moment.** Section numbers (§) are locators inside an already-read file, never reading boundaries. Do not re-read a file and do not read it in partial sections.

   | File | What it is | When to read |
   |---|---|---|
   | `references/pptd.md` | the PPTD v2 format spec — the single source of truth for format decisions | step1, together with the user's uploaded files; also the validation baseline in step4 |
   | `references/design.md` | the complete design guide: §1 scenario categories & general rules, §2 visual style menu, §3 palette (custom guidelines + 10 built-in presets), §4 font system | once, in full, before the requirements interview (step2) |
   | `references/slides_categories/<scenario>.md` | scenario deep-dives: argumentation, density, worked examples | exactly one — the matched scenario — after scenario determination, before generating |
   | `references/shapes.md` | preset shape lookup table (177 shapes + parameters) | before writing pages |

   (Icons are Font Awesome Free — usage rules in `design.md` §5, read together with the rest of design.md; no separate icon document exists.)
   | `references/slides_categories/poster.md` | poster / infographic single-page design | poster or highly visual single-page requests only — never for ordinary PPT requests |

   Online browsing and PPTX export are done by running `node bin/open-pptd.js serve|export|check`. **Do not read any source code by default** (implementations and test cases under `editor/`, `packages/`, `bin/`, `scripts/`, `assets/`, `tests/`; `docs/` is developer documentation, also not read by default) — only if an unsolvable problem is hit (format doubts, export anomalies, editor anomalies), consult the relevant source to locate the root cause, and stop once fixed.

1. **Format baseline**: strictly implement per `references/pptd.md`; the export target is a PPTX that opens in PowerPoint without repair and renders identically to the editor preview.
2. **Export pipeline**: `node bin/open-pptd.js export <deck.pptd> [-o <out.pptx>]` (self-developed writer, no browser dependency).
3. **Online preview/editing**: `node bin/open-pptd.js serve --project <project dir>` → the local editor in a browser (self-developed). In the agent flow, start it **as soon as the manifest is written** (before generating pages) so the user watches pages appear in real time — the editor live-reloads on every file change (SSE). Run it in the background so the session is not blocked (exact pattern in step3).
4. **Page images (strictly on demand)**: `node bin/open-pptd.js render <deck.pptd> [-o <dir>]` exports pages to PNG via the local headless browser (no window; same renderer as the preview; `--page <n>` single page, `--scale <1|2|3>`). Run it **only** under the trigger rules in step4 — never for models that cannot read images (the PNGs would be useless).
5. **No pptx → pptd conversion**: an existing `.pptx` cannot be imported into a `.pptd` project. Edit/replicate tasks start from a `.pptd` project (user-provided or newly created); for a user-uploaded `.pptx`, unpack and inspect it as reference (colors/layout/copy), then rebuild in a `.pptd` project — element-by-element restoration is not guaranteed.
6. **Chart limits**: of the 13 types, **heatmap / sankey are not exported** (PowerPoint has no native types; the element is skipped, the page left blank, with a warning at export) — avoid these two when generating; the other 11 (bar/line/area/scatter/bubble/candlestick/pie/radar/waterfall/treemap/sunburst) export fully.
7. **Formulas**: rich text supports LaTeX formulas `\(...\)` (inline / standalone paragraph / full frame), exported as native editable PowerPoint formulas (mc:AlternateContent + a14:m).
8. **Icons**: `iconName` format `style:name` using **Font Awesome 7.x Free** (the official PPTD spec format; usage rules in design.md §5):
   - `fas:<name>` solid (~1400, default choice) / `far:<name>` regular outline (free subset ~170) / `fab:<name>` brands (~570 logos, natively supported);
   - naming is Font Awesome official (the model knows FA names natively; aliases like `home`→`house` resolve automatically); when unsure check `fontawesome.com/search?ic=free` — unknown names are skipped at export with a warning.
9. **Shapes**: `references/shapes.md` is the full list (177 preset shapes + parameters/defaults), all supported; `shapeName: "custom"` allows viewBox+path customization.
10. **Theme**: **custom colors by default** — design each deck's palette independently per content to avoid homogenization, following the "Custom Palette Guidelines" (design.md §3), and write the **full 17-key color set** into `deck.theme.colors` (textStyles/tableStyles follow the default templates there), referenced via `$key` on pages. **Never reference a preset by string** (e.g. `theme: "tech"` — non-official format); the deck must be self-contained (theme = a one-time design decision at generation). Use one of the 10 built-in presets (full values in design.md §3; editor top-bar "Palette" panel and CLI `--theme <key>` re-skin in one click, replacing only `theme.colors`; chart series colors cycle accent1-6) **only when the user explicitly asks or after discussing with the user**.
11. **Fonts**: default `Microsoft YaHei` (built into Windows; declared only — not embedded; Microsoft copyright prevents redistribution, so it is not in the built-in library). The built-in library has 27 free-for-commercial-use fonts (design.md §4; registered names all verified); `deck.fonts` with `{family: <registered-name>}` embeds automatically (subsetted by default) — **no `fonts/` directory needed in a project** (font bytes live in the skill's `assets/fonts/`). A family that misses the registry and has no url is declared only (system font). Before generating, run `node bin/open-pptd.js fonts list` to confirm registered names. **Talk to the user in display names (e.g. 得意黑), write registered names (e.g. `Smiley Sans`) into the deck.** Export embeds fonts by default (`--no-embed-fonts` disables).

## PPT Production Workflow

### step1. Read the context
Read **all files uploaded by the user**, the provided URLs, and `references/pptd.md` — the format spec's single read — to fully understand the user's requirements.

### step2. Understand the requirements, read the design guide, then interview

1. Classify the **purpose**:
   - Create a PPT — new presentation (from scratch, or from a `.pptd` template project)
   - Edit a PPT — an existing `.pptd` project (local modifications, single-page beautification, etc.)
   - Replicate a PPT — from non-pptx sources (images, PDF, etc.) into pptd format
2. Classify the **design direction**:
   - Self-directed design — no preference or only simple style constraints; you fill in or create the design
   - Design system — the user provides a complete, detailed scheme covering color, font, layout, and component specifications
   - Use a template — a `.pptd` template project is provided and must be used
   - Style transfer — a style reference source is provided (images, web pages, etc.)
3. Classify the **input type**:
   - Topic only / Full document / Outline (page-by-page outline, speech script, or similar)
   - With a full document or outline, when expansion is not explicitly addressed: an outline or document can hardly cover a full presentation — prefer expanding with searched material, cases, and data unless the user says not to.

Read `references/design.md` **in full, once** — every later design decision (interview options, palette, font pairing) comes from this read.

**Requirements interview — ask once, in one round.** For each dimension: skip if the user already specified it; ask if it is not specified; on "you decide", fall back to the best practice.

1. **Style**: offer 2-3 **named combinations** (scenario × visual style × light mode) from design.md §2 — e.g. "analysis-decision × `consulting-classic` × all-light" (the default pairing) vs "analysis-decision × `data-journalism` × all-dark" — instead of adjectives like "business" or "tech"; or follow a user-provided reference image/template/brand guide.
2. **Page count**: user-specified count takes priority; a page-by-page outline/script matches its own page count; with a complete structured document or a bare topic, decide yourself based on the content/search results — if the user is unsure, propose a count and confirm.
3. **Layout**: canvas ratio (default 16:9); cover / table of contents / section dividers / summary pages; per-page information density (sparse vs dense); any required page types.
4. **Content**: whether the provided material is complete or the model should expand it (search for more material, cases, data), and whether sources/citations are required.

Rules:
- The user's explicit requirements always take priority over any default; do not re-ask what the user already answered.
- On delegation ("you decide"), proceed with best practice: pick the style from the scenario guides, decide the page count from the content structure, follow the general rules in design.md §1, and expand content with search when the input type allows it.
- After the interview, state the confirmed decisions in **one short paragraph** before generating, so the deck stays aligned with expectations. It must cover: page count / layout / content expansion, plus the **design anchors** — visual style name (a design.md §2 entry or a one-sentence custom contract), light mode (all-light / sandwich / all-dark), signature motif (a repeating element group; never a color bar/stripe or decorative title underline), font pairing (≤2 families from design.md §4), and a size scale of 5-8 anchors used across the whole deck.

### step3. Generate

**Generation order — manifest first, live preview throughout:**
1. Create the project directory (`pages/`, `media/`).
2. Write `deck.pptd` with the complete page list + theme + fonts declarations. (Missing page files are fine — the editor skips them, and they appear automatically as they land on disk.)
3. **Start the live preview immediately** (background, do not block the session):
   ```bash
   nohup node bin/open-pptd.js serve --project /abs/path/project > /tmp/open-pptd-serve.log 2>&1 &
   # URL is printed in the log (default http://127.0.0.1:55173/editor/?deck=project/deck.pptd; port auto-increments when busy)
   # stop: find the PID listening on the port and kill it (Windows: netstat -ano | findstr 55173 → taskkill /PID <pid>)
   ```
   Hand the URL to the user and tell them the pages are generated next and will appear in real time — they can interrupt with feedback at any moment.
4. Generate all `pages/*.page` (and `media/`) in one pass per the mode guidance below — no placeholder/skeleton batching, no forced checkpoints. Each file landing on disk triggers an editor auto-reload, so the user watches the pages appear one by one.
5. When **editing** an existing project: ensure `serve` is running before you start changing pages (start it if not), so every edit is visible to the user immediately.

**Theme decision (mandatory for every generation)**:
1. **Custom palette by default**: design a dedicated palette per the scenario (industry/audience/purpose/content tone), following the Custom Palette Guidelines in design.md §3; write into `deck.pptd` `theme` (colors/textStyles/tableStyles) and reference via `$key` on page elements; do not reference non-existent `$key`s, and do not reference presets by string.
2. **Presets only as backup**: use one of the 10 presets (scenario mapping in the design.md §3 overview table) only when the user explicitly asks or after discussion; write that preset's full 17 keys into `theme.colors`.
3. **Give palette advice at delivery**: explain the design rationale (primary/accent/chart-series selection logic) and proactively offer replaceable alternatives (e.g. "if you want a steadier business feel, switch to consult") — the user can re-skin later via the editor "Palette" panel or CLI `--theme <key>`.

**Generation discipline (every deck)**:
- Same-kind entry pages repeat the signature motif with only its state changing; distinct page kinds (cover, section dividers, closing, special pages) get their own composition instead of reusing the entry-page template.
- Alternate text-driven, image-driven, and data-driven pages; every page keeps one focal point and at least one visual element (positive layout vocabulary: design.md §1 step1).
- `notes` is the speaker note, not a page annotation. Write what the presenter says while showing the page — the opening line, which numbers to read aloud (with their source years), the transition to the next page. Never page/design explanations, content summaries, or generation self-checks; omit the field entirely when there is nothing to present.

**Mode-specific guidance**:

- **Replicating a PPT**: analyze the images to estimate element positions, fonts and sizes, and **replicate 1:1 as closely as possible**. When an image contains elements hard to replicate directly and impossible to approximate with icons/shapes (photos, avatars), use tools such as bash or python to crop and screenshot the original image.
- **Editing a PPT**: read the manifest and all page files to understand the current structure and styling; review the pages (structure and key visual details), reading a few key pages individually afterwards; then locate the pages to edit, without affecting parts outside the intended scope. (A user-provided `.pptx` follows constraint 5 — unpack it as reference and rebuild those pages in the `.pptd` project.)
- **Generating — self-directed design**: read the matched scenario's document under `slides_categories/` (mapping table: design.md §1 step2); the style and anchors are already fixed by the interview's decision paragraph. Then produce the presentation.
- **Generating — design system**: read the matched scenario document as the design foundation; the user-provided design system document is the presentation style — it is strictly forbidden to reference or mix in other design styles. Produce with reference to both.
- **Generating — using a template**: use the user-provided `.pptd` template project directly (manifest + pages + media); review the template pages to understand its visual style (color scheme, font style, element/layout characteristics, content density); identify page types, focusing on special pages (cover, summary pages, section dividers) to extract layouts, content structures, reusable components (icons, shapes, smartart, reusable body-layout schemes), and element styles (whitespace/line/card separators, square/rounded corners). Produce using the template.
- **Generating — style transfer**: analyze the reference's visual style (color scheme, fonts, element/layout characteristics, density), page layouts, content structures, reusable components, and element styles; for a reference URL, learn from the page's visual effect, not only its text content. Reusing illustrations, fonts, font-size hierarchies, and elements from the original pdf/url is encouraged. Produce with those style characteristics.
- **Poster / infographic / highly visual single-page**: read `references/slides_categories/poster.md` and implement as a single-page or few-page editable PPTD; when the user only asks for an image, still build it with PPTD first, then output the image via screenshot or rendering. Never load this file for ordinary PPT requests.

### step4. Validation

1. **Structural review — always**: validate the generated pptd against `references/pptd.md` (required fields, types, bounds, theme tokens, resource paths, contrast, overflow-prone long text, hierarchy, layout density) and repair issues over multiple rounds.
2. **Live preview — the primary QA channel** (already running since step3): the user watches pages appear in real time and reports issues; fix them in the corresponding `.page` files (the editor live-reloads on file changes). If the preview is not running for any reason, restart it with the step3 nohup pattern and hand the URL to the user.
3. **Visual self-review — strictly on demand**. Run render **only when all three conditions hold**:
   a. the user explicitly asks the agent to check/fix the visuals itself (e.g. "你自己检查调整一下布局"), or the task's core is visual fidelity (1:1 image/PDF replication, style transfer) and the user wants the agent to verify;
   b. the current model can actually read images (if unsure, render one page first and try to read the PNG — if you cannot see it, stop and skip);
   c. a local browser is available (Chrome/Edge).

   ```bash
   node bin/open-pptd.js render /abs/path/project/deck.pptd -o /abs/path/project/render-out
   ```
   Review each page against this list:
   1. images clear and undistorted (no stretching, compression, blur);
   2. text not pressing on key visuals (faces, product subjects, logos);
   3. element coordinates within page bounds;
   4. border and palette contrast sufficient (text vs background, adjacent color blocks);
   5. layout consistent (alignment, spacing, font-size hierarchy, page margins);
   6. text not likely to overflow its text box (overlong text, cramped line height, oversized fonts);
   7. content not occluded by upper-layer elements.

   For any suspicious page, review its source `.page` file to confirm the problem before editing. Fix issues in the `.page` files, **limited to gross layout defects** (misplaced text, wrong font fallback, out-of-bounds, overflow, occlusion, distortion, contrast) — do not chase pixel-level details. Re-render **only the affected pages** (`--page <n>`), re-review once, then confirm with the user — the visual pass ends when the user is satisfied.
4. **Skip rule**: when condition (b) or (c) fails — many models cannot read images — do **not** run render at all: rely on the structural review (item 1) + the user's live preview feedback, and state in the delivery that image-based visual QA was skipped and why.

### step5. Output and delivery

1. Always produce a **self-contained project directory**: keep the `.pptd` manifest and every referenced dependency together; never deliver a standalone manifest. Use this layout unless an existing project already has a valid equivalent structure:

   ```text
   deck/
     deck.pptd
     pages/
       *.page
     media/
       *                # when the deck has local media
     deck.pptx          # generated by default
   ```

2. Generate the `.pptx` by default after validation, even when the user only asks to create or edit a presentation. Skip PPTX export only when the user explicitly requests PPTD-only output or the environment cannot run the exporter; in the latter case, report the exact blocker and still deliver the complete PPTD project.
3. Export command (local writer, no browser needed; a project directory may be passed instead of the manifest only when it contains exactly one `.pptd` file):

   ```bash
   node /abs/path/to/open-pptd/bin/open-pptd.js export /abs/path/project/deck.pptd -o /abs/path/project/deck.pptx
   ```

   **Export auto-validates**: structural errors (unknown element types, bad bounds, missing required fields) block the export with a located error list; warnings (overflow/contrast/font hints) are printed but do not block.
4. Structural self-check (run standalone any time, especially before export or when fixing issues):

   ```bash
   node /abs/path/to/open-pptd/bin/open-pptd.js check /abs/path/project/deck.pptd
   ```

   Reports schema/token/resource/font/geometry/contrast issues per page with element ids; exit code 1 on errors. When export fails validation, run this and fix the listed issues one by one.
5. Default PPTX options: fade transition written to every slide by the local writer; font embedding enabled by default (`--no-embed-fonts` disables); embedded fonts are resolved automatically per the registered-name rule in constraint 11.
6. After export, verify the output exists and report the generated path. Confirm that every slide has exactly one root-level fade transition in valid CT_Slide order (`cSld`, optional `clrMapOvr`, `transition`, optional `timing/extLst`) by unzipping the PPTX and inspecting `ppt/slides/slideN.xml`. Do not claim PowerPoint/WPS/Keynote playback compatibility solely because export succeeded.
7. Deliver with normal clickable local links using absolute paths. In the final response, link: the project directory; the `.pptd` manifest; the `pages/` and `media/` directories when present; the generated `.pptx`.
8. When the user wants to open, edit, save, or export a PPTD project manually: start the local browser editor with `node bin/open-pptd.js serve --project <project dir>` and ask the user to open the printed local URL. The editor supports preview, editing, saving back to the project, and one-click PPTX export (or `node bin/open-pptd.js render <deck.pptd> -o <dir>` to export page images).
9. Always end the final response with the **preview status** and a concise next step: if the step3 preview server is still running, give the URL and how to stop it (or offer to keep it running for further editing); if it was stopped, give the restart command (`node bin/open-pptd.js serve --project <project dir>`). Keep this reminder in addition to — not instead of — the required project and file links.
