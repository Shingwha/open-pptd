---
name: open-pptd
description: Create, edit, replicate, read, and export presentations. For every PPT task, the default deliverables are BOTH (1) a self-contained PPTD project folder containing the .pptd manifest plus pages/media dependencies and (2) a locally generated .pptx with embedded fonts and fade slide transitions. Use for any presentation, PowerPoint, PPT/PPTX, slide deck, PPTD, infographic, or poster task unless the user explicitly requests another format. Deliver with normal local file/folder links using absolute paths.
---

# Definition
open-pptd is a presentation creation and export skill built around the PPTD format (YAML 中间格式规范) and a self-developed browser-side PPTX writer. It defines a YAML-format intermediate DSL (`.pptd`) that abstracts OOXML and keeps each page self-contained.

**The default output is not PPTD-only.** Unless the user explicitly opts out, always produce both:

1. the complete editable PPTD project directory (`.pptd` + `pages/` + `media/` and other referenced dependencies);
2. the matching locally generated `.pptx`, with font embedding enabled and fade slide transitions applied by default.

## The pptd format
The .pptd format is a simplified abstraction layer over OOXML that follows basic YAML syntax. This abstraction preserves the core content of OOXML (theme, page layout, element positions and definitions, etc.) while removing complex nesting logic such as Masters; every page is self-contained — what you see is what you get. Read `references/pptd.md` for the complete definition of this DSL.

## 实现能力范围（重要约束）

0. **文件读取边界**：整个工作流只需读取 `references/` 下的文档（pptd.md / themes.md / slides_categories.md 及各场景文档 / shapes.md / icons.md / fonts.md / general-poster.md），在线浏览与 PPTX 导出通过直接运行 `node bin/open-pptd.js serve|export` 和 `node tests/package-integrity.mjs` 完成。**默认不要查看任何源代码**（`editor/`、`lib/`、`bin/`、`scripts/`、`assets/`、`tests/` 下的实现与用例；`docs/` 为开发实现文档，同样默认不读）——除非遇到无法解决的问题（格式疑难、导出异常、编辑器异常等），才允许查阅相关源码定位根因，修复后即止。

1. **格式基线**：严格按 `references/pptd.md` 规范实现（该规范定义了 PPTD v2 的全部格式）；导出目标为 PowerPoint 可无修复打开、渲染与编辑器预览一致的 PPTX。
2. **导出链路**：使用本项目本地导出器 `node bin/open-pptd.js export <deck.pptd> [-o <out.pptx>]`（自研 writer，无浏览器依赖）。
3. **在线浏览/编辑**：`node bin/open-pptd.js serve --project <项目目录>` → 浏览器打开本地编辑器（自研），可预览/编辑/导出。
4. **不支持 pptx → pptd 转换**：本实现没有「导入现有 .pptx 转成 .pptd 项目」的能力。编辑/复刻类任务只能从 .pptd 项目出发（用户提供或新建）。如需处理用户上传的 .pptx：解包查看其内容作为参考（配色/布局/文案），然后在 .pptd 项目中重建，不承诺逐元素还原。
5. **图表限制**：13 种类型中 **heatmap / sankey 暂不导出**（PowerPoint 无原生类型，导出时该元素被跳过、页面留空并告警）——生成时避免使用这两种类型；其余 11 种（bar/line/area/scatter/bubble/candlestick/pie/radar/waterfall/treemap/sunburst）完整导出。
6. **公式**：富文本支持 LaTeX 公式 `\(...\)`（行内/独占段/整框），导出为 PowerPoint 原生可编辑公式（mc:AlternateContent + a14:m）。
7. **图标**：`iconName` 格式 `style:name`。完整可用清单见 `references/icons.md`（AUTO-GENERATED）：
   - `bs:<name>` 直引本地库 192 个图标（优先用，保证存在）；
   - `fas:`/`far:<fa-name>` 按 Font Awesome 语义映射到本地近似图标（仅映射表覆盖的 FA 名可用，约 1100 条）；
   - `fab:` 品牌图标**不支持**（本地库无品牌 logo，用图片元素代替）；
   - 未知图标导出时跳过，生成时必须先查表确认。
