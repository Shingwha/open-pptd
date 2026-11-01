#!/usr/bin/env node
// tests/tools/parity-baseline.mjs — record the parity baseline (no assertions).
// Captures chart pages 1/2 at scale 1/2 (PNG size/hash + coarse chart-region sample), table
// totalHeight/rowHeights/columnWidths, and text frame heights. Writes
// tests/fixtures/parity/baseline.json; PNGs go to a temp dir and are never committed.
// Uses a full-deck render because single-page `--page n` (n>1) can capture page 1.
// No Chrome/Edge → print SKIP and exit 0. Usage: node tests/tools/parity-baseline.mjs

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { findBrowser } from "../../packages/renderer/headless/browser.js";
import { renderDeck } from "../../packages/renderer/headless/shoot.js";
import { startServer } from "../../packages/server/index.js";
import { parseDeck, yaml } from "../../packages/model/index.js";
import { measureTable } from "../../packages/measure/index.js";
import { layout } from "../../packages/layout/index.js";
import { chartRegionSample } from "./golden-lib.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CHART = join(ROOT, "tests/projects/chart/deck.pptd");
const OUT = join(ROOT, "tests/fixtures/parity/baseline.json");
const PAGES = [1, 2];
const SCALES = [1, 2];

/** Read a project from disk exactly as the manifest lists its pages (tool-local; public model barrel only). */
function loadProject(manifest) {
  const manifestText = readFileSync(manifest, "utf8");
  const deckDir = dirname(manifest);
  const manifestObj = yaml.load(manifestText);
  const pageFiles = new Map();
  for (const rel of manifestObj?.pages || []) {
    pageFiles.set(String(rel), readFileSync(join(deckDir, String(rel)), "utf8"));
  }
  return { manifestText, pageFiles };
}

// 0. Environment: no browser → SKIP (exit 0).
let browserPath;
try {
  browserPath = findBrowser(null);
} catch (err) {
  console.log(`SKIP  ${err.message}`);
  process.exit(0);
}

// 1. Chart PNG baseline (full-deck render, then pick pages 1/2).
const tmp = join(tmpdir(), `pptd-parity-${process.pid}`);
const renders = [];
for (const scale of SCALES) {
  const dir = join(tmp, `scale-${scale}`);
  const { files } = await renderDeck({
    manifest: CHART,
    outPath: dir,
    scale,
    timeoutMs: 60000,
    quiet: true,
    startServer,
  });
  for (const page of PAGES) {
    const file = join(dir, `deck-${String(page).padStart(2, "0")}.png`);
    if (!existsSync(file)) throw new Error(`缺少渲染产物: ${file}`);
    const buf = readFileSync(file);
    renders.push({
      page,
      scale,
      file: basename(file),
      width: buf.readUInt32BE(16),
      height: buf.readUInt32BE(20),
      bytes: buf.length,
      sha256: createHash("sha256").update(buf).digest("hex"),
      chartRegion: chartRegionSample(buf),
    });
  }
}
rmSync(tmp, { recursive: true, force: true });

// 2. Table facts (measureTable on the parsed model).
const TABLE_PROJECTS = ["tests/projects/table", "examples/business-review-7p"];
const tables = [];
for (const project of TABLE_PROJECTS) {
  const { manifestText, pageFiles } = loadProject(join(ROOT, project, "deck.pptd"));
  const deck = parseDeck(manifestText, pageFiles);
  deck.pages.forEach((pg, index) => {
    for (const el of pg.elements || []) {
      if (el.elementType !== "table") continue;
      const facts = measureTable(el);
      tables.push({
        project,
        page: index + 1,
        elementId: el.elementId,
        declared: el.bounds,
        columnWidths: facts.columnWidths,
        rowHeights: facts.rowHeights,
        totalHeight: facts.totalHeight,
      });
    }
  });
}

// 3. Text frame facts (layout output for the text-heavy project).
const textProject = "tests/projects/text";
const { manifestText, pageFiles } = loadProject(join(ROOT, textProject, "deck.pptd"));
const textDeck = parseDeck(manifestText, pageFiles);
const tree = layout(textDeck);
const round2 = (v) => Math.round(v * 100) / 100;
const textFrames = [];
tree.pages.forEach((pg, index) => {
  const source = textDeck.pages[index].elements || [];
  for (const el of pg.elements) {
    if (!el.text) continue;
    const decl = source.find((e) => e.elementId === el.elementId);
    textFrames.push({
      page: index + 1,
      elementId: el.elementId,
      declaredH: round2(decl?.bounds?.[3] ?? 0),
      frameH: round2(el.frame.h),
      grown: el.grown,
      lines: el.text.lines,
      contentHeight: round2(el.text.contentHeight),
    });
  }
});

// 4. Write baseline.json (deterministic: no timestamps/paths).
const baseline = {
  version: 1,
  generator: "tests/tools/parity-baseline.mjs",
  capturedOn: "2026-10-31",
  environment: {
    node: process.version,
    platform: process.platform,
    browser: basename(browserPath),
  },
  renderNote:
    "Full-deck render (page=all), pages 1/2 extracted; 2.x single-page --page n races and can capture page 1.",
  chart: {
    manifest: "tests/projects/chart/deck.pptd",
    pages: PAGES,
    scales: SCALES,
    renders,
  },
  tables,
  textFrames: {
    project: textProject,
    elements: textFrames,
  },
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(baseline, null, 2)}\n`);

const rendered = renders.map((r) => `page${r.page}@${r.scale}x ${r.width}x${r.height} ${r.bytes}B`).join(", ");
console.log(`parity baseline → ${OUT}`);
console.log(`  chart: ${rendered}`);
console.log(`  tables: ${tables.length} · text frames: ${textFrames.length} (grown ${textFrames.filter((t) => t.grown).length})`);
