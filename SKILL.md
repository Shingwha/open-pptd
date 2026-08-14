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
open-pptd is a presentation creation and export skill built around the PPTD format (a YAML intermediate format) and a self-developed browser-side PPTX writer. It defines a YAML-format intermediate DSL (`.pptd`) that abstracts OOXML and keeps each page self-contained.

**The default output is not PPTD-only.** Unless the user explicitly opts out, always produce both:

1. the complete editable PPTD project directory (`.pptd` + `pages/` + `media/` and other referenced dependencies);
2. the matching locally generated `.pptx`, with font embedding enabled and fade slide transitions applied by default.

## The pptd format
The .pptd format is a simplified abstraction layer over OOXML that follows basic YAML syntax. This abstraction preserves the core content of OOXML (theme, page layout, element positions and definitions, etc.) while removing complex nesting logic such as Masters; every page is self-contained — what you see is what you get. Read `references/pptd.md` for the complete definition of this DSL.

## Capability Scope (Important Constraints)

0. **File reading boundary**: the whole workflow only needs to read the documents under `references/` (pptd.md / themes.md / slides_categories.md and its scenario docs / shapes.md / icons.md / fonts.md / general-poster.md); online browsing and PPTX export are done by running `node bin/open-pptd.js serve|export` and `node tests/package-integrity.mjs`. **Do not read any source code by default** (implementations and test cases under `editor/`, `lib/`, `bin/`, `scripts/`, `assets/`, `tests/`; `docs/` is developer documentation, also not read by default) — unless an unsolvable problem is hit (format doubts, export anomalies, editor anomalies, etc.); only then consult the relevant source to locate the root cause, and stop once fixed.

1. **Format baseline**: strictly implement per `references/pptd.md` (the complete PPTD v2 spec); the export target is a PPTX that opens in PowerPoint without repair and renders identically to the editor preview.
2. **Export pipeline**: use the local exporter `node bin/open-pptd.js export <deck.pptd> [-o <out.pptx>]` (self-developed writer, no browser dependency).
3. **Online preview/editing**: `node bin/open-pptd.js serve --project <project dir>` → open the local editor in a browser (self-developed) to preview/edit/export. In the agent flow, start it **as soon as the manifest is written** (before generating the page files) so the user watches pages appear in real time — the editor live-reloads on every file change (SSE). Run it in the background so the session is not blocked; see step3 for the exact pattern.
4. **Page images (strictly on demand)**: `node bin/open-pptd.js render <deck.pptd> [-o <dir>]` exports every page to PNG via the local headless browser (no window, same renderer as the editor preview; `--page <n>` single page, `--scale <1|2|3>`). Run it **only** when the user explicitly asks the agent to visually check/adjust the result itself (or visual fidelity is core to the task), AND the current model can actually read images, AND a browser is available — exact trigger rules in step4. Never render for models that cannot see images (the PNGs would be useless): rely on the structural review + the user's live preview feedback instead.
5. **No pptx → pptd conversion**: this implementation cannot import an existing .pptx into a .pptd project. Edit/replicate tasks can only start from a .pptd project (user-provided or newly created). For a user-uploaded .pptx: unpack and inspect it as reference (colors/layout/copy), then rebuild in a .pptd project; element-by-element restoration is not guaranteed.
6. **Chart limits**: of the 13 types, **heatmap / sankey are not exported** (PowerPoint has no native types; the element is skipped, the page left blank, with a warning at export) — avoid these two types when generating; the other 11 (bar/line/area/scatter/bubble/candlestick/pie/radar/waterfall/treemap/sunburst) export fully.
7. **Formulas**: rich text supports LaTeX formulas `\(...\)` (inline / standalone paragraph / full frame), exported as native editable PowerPoint formulas (mc:AlternateContent + a14:m).
8. **Icons**: `iconName` format `style:name`. Full list in `references/icons.md` (AUTO-GENERATED):
   - `bs:<name>` direct local library reference, 192 icons (prefer these; guaranteed to exist);
   - `fas:`/`far:<fa-name>` mapped by Font Awesome semantics to local approximate icons (only FA names covered by the mapping table are usable, ~1100 entries);
   - `fab:` brand icons **not supported** (no brand logos in the local library; use image elements instead);
   - unknown icons are skipped at export — always check the table before generating.