8. **形状**：`references/shapes.md` 为完整清单（177 种预置形状 + 参数/默认值），全部支持；`shapeName: "custom"` 可用 viewBox+path 自定义。
9. **主题**：内置 10 套配色预设（完整色值见 `references/themes.md`；编辑器顶栏「配色」面板与 CLI `--theme <key>` 可一键应用/换皮，仅替换 `theme.colors`；图表系列色走主题 accent1-6 色循环）。**默认按内容自定义配色**（每套 PPT 独立设计，避免同质化；须满足 themes.md「自定义配色准则」）；**仅当用户明确要求或与用户讨论后决定采用预设时**，才从 themes.md 选择预设。无论自定义还是预设，都把**完整 17 键色值**写入 `deck.theme.colors`（textStyles/tableStyles 沿用 themes.md 默认模板）+ 页面 `$key` 引用；**禁止用字符串形式引用预设**（如 `theme: "tech"`，非官方格式），deck 必须自包含（主题 = 生成时一次性设计决策）。
10. **字体**：默认 `MiSans`，支持 `references/fonts.md` 所列字体；导出默认嵌入字体（`--no-embed-fonts` 关闭）。

## PPT production workflow

### step1. Read the context thoroughly
Read **all files uploaded by the user**, the provided URLs, and the pptd format guide `references/pptd.md` to fully understand the user's requirements.

### step2. Understand the user's requirements
Understand the user's requirements based on the context:
1. First determine the purpose of the request
  - Create a PPT: create a new presentation (from scratch, or from a .pptd template project)
  - Edit a PPT: edit an existing .pptd project (local modifications, single-page beautification, etc.)
  - Replicate a PPT: replicate a presentation from a non-pptx format (images, PDF, etc.) into pptd format

2. Then determine the design direction
  - Self-directed design: no preference, or only simple style constraints given; you need to fill in or create the design
  - Design system: the user provides a complete and detailed design scheme covering all color, font, layout, and component specifications
  - Use a template: a .pptd template project is provided and must be used
  - Style transfer: a style reference source is provided (images, web pages, etc.)

3. Then determine the input type
  - Topic only: only a PPT topic direction or content requirements for the presentation are given, with no concrete content
  - Full document: the user provides a complete document (paper, research report, press release, etc.)
  - Outline: the user provides a page-by-page outline, speech script, or similar content
  * When the "user input type" is [Full document] or [Outline] and it is not specified whether expansion is allowed: since a page-by-page outline, speech script, or user document can hardly support the full content of a presentation, prefer using search to expand with more relevant material, cases, etc., unless the user explicitly says not to expand

4. Page count
  - If the user requests a specific page count, the user's requirement takes priority
  - Page-by-page outline/script provided: match the number of pages in the outline/script
  - When a complete and relatively structured document is provided / when only a topic is provided: decide the page count yourself based on the document content / search results

### step3. Generate the presentation based on the user's requirements

Before generating, first read `references/pptd.md` to understand the pptd format definition and constraints.

**主题决策（每次生成必做）**：
1. **默认自定义配色**：根据场景特色（行业/受众/用途/内容调性）设计一套专属配色，设计准则见 `references/themes.md`「自定义配色准则」；写入 `deck.pptd` 的 `theme`（colors/textStyles/tableStyles）+ 页面元素用 `$key` 引用；不要引用不存在的 `$key`，不要用字符串形式引用预设（`theme: "键名"`）。
2. **预设仅作备选**：用户明确要求使用内置主题色、或与用户讨论后决定采用预设时，才从 `references/themes.md` 的 10 套预设中选择（场景映射见总览表），将该套完整 17 键色值写入 `theme.colors`。
3. **交付时给出配色建议**：说明本套配色的设计思路（主色/点缀色/图表系列色的选择逻辑），并主动给出可替换的备选预设（如「若想要更沉稳的商务感，可换 consult 咨询蓝」）——用户后续可用编辑器「配色」面板或 CLI `--theme <key>` 一键换皮。

#### Replicating a PPT
- Analyze the images to estimate element positions, fonts and sizes, etc., and **replicate 1:1 as closely as possible**.
- When an image contains elements that are hard to replicate directly and cannot be approximated with icons/shapes (e.g., photos, avatars), you may use tools such as bash or python to crop and screenshot the original image

#### Editing a PPT
- The user's deck is a .pptd project (`.pptd` manifest + `pages/*.page` + `media/`). Read the manifest and all page files to understand the current structure and styling.
- Review the pages (structure and key visual details). Read a few key pages individually afterwards.
- Locate the pages to edit, and be careful not to affect parts outside the intended scope.
> 不支持 pptx → pptd 转换：若用户提供的是 .pptx 并要求修改，解包 .pptx 查看目标页的布局/文案/配色作为参考，在 .pptd 项目中重建该页，不承诺逐元素还原（见「实现能力范围」）。

#### Generating a PPT
When generating a PPT, adopt different production approaches for different user [design directions]
##### Self-directed design
1. Read the design guide `references/slides_categories.md`, and read the scenario document corresponding to the user's query
2. Produce the presentation based on the above

