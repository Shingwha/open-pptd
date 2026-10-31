# Kits

A kit is a **page-recipe library for one audience**, not a deck template. It
names the narrative, the pages that audience expects, their density and
evidence rules, and two or three visual directions. You still decide the page
order, the page count, the copy, and the theme for each deck.

## Selection

| Kit | System | Choose when |
|---|---|---|
| `academic/` | academic | Thesis defense, paper/proposal report, research review; the reader judges method and evidence. |
| `business-review/` | executive | Quarterly/monthly review, management report, business update; the reader needs status, drivers, risks, and actions. |
| `consulting-report/` | executive | Strategy study, diagnosis, options appraisal; the reader must commit to a recommendation. |
| `brand-proposal/` | editorial | Brand/creative proposal, campaign pitch, visual direction; the reader must believe a concept. |

Rules:

- Pick **one primary kit**. A secondary kit is allowed only when the story
  changes mode (for example an academic deck with one business-impact page);
  say which is primary and keep its system.
- A user-supplied brand guide, template, or design system overrides the kit's
  visual direction, but the kit's narrative and evidence rules still apply.
- Do not concatenate kits. Do not reuse a kit as a finished deck. Do not copy
  a page recipe verbatim without adapting slots to this deck's content.
- Change variants between consecutive pages. The recipes offer 2–3 variants
  each; alternating them is the cheapest defense against homogenization.

## Kit contract

Every kit directory contains:

```text
kit.md          audience, narrative, required/optional pages, density,
                evidence rules, do/don't, anti-homogenization rules
theme.md        one visual system + 2–3 palette/font directions (seeds, not
                a locked theme file)
pages/*.md      one recipe per page type: purpose, reader task, slots,
                2–3 variants, selection rule, type/density, chart/table
                discipline, caption/source requirements, do/don't
fragments/*.page real single-page YAML, safe to copy and adapt; no missing
                media, no undeclared fonts
```

A recipe is guidance, not a form. If the content does not fit a slot, change
the recipe or use another one — do not invent filler to fill a box.

## Adding a kit (maintainers)

Add `kits/<name>/{kit.md,theme.md,pages/,fragments/}` following the contract
above, map it to one of the four systems in `references/design.md`, and add a
row to the table. Keep fragments single-page and asset-free; verify them with
`node tests/skill/run.mjs`.
