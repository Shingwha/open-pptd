#!/usr/bin/env node
// ============================================================================
// tests/tools/parity-baseline.mjs — record the parity baseline (no assertions)
// ----------------------------------------------------------------------------
// Purpose: capture the 2.x numbers W3/W5 will gate against, without changing
// render/measure behavior:
//   · chart pages 1/2 at scale 1/2 (PNG size/hash + a coarse chart-region sample)
//   · table totalHeight/rowHeights/columnWidths (measureTable + layout facts)
//   · text frame heights for the text-heavy project (layout facts)
//
// Writes tests/fixtures/parity/baseline.json; PNGs go to a temp dir and are
// never committed. No Chrome/Edge → print SKIP and exit 0.
//
// Note: 2.x single-page render (`--page n`, n>1) races with page switching and
// often captures page 1, so this script renders the whole deck once per scale
// and picks pages 1/2 from the stable full-deck output. W3 fixes the single-page
// path and can tighten this to a gate.
//
// Usage: node tests/tools/parity-baseline.mjs
// ============================================================================

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

import { findBrowser } from "../../packages/renderer/headless/browser.js";
import { renderDeck } from "../../packages/renderer/headless/shoot.js";
import { startServer } from "../../packages/server/index.js";
import { parseDeck, yaml } from "../../packages/model/index.js";
import { measureTable } from "../../packages/measure/index.js";
import { layout } from "../../packages/layout/index.js";

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

// ---- 0. Environment: no browser → SKIP (exit 0) ----
let browserPath;
try {
  browserPath = findBrowser(null);
} catch (err) {
  console.log(`SKIP  ${err.message}`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Minimal PNG reader for the chart-region sample (8-bit, non-interlaced).
// Palette/16-bit/Adam7 are reported as unsupported instead of guessed.
// ---------------------------------------------------------------------------
const CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 };

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodePng(buf) {
  let pos = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("latin1", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    pos += 12 + len;
  }
  const channels = CHANNELS[colorType];
  if (bitDepth !== 8 || interlace !== 0 || !channels) return null;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(stride * height);
  let p = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[p++];
    const row = y * stride;
    const prev = row - stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? pixels[row + x - channels] : 0;
      const b = y > 0 ? pixels[prev + x] : 0;
      const c = y > 0 && x >= channels ? pixels[prev + x - channels] : 0;
      const v = raw[p + x];
      let out;
      switch (filter) {
        case 0: out = v; break;
        case 1: out = v + a; break;
        case 2: out = v + b; break;
        case 3: out = v + ((a + b) >> 1); break;
        case 4: out = v + paeth(a, b, c); break;
        default: return null;
      }
      pixels[row + x] = out & 0xff;
    }
    p += stride;
  }
  return { width, height, channels, pixels };
}

/** Coarse chart-region sample: central band, every 4px, quantized color count + non-white ratio. */
function chartRegionSample(buf) {
  const img = decodePng(buf);
  if (!img) return { supported: false };
  const { width, height, channels, pixels } = img;
  const x0 = Math.floor(width * 0.10), x1 = Math.floor(width * 0.90);
  const y0 = Math.floor(height * 0.20), y1 = Math.floor(height * 0.95);
  const colors = new Set();
  let sampled = 0, nonWhite = 0;
  for (let y = y0; y < y1; y += 4) {
    for (let x = x0; x < x1; x += 4) {
      const i = (y * width + x) * channels;
      const r = pixels[i], g = channels <= 2 ? pixels[i] : pixels[i + 1], b = channels <= 2 ? pixels[i] : pixels[i + 2];
      colors.add(((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4));
      sampled++;
      if (!(r > 245 && g > 245 && b > 245)) nonWhite++;
    }
  }
  return {
    supported: true,
    region: { x: [x0, x1], y: [y0, y1], step: 4 },
    distinctColors: colors.size,
    nonWhiteRatio: Number((nonWhite / sampled).toFixed(4)),
  };
}

// ---- 1. Chart PNG baseline (full-deck render, then pick pages 1/2) ----
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

// ---- 2. Table facts (measureTable on the parsed model) ----
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

// ---- 3. Text frame facts (layout output for the text-heavy project) ----
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

// ---- 4. Write baseline.json (deterministic: no timestamps/paths) ----
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
