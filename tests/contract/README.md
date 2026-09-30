# tests/contract — package-level public contract test

This group freezes **contract 4 (package entries)**: the export names of the `packages/*/index.js`
barrels, `CONTRACT_VERSION`, and the one-to-one consistency between `contract.json` and
`package.json`'s `exports`.

Difference from `tests/regression/`: `tests/regression/` verifies **runtime behavior** (exporting a
PPTX, rendering, dependency direction); `tests/contract/` verifies only the **public interface
shape**. It is fast, needs no example project, and produces no artifacts. It is part of
`tests/run-all.mjs` (since the boot-seam wave) and can also be run standalone on demand.

## Run

```sh
node tests/contract/public-api.mjs
```

Exit code 0 = contract holds; non-zero = contract broken (it prints each missing export name or drift).

## Coverage

1. Export names and types of the five existing barrels (model / renderer / writer / server / cli)
   (the list = spec `docs/specs/01-engine-api.md` T1, i.e. `integration-plan.md` appendix D.1);
   plus spot checks of named members inside the `chart` / `icons` / `fonts` / `bytes` /
   `renderers` / `xml` / `parts` / `text` namespaces.
2. `packages/index.js`'s `CONTRACT_VERSION === 2`, matching `contract.json`'s `contractVersion`.
3. `contract.json` parses; the corresponding `entries` and `package.json` `exports` entries match
   **one-to-one in both directions** (either side having an extra or missing item fails); `bin` matches on both sides.
4. The three dual-end barrels (model / renderer / writer) contain no `node:` / bare `fs` /
   `window.` / `document.` / `headless/` in their sources (browser safety constraint, complementing dep-graph).