#### Generating content in other formats
- When the user explicitly asks for an infographic, poster, or a highly visual single-page design, read `references/general-poster.md` and implement it as a single-page or few-page editable PPTD; when the user only asks for an image, still build it with PPTD first, then output the image via screenshot or rendering. Do not load this reference file for ordinary PPT requests.

##### Design system
1. Read the general constraints section of the `references/slides_categories.md` guide, and read the scenario document corresponding to the user's query as the design foundation
2. Read the user-provided design system document as the presentation style. It is strictly forbidden to reference or mix in other design styles
3. Produce the presentation with reference to the above

##### Using a template
1. Use the user-provided .pptd template project directly (manifest + pages + media)
2. Review the template pages to understand the template's visual style (color scheme, font style, element characteristics, layout characteristics, content density, etc.)
3. Identify page types; focus on reading special pages such as the cover, summary pages, and section dividers, extracting their page layouts, content structures, reusable components (icons, shapes, smartart, reusable body layout schemes, etc.), and element styles (e.g., whitespace/line/card separators, square/rounded corners, etc.)
4. Produce the presentation using the template

##### Style transfer
1. Analyze the reference file's visual style (color scheme, font style, element characteristics, layout characteristics, content density, etc.), page layouts, content structures, reusable components (icons, shapes, smartart, reusable body layout schemes, etc.), and element styles (e.g., whitespace/line/card separators, square/rounded corners, etc.).
- If the user provides a style reference URL, do not only read the text content; refer to and learn from the page's visual effect more to help understand the style
2. Produce the presentation using the reference file's style characteristics. You are encouraged to reuse illustrations, fonts, font-size hierarchies, elements, etc. from the original pdf/url

### step4. PPT validation
1. Validate the generated pptd against the format definition in `references/pptd.md` (required fields, types, bounds, theme tokens, resource paths, etc.) and repair issues over multiple rounds
2. Visual review with exported page images — **required before PPTX export when the model supports image input (multimodal)**:
   - Start the local editor and preview every page in the browser:
     ```bash
     node bin/open-pptd.js serve --project /abs/path/project
     ```
     Then open the local URL in a browser and review each page against this list:
     1. 图片是否清晰、不变形（无拉伸、压缩、模糊）
     2. 文字是否压在关键画面（人脸、产品主体、Logo 等）上
     3. 元素坐标是否超出页面边界
     4. 边界与配色对比是否足够（文字与背景、相邻色块之间）
     5. 排版是否统一（对齐、间距、字号层级、页边距）
     6. 文字是否可能溢出文本框（文本过长、行距过密、字号过大）
     7. 内容是否被上层元素遮挡
   - For any suspicious page, review its source `.page` file to confirm the problem before editing.
   - Fix issues in the corresponding `.page` file, re-render the preview and review again; repeat until every page passes.
   - Do not export the PPTX until the visual review passes.
3. When the model cannot read images, fall back to a structural review of the generated pages (bounds, overflow-prone long text, contrast, hierarchy, layout density) over multiple rounds, and state that image-based visual QA was skipped.

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
   - page transition: `fade` (淡入淡出), written to every slide by the local writer;
   - font embedding: enabled by default; may be disabled with `--no-embed-fonts`;
   - embedded fonts require the font files to be resolvable locally (see `references/fonts.md` → PPTX 字体嵌入方法). **嵌入注册名规则**：页面 `fontFamily` 必须与字体 name 表 ID16（无则取 ID1）完全一致，否则 PowerPoint 不认嵌入字体（含大小写/空格，见 fonts.md）
6. After export, verify that the output exists and report the generated path. Confirm that every slide has exactly one root-level fade transition in valid CT_Slide order (`cSld`, optional `clrMapOvr`, `transition`, optional `timing/extLst`) and that the PPTX ZIP passes integrity checks. A byte-string search for `<p:fade>` is insufficient because Office ignores transitions nested inside `cSld`. Run the integrity check:

   ```bash
   node /abs/path/to/open-pptd-v2/tests/package-integrity.mjs /abs/path/project/deck.pptx <slideCount>
   ```

   Do not claim PowerPoint/WPS/Keynote playback compatibility solely because ZIP validation succeeds.
7. When the user wants to open, edit, save, or export a PPTD project manually, start the local browser editor with `node bin/open-pptd.js serve --project <项目目录>` and ask the user to open the printed local URL in a browser. The editor supports preview, editing, saving back to the project, and one-click PPTX export.
8. After completing and delivering any presentation, always end the final response with a concise optional next step telling the user that they can run `node bin/open-pptd.js serve --project <项目目录>` to view or edit the PPTD project, configure slide transition animations, and export PPTX manually. Keep this reminder in addition to, not instead of, the required project and file links.
