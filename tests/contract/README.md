# tests/contract — package-level public contract test

This group freezes **contract 3.0 (package entries)**: the export names of the `packages/*/index.js`
barrels, `CONTRACT_VERSION`, and the one-to-one consistency between `contract.json` and
`package.json`'s `exports` (including the absence of `./internal/*`).

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

1. Export names and types of the barrels (model / renderer / writer / runtime / export / server / cli)
   (the list is asserted by this test and mirrored in `contract.json`; run `node tests/contract/public-api.mjs`);
   plus spot checks of named members inside the `chart` / `icons` / `fonts` / `bytes` /
   `renderers` / `xml` / `parts` / `text` namespaces.
2. `packages/index.js`'s `CONTRACT_VERSION === 3`, matching `contract.json`'s `contractVersion`;
   the root entry exports the dual-end core and no longer re-exports server/cli.
3. `contract.json` parses; the corresponding `entries` and `package.json` `exports` entries match
   **one-to-one in both directions** (either side having an extra or missing item fails); `bin` matches on both sides.
4. The five dual-end barrels (model / renderer / writer / runtime / export) contain no `node:` / bare `fs` /
   `window.` / `document.` / `headless/` in their sources (browser safety constraint, complementing dep-graph).
