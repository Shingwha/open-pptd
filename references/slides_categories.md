# PPT category guide

Three orthogonal layers decide a deck — choose each independently:

| Layer | File | Decides |
|---|---|---|
| **Scenario** (how to argue) | this file + `slides_categories/*.md` | reader task, narrative structure, information density, content organization |
| **Visual style** (how it looks) | `styles.md` | light mode, shape language, decoration density, type character |
| **Palette** (which colors) | `themes.md` | the 17-key color set, custom-palette guidelines, presets |

Reading order: follow the general rules below (step1) → pick the scenario and read its document (step2) → pick or confirm the visual style (`styles.md`; every scenario has a default pairing) → design the palette (`themes.md`).

1. **Follow the general rules**: the general rules apply to all scenarios and all pages, and take effect together with the scenario documents and the chosen visual style
2. **Determine the scenario**: choose the matching scenario based on the user's input
3. **Read the scenario document and the style menu**: read the document for that scenario for its argumentation and density, and `styles.md` for the look

## step1. General rules

### Requirements
1. **Every page has a clear reader task**: what this page should make the reader understand, believe, decide, or do — think this through before designing.
2. **Every page has one focal point**: a chart, an image, an oversized number, or one bold statement dominates the composition; everything else is subordinate to it.
3. **Every page carries a visual element**: a diagram, chart, image, or composed shape group — text-only pages are forgettable.
4. **Paging has rhythm**: alternate text-driven, image-driven, and data-driven pages; decide for yourself whether a table of contents or section dividers are needed; the reader should feel a change of rhythm as they flip through — some pages are taken in at a glance, others are worth stopping to read carefully.
5. **Pick layouts by page purpose** — the positive vocabulary below, not a default skeleton.
6. **Every deck has a signature motif**: at least one repeating element group (progress strip, corner brackets, index numerals, section tabs) that recurs across same-kind pages with only its state changing. Distinct page kinds (cover, section dividers, closing, special pages) get their own composition instead of reusing the entry-page template. A motif is an element group — never a bare color bar, sidebar strip, or decorative title underline.
7. **Use charts and shape combinations flexibly**: if a body of information can be expressed through a complex chart that goes beyond what the current chart syntax can express, you are encouraged to flexibly use shapes and other means to construct the expression.
8. **Master-level output**: every PPT is a carefully crafted work of art that could be entered into a competition; pay close attention to every detail of layout, typography, and color — details determine success or failure.
9. **Use image search/generation sensibly**: use image search/generation tools to obtain images and place them in suitable positions. But image abuse is strictly forbidden. If the user's uploaded files contain useful images, use them on suitable pages.
10. **Defer to the user and the subject**: user-specified templates, brand guidelines, color schemes, fonts, and style references take priority over this guide.
11. **Source attribution**: pages involving external facts and data must state the source, date or time period, and measurement basis. Source text should use an <a href="url"> hyperlink pointing to the original report or data page. When citing specific sources in footnotes, likewise use <a href="url"> hyperlinks to the original source to strengthen professional credibility.

### Positive layout vocabulary

Choose the layout from the page's purpose; same-purpose pages may share a skeleton, but a deck must not collapse into one layout:

| Page purpose | Layout direction |
|---|---|
| Opening / closing | bold title compositions — oversized type, asymmetric color swatches, full-bleed image |
| Process / workflow | numbered step chains, chevrons, timelines |
| Comparison | side-by-side panels or a table on the same dimensions |
| Data / metrics | chart-centric layout + oversized stat callouts |
| Key insight | single-statement emphasis — one conclusion sentence with minimal support |
| Peer items | row list (one full-width row per item) or parallel columns — not a card grid |

### Strictly forbidden
- **Evidence boundaries**: do not fabricate data, citations, customer cases, experimental results, or sources; when material is missing, clearly mark it as a placeholder, an assumption, or to-be-supplied information.
- **Classic AI patterns**: it is strictly forbidden to use cards to build hierarchy or alignment (rounded rectangles, rectangular cards, cards with a colored side strip): lines, whitespace, and font-size contrast are better solutions; it is strictly forbidden to use the AI color scheme where red, purple, yellow, and green are all gathered on one page; do not mix elements foreign to the chosen style (e.g. rounded icons or rounded rectangles inside a sharp-cornered style).
- **Template repetition and rigid composition**: do not reuse the same layout on every page (motif-style entry pages that intentionally repeat with state changes are the exception); cap card/tile grids at roughly 1 in 5 content pages and never on consecutive pages; never center body text (center titles only); no decorative underline under titles and no color bars / accent stripes / sidebar strips as motif; do not default to cream/beige backgrounds when unspecified; title-to-body font-size contrast must be obvious (roughly 2× or more).

## step2. Scenario determination
Based on the user's input, analyze the presentation's audience and reader tasks, determine the scenario it belongs to, and read the corresponding scenario document.
> Choose one primary scenario. When truly necessary, you may add one auxiliary scenario, but the primary scenario must prevail.

| Scenario type | Typical queries | Reader task | Scenario document | Default style |
|---|---|---|---|---|
| Analysis & decision | Consulting, finance, industry research, strategy, market opportunities, business analysis, investment analysis | Compare options, form judgments, support decisions | `reference/slides_categories/analysis-decision.md` | `consulting-classic` |
| Business proposal | Marketing plans, sales proposals, fundraising pitches, partnership/investment promotion, product proposals, business plans | Understand the value, believe the plan, take action | `reference/slides_categories/business-plan.md` | `editorial` |
| Management reporting | Work reports, project retrospectives, quarterly summaries, OKR, management briefings | Grasp the current state, surface problems, confirm actions | `reference/slides_categories/management-report.md` | `consulting-classic` |
| Academic research | Graduate research projects, thesis defenses, research projects, proposal reports, mid-term reports, final/concluding reports | Evaluate the problem, method, evidence, and contribution | `reference/slides_categories/academic-research.md` | `swiss-minimal` |
| Education & training / knowledge popularization | K-12 courseware, teaching demonstrations, vocational training, patient education, professional popular science | Understand, remember, apply, or act correctly | `reference/slides_categories/education-training.md` | `editorial` |
| Tech & engineering | Engineering plans, architecture reviews, R&D reports, AI / data / ops / security | See the structure, dependencies, metrics, and trade-offs clearly | `reference/slides_categories/tech-engineering.md` | `swiss-minimal` |
| Brand / creative showcase | Brand stories, design proposals, portfolios, cultural events | Build perception, leave a memory, form identification | `reference/slides_categories/brand-creative.md` | `editorial` |

The default style is the pairing elaborated in each scenario document's visual references; during the interview, offer alternatives from `styles.md` — a different style on the same scenario is usually the fastest way to escape homogenization.