9. **Shapes**: `references/shapes.md` is the full list (177 preset shapes + parameters/defaults), all supported; `shapeName: "custom"` allows viewBox+path customization.
10. **Theme**: 10 built-in color presets (full values in `references/themes.md`; the editor top-bar "Palette" panel and CLI `--theme <key>` apply/re-skin in one click, replacing only `theme.colors`; chart series colors cycle accent1-6). **Custom colors by default** (design each deck independently per content to avoid homogenization; must satisfy the "Custom Palette Guidelines" in themes.md); **use a preset only when the user explicitly asks or after discussing with the user**. Whether custom or preset, write the **full 17-key color set** into `deck.theme.colors` (textStyles/tableStyles follow the default templates in themes.md) and reference via `$key` on pages; **never reference a preset by string** (e.g. `theme: "tech"`, non-official format); the deck must be self-contained (theme = a one-time design decision at generation).
11. **Fonts**: default `Microsoft YaHei` (built into Windows, declared only — not embedded; consistent on any Windows machine; Microsoft copyright prevents redistribution, so it is not in the built-in library). The built-in library has 27 free-for-commercial-use fonts (see `references/fonts.md`; registered names all verified, embedded subsetted by default). `deck.fonts` with `{family: <registered-name>}` embeds automatically — **no `fonts/` directory needed in a project** (font bytes live in the skill's `assets/fonts/`); a family that misses the registry and has no url is declared only (system font). Before generating, run `node bin/open-pptd.js fonts list` to confirm registered names; export embeds fonts by default (`--no-embed-fonts` disables). **Talk to the user in display names (e.g. 得意黑), write registered names (e.g. `Smiley Sans`) into the deck.**

## PPT Production Workflow

### step1. Read the context thoroughly
Read **all files uploaded by the user**, the provided URLs, and the pptd format guide `references/pptd.md` to fully understand the user's requirements.

### step2. Understand the user's requirements
Understand the user's requirements based on the context:

1. Determine the purpose of the request
   - Create a PPT: create a new presentation (from scratch, or from a .pptd template project)
   - Edit a PPT: edit an existing .pptd project (local modifications, single-page beautification, etc.)
   - Replicate a PPT: replicate a presentation from a non-pptx format (images, PDF, etc.) into pptd format

2. Determine the design direction
   - Self-directed design: no preference, or only simple style constraints given; you fill in or create the design
   - Design system: the user provides a complete, detailed design scheme covering all color, font, layout, and component specifications
   - Use a template: a .pptd template project is provided and must be used
   - Style transfer: a style reference source is provided (images, web pages, etc.)

3. Determine the input type
   - Topic only: only a PPT topic direction or content requirement, with no concrete content
   - Full document: the user provides a complete document (paper, research report, press release, etc.)
   - Outline: the user provides a page-by-page outline, speech script, or similar
   * When the input type is [Full document] or [Outline] and it is not specified whether expansion is allowed: an outline, script, or document can hardly cover the full content of a presentation, so prefer using search to expand with more relevant material, cases, etc., unless the user explicitly says not to expand

### Requirements interview — ask once, in one round
Before generating, ask the user **in a single round** to confirm the four dimensions below. For each dimension: skip if the user already specified it; ask if it is not specified; if the user says "you decide", fall back to the best practice given.

1. **Style**: visual direction — e.g. steady business, modern tech, minimal premium, warm friendly, creative bold; or a reference image/template/brand guide. Offer 1-3 suitable candidates from the built-in presets (`references/themes.md`) or font categories (`references/fonts.md`) as options.
2. **Page count**: expected number of pages. If the user is unsure, propose a count based on the content structure and confirm. Rules: user-specified count takes priority; a page-by-page outline/script matches its page count; with a complete structured document or a bare topic, decide yourself based on content/search results.
3. **Layout**: structure preferences — canvas ratio (default 16:9), whether to include cover / table of contents / section dividers / summary pages, information density per page (sparse vs dense), and any required page types.
4. **Content**: whether the provided material is complete or the model should expand (search for more material, cases, data), and whether sources/citations are required.

Rules:
- The user's explicit requirements always take priority over any default.
- Do not re-ask what the user already answered.
- When the user says "you decide" or delegates, proceed with best practice: pick the style from the scenario guides, decide the page count from the content structure, follow the general rules in `references/slides_categories.md`, and expand content with search when the input type allows it.
- After the interview, state the confirmed decisions in one short paragraph (style / page count / layout / content) before generating, so the deck stays aligned with expectations.

### step3. Generate the presentation based on the user's requirements

Before generating, first read `references/pptd.md` to understand the pptd format definition and constraints.

**Generation order — manifest first, live preview throughout**:
1. Create the project directory (`pages/`, `media/`).
2. Write `deck.pptd` with the complete page list + theme + fonts declarations. (Missing page files are fine — the editor skips them and they appear automatically as they land on disk.)
3. **Start the live preview immediately** (background, do not block the session):
   ```bash
   nohup node bin/open-pptd.js serve --project /abs/path/project > /tmp/open-pptd-serve.log 2>&1 &
   # URL is printed in the log (default http://127.0.0.1:55173/editor/?deck=project/deck.pptd; port auto-increments when busy)
   # stop: find the PID listening on the port and kill it (Windows: netstat -ano | findstr 55173 → taskkill /PID <pid>)
   ```
   Hand the URL to the user and tell them the pages are generated next and will appear in real time — they can interrupt with feedback at any moment.
4. Then generate all `pages/*.page` (and `media/`) in one pass per the modes below — no placeholder/skeleton batching, no forced checkpoints. Each file landing on disk triggers an editor auto-reload, so the user watches the pages appear one by one.
5. When **editing** an existing project: ensure `serve` is running before you start changing pages (start it if not), so every edit is visible to the user immediately.

**Theme decision (mandatory for every generation)**:
1. **Custom palette by default**: design a dedicated palette per the scenario (industry/audience/purpose/content tone); guidelines in `references/themes.md` "Custom Palette Guidelines"; write into `deck.pptd` `theme` (colors/textStyles/tableStyles) + reference via `$key` on page elements; do not reference non-existent `$key`s, and do not reference presets by string (`theme: "key"`).
2. **Presets only as backup**: use one of the 10 presets in `references/themes.md` (scenario mapping in the overview table) only when the user explicitly asks or after discussion; write that preset's full 17 keys into `theme.colors`.
3. **Give palette advice at delivery**: explain the design rationale (primary/accent/chart-series selection logic) and proactively offer replaceable alternatives (e.g. "if you want a steadier business feel, switch to consult") — the user can re-skin later via the editor "Palette" panel or CLI `--theme <key>`.

#### Replicating a PPT
- Analyze the images to estimate element positions, fonts and sizes, etc., and **replicate 1:1 as closely as possible**.
- When an image contains elements that are hard to replicate directly and cannot be approximated with icons/shapes (e.g. photos, avatars), you may use tools such as bash or python to crop and screenshot the original image.

#### Editing a PPT
- The user's deck is a .pptd project (`.pptd` manifest + `pages/*.page` + `media/`). Read the manifest and all page files to understand the current structure and styling.
- Review the pages (structure and key visual details). Read a few key pages individually afterwards.
- Locate the pages to edit, and be careful not to affect parts outside the intended scope.
> No pptx → pptd conversion: if the user provides a .pptx and asks to modify it, unpack the .pptx to inspect the target pages' layout/copy/palette as reference, rebuild those pages in the .pptd project; element-by-element restoration is not guaranteed (see Capability Scope).

#### Generating a PPT
Adopt different production approaches for different user [design directions].

##### Self-directed design
1. Read the design guide `references/slides_categories.md`, and read the scenario document corresponding to the user's query.
2. Produce the presentation based on the above.

##### Generating content in other formats
- When the user explicitly asks for an infographic, poster, or a highly visual single-page design, read `references/general-poster.md` and implement it as a single-page or few-page editable PPTD; when the user only asks for an image, still build it with PPTD first, then output the image via screenshot or rendering. Do not load this reference file for ordinary PPT requests.

##### Design system
1. Read the general constraints section of `references/slides_categories.md`, and read the scenario document corresponding to the user's query as the design foundation.
2. Read the user-provided design system document as the presentation style. It is strictly forbidden to reference or mix in other design styles.
3. Produce the presentation with reference to the above.

##### Using a template
1. Use the user-provided .pptd template project directly (manifest + pages + media).
2. Review the template pages to understand the template's visual style (color scheme, font style, element characteristics, layout characteristics, content density, etc.).
3. Identify page types; focus on reading special pages such as the cover, summary pages, and section dividers, extracting their page layouts, content structures, reusable components (icons, shapes, smartart, reusable body layout schemes, etc.), and element styles (e.g. whitespace/line/card separators, square/rounded corners, etc.).
4. Produce the presentation using the template.

##### Style transfer
1. Analyze the reference file's visual style (color scheme, font style, element characteristics, layout characteristics, content density, etc.), page layouts, content structures, reusable components (icons, shapes, smartart, reusable body layout schemes, etc.), and element styles (e.g. whitespace/line/card separators, square/rounded corners, etc.).
   - If the user provides a style reference URL, do not only read the text content; refer to and learn from the page's visual effect more to help understand the style.
2. Produce the presentation using the reference file's style characteristics. You are encouraged to reuse illustrations, fonts, font-size hierarchies, elements, etc. from the original pdf/url.

### step4. PPT validation
1. **Structural review — always**: validate the generated pptd against the format definition in `references/pptd.md` (required fields, types, bounds, theme tokens, resource paths, contrast, overflow-prone long text, hierarchy, layout density) and repair issues over multiple rounds.
2. **Real-time preview — already running (started in step3)**: the preview is the primary QA channel. The user watches pages appear in real time and reports issues; fix them in the corresponding `.page` files (the editor live-reloads on file changes). If the preview is not running for any reason, start it now in the background (nohup pattern in step3) and hand the URL to the user.
3. **Visual self-review — strictly on demand**: run the render command **only when all three conditions hold**:
   a. the user explicitly asks the agent to check/fix the visuals itself (e.g. "你自己检查调整一下布局"), or the task's core is visual fidelity (1:1 image/PDF replication, style transfer) and the user wants the agent to verify;
   b. the current model can actually read images (if unsure, render one page first and try to read the PNG — if you cannot see it, stop and skip);
   c. a local browser is available (Chrome/Edge).
   Then render every page to PNG and review each page against this list:
   ```bash
   node bin/open-pptd.js render /abs/path/project/deck.pptd -o /abs/path/project/render-out
   ```
   1. Images clear and undistorted (no stretching, compression, blur)
   2. Text not pressing on key visuals (faces, product subjects, logos, etc.)
   3. Element coordinates not out of page bounds
   4. Border and palette contrast sufficient (text vs background, adjacent color blocks)
   5. Layout consistent (alignment, spacing, font-size hierarchy, page margins)
   6. Text not likely to overflow its text box (overlong text, cramped line height, oversized fonts)
   7. Content not occluded by upper-layer elements
   - For any suspicious page, review its source `.page` file to confirm the problem before editing.
   - Fix issues in the corresponding `.page` files, limited to gross layout defects (e.g. font misplacement or wrong font fallback, out-of-bounds, overflow, occlusion, distortion, contrast); do not chase pixel-level details. Re-render **only the affected pages** (`--page <n>`), re-review once, then confirm with the user — the visual pass ends when the user is satisfied.
4. **Skip rule**: when condition (b) or (c) fails — many models cannot read images — do **not** run render at all (the PNGs would be useless): rely on the structural review (step 1) + the user's live preview feedback, and state in the delivery that image-based visual QA was skipped and why.

### step5. PPT output and delivery
1. Always produce a self-contained project directory. Keep the `.pptd` manifest and every referenced dependency together; never deliver a standalone manifest without its referenced files. Use this layout unless an existing project already has a valid equivalent structure:

   ```text
   deck/
     deck.pptd
     pages/
       *.page
     media/
       *                # when the deck has local media
     deck.pptx          # generated by default
   ```

2. Generate the `.pptx` by default after PPTD validation, even when the user only asks to create or edit a presentation. Skip PPTX export only when the user explicitly requests PPTD-only output or the environment cannot run the exporter; in the latter case, report the exact blocker and still deliver the complete PPTD project.
3. Deliver with normal clickable local links using absolute paths. In the final response, link all of the following:
   - the project directory;
   - the `.pptd` manifest;
   - the `pages/` directory and `media/` directory when present;
   - the generated `.pptx` file.
4. Export command (local writer, no browser needed):

   ```bash
   node /abs/path/to/open-pptd-v2/bin/open-pptd.js export /abs/path/project/deck.pptd -o /abs/path/project/deck.pptx
   ```

   A project directory may be passed instead of the manifest only when it contains exactly one `.pptd` file.
5. Default PPTX options:
   - page transition: `fade`, written to every slide by the local writer;
   - font embedding: enabled by default; may be disabled with `--no-embed-fonts`;
   - embedded fonts are resolved automatically: deck.fonts `{family: <registered-name>}` hits the built-in font library (`assets/fonts/`) or a `url`; others are declared only. **Registered-name rule**: page `fontFamily` must exactly match the registered name in `references/fonts.md` (including case/spaces), otherwise PowerPoint does not recognize the embedded font.
6. After export, verify that the output exists and report the generated path. Confirm that every slide has exactly one root-level fade transition in valid CT_Slide order (`cSld`, optional `clrMapOvr`, `transition`, optional `timing/extLst`) and that the PPTX ZIP passes integrity checks. A byte-string search for `<p:fade>` is insufficient because Office ignores transitions nested inside `cSld`. Run the integrity check:

   ```bash
   node /abs/path/to/open-pptd-v2/tests/package-integrity.mjs /abs/path/project/deck.pptx <slideCount>
   ```

   Do not claim PowerPoint/WPS/Keynote playback compatibility solely because ZIP validation succeeds.
7. When the user wants to open, edit, save, or export a PPTD project manually, start the local browser editor with `node bin/open-pptd.js serve --project <project dir>` and ask the user to open the printed local URL in a browser. The editor supports preview, editing, saving back to the project, and one-click PPTX export.
8. Always end the final response with the **preview status** and a concise next step: if the preview server started in step3 is still running, give the URL and how to stop it (or offer to keep it running for further editing); if it was stopped, give the restart command (`node bin/open-pptd.js serve --project <project dir>`). Mention the editor supports preview, editing, slide transitions, and manual PPTX export (or `node bin/open-pptd.js render <deck.pptd> -o <dir>` to export page images for a visual pass). Keep this reminder in addition to, not instead of, the required project and file links.
