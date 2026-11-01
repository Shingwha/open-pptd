#!/usr/bin/env node
// ============================================================================
// tests/export/run.mjs — ExportService self-test
// ----------------------------------------------------------------------------
// Self-running (lead wires it into tests/run-all.mjs after merge):
//   node tests/export/run.mjs
//
// Coverage:
//   1. report shape + check format (frozen ExportReport fields)
//   2. pptx: chart projector bytes (837227) + PK signature + sink write
//   3. bundle snapshot (runtime serializeDeck) / raw (verbatim disk texts)
//   4. bundle raw on an in-memory project → ERR_BUNDLE_RAW; snapshot without sink → artifacts
//   5. check gate: invalid deck blocks (report.ok=false, no artifact); strict blocks warnings
//   6. PNG errors: no renderBackend → ERR_NO_RENDER_BACKEND; failing backend (fake, no
//      Chrome needed) → ERR_RENDER_BACKEND and pptx/bundle remain usable
//   7. PNG with the Node/headless backend: full-deck 24 pages at scale1, single-page
//      --page 2..8 parity against the full-deck page hashes (the 2.x race captured page 1)
//   8. PNG scale2: 1920×1080, chart-region sampling vs tests/fixtures/parity/baseline.json
//      (nonWhiteRatio/richness), plus backend diagnostics proving chart canvases are 2×
// ============================================================================

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ExportError, EXPORT_ERRORS, exportProject } from "../../packages/export/index.js";
import { createProject } from "../../packages/runtime/index.js";
import { createDiskProjectSource, createFsResourceProvider } from "../../packages/server/runtime-node.js";
import { startServer } from "../../packages/server/index.js";
import { findBrowser } from "../../packages/renderer/headless/browser.js";
import { createHeadlessRenderBackend } from "../../packages/renderer/headless/backend.js";
import { unzip } from "../lib/unzip.js";
import { check, checkEq, results } from "../lib/test-utils.js";
import { chartRegionSample, edgeEnergy } from "../tools/golden-lib.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CHART = join(ROOT, "tests/projects/chart/deck.pptd");
const BASELINE = join(ROOT, "tests/fixtures/parity/baseline.json");
const TMP = join(tmpdir(), `pptd-export-test-${process.pid}`);

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const pngDims = (bytes) => ({ width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function diskProject(rel) {
  const manifestPath = join(ROOT, rel);
  const files = await createDiskProjectSource(manifestPath).read();
  return {
    manifestPath,
    project: createProject(files),
    resources: createFsResourceProvider({ baseDir: files.baseDir }),
  };
}

/** One-shot test servers: keep the suite output clean (the CLI keeps startServer's banner). */
const quietStartServer = (options) => startServer({ ...options, onListen: () => {} });

function memSink() {
  const files = new Map();
  return {
    files,
    sink: {
      writeFile(path, bytes) {
        files.set(path, Uint8Array.from(bytes));
      },
    },
  };
}

function diskSink() {
  return {
    sink: {
      writeFile(path, bytes) {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, bytes);
      },
    },
  };
}

async function expectThrow(fn) {
  try {
    await fn();
    return null;
  } catch (err) {
    return err;
  }
}

// ---------------------------------------------------------------------------
// 1) Report shape + check
// ---------------------------------------------------------------------------
mkdirSync(TMP, { recursive: true });
const { project: chart, resources, manifestPath } = await diskProject("tests/projects/chart/deck.pptd");
const REPORT_KEYS = [
  "ok", "format", "checked", "fetched", "embedded", "skipped", "skippedIcons",
  "missing", "warnings", "errors",
];

{
  const report = await exportProject(chart, { format: "check" }, { resources });
  check("check: ok", report.ok === true);
  checkEq("check: format", report.format, "check");
  const missingKeys = REPORT_KEYS.filter((k) => !(k in report));
  check("check: ExportReport shape", missingKeys.length === 0, missingKeys.join(",") || "all keys");
  check("check: checked counts object", typeof report.checked.fonts === "number" && typeof report.checked.icons === "number" && typeof report.checked.media === "number");
  check("check: no artifact keys", report.outPath == null && report.artifacts == null);
}

// ---------------------------------------------------------------------------
// 2) PPTX
// ---------------------------------------------------------------------------
let pptxBytes = null;
{
  const out = join(TMP, "chart.pptx");
  const report = await exportProject(chart, { format: "pptx", outPath: out, checkLayout: false }, { resources, ...diskSink() });
  check("pptx: ok", report.ok === true);
  check("pptx: file exists", existsSync(out));
  pptxBytes = readFileSync(out);
  checkEq("pptx: chart bytes", pptxBytes.length, 837227);
  checkEq("pptx: PK signature", pptxBytes.toString("latin1", 0, 2), "PK");
  checkEq("pptx: report.outPath", report.outPath, out);
  checkEq("pptx: no fonts embedded", report.embedded.length, 0);
  check("pptx: no pages field", report.pages == null);

  const mem = memSink();
  const memReport = await exportProject(chart, { format: "pptx", outPath: join(TMP, "mem.pptx"), checkLayout: false }, { resources, sink: mem.sink });
  const sinkBytes = mem.files.get(join(TMP, "mem.pptx"));
  // Repeated in-process exports differ in zip/XML timestamps (W2 note), so only the
  // first export of a fresh CLI process is pinned to the 837227-byte fixture.
  check("pptx: sink captured bytes", sinkBytes?.length > 800000 && Buffer.from(sinkBytes).toString("latin1", 0, 2) === "PK", `bytes=${sinkBytes?.length}`);
  check("pptx: sink report.outPath", memReport.outPath === join(TMP, "mem.pptx"));
  rmSync(join(TMP, "mem.pptx"), { force: true });
}

// ---------------------------------------------------------------------------
// 3) Bundle snapshot / raw
// ---------------------------------------------------------------------------
{
  const snapOut = join(TMP, "snap.zip");
  const snap = await exportProject(chart, { format: "bundle", bundleMode: "snapshot", outPath: snapOut, checkLayout: false }, { resources, ...diskSink() });
  check("bundle snapshot: ok", snap.ok === true);
  const snapDir = join(TMP, "snap");
  const snapNames = unzip(readFileSync(snapOut), snapDir);
  check("bundle snapshot: manifest", snapNames.includes("deck.pptd"));
  check("bundle snapshot: pages", snapNames.includes("pages/01-bar.page") && snapNames.includes("pages/24-waterfall-neg.page"));
  checkEq("bundle snapshot: file count", snapNames.length, 1 + chart.deck.pages.length);

  const rawOut = join(TMP, "raw.zip");
  const raw = await exportProject(chart, { format: "bundle", bundleMode: "raw", outPath: rawOut, checkLayout: false }, { resources, ...diskSink() });
  check("bundle raw: ok", raw.ok === true);
  const rawDir = join(TMP, "raw");
  const rawNames = unzip(readFileSync(rawOut), rawDir);
  check("bundle raw: names equal snapshot", JSON.stringify(rawNames) === JSON.stringify(snapNames));
  checkEq("bundle raw: manifest verbatim", readFileSync(join(rawDir, "deck.pptd"), "utf8"), readFileSync(manifestPath, "utf8"));
  checkEq(
    "bundle raw: page verbatim",
    readFileSync(join(rawDir, "pages/02-pie.page"), "utf8"),
    readFileSync(join(dirname(manifestPath), "pages/02-pie.page"), "utf8")
  );
}

// ---------------------------------------------------------------------------
// 4) In-memory project: raw rejected, snapshot returned as artifact
// ---------------------------------------------------------------------------
{
  const memProject = { manifestName: "deck.pptd", manifestPath: "", baseDir: "", pageFiles: new Map(), media: new Map(), deck: chart.deck };
  const err = await expectThrow(() => exportProject(memProject, { format: "bundle", bundleMode: "raw" }, { resources }));
  check("bundle raw: in-memory rejected", err instanceof ExportError && err.code === EXPORT_ERRORS.BUNDLE_RAW, err?.code);

  const snap = await exportProject(memProject, { format: "bundle", bundleMode: "snapshot" }, { resources });
  check("bundle snapshot: no sink → artifacts", snap.ok && Array.isArray(snap.artifacts) && snap.artifacts.length === 1);
  checkEq("bundle snapshot: artifact PK", Buffer.from(snap.artifacts[0].bytes).toString("latin1", 0, 2), "PK");
}

// ---------------------------------------------------------------------------
// 5) Check gate + strict
// ---------------------------------------------------------------------------
{
  const badDeck = {
    version: "v2",
    title: "bad",
    pages: [{ elements: [{ elementId: "x", elementType: "widget", bounds: [0, 0, 10, 10] }] }],
  };
  const report = await exportProject(badDeck, { format: "pptx" }, { resources });
  check("gate: invalid deck blocked", report.ok === false && report.errors.length > 0);
  check("gate: structured check report", report.check && report.check.ok === false);
  check("gate: no artifact", report.artifacts == null && report.outPath == null);

  const { project: tableProject, resources: tableResources } = await diskProject("tests/projects/table/deck.pptd");
  const soft = await exportProject(tableProject, { format: "check" }, { resources: tableResources });
  check("strict: layout warnings present without strict", soft.ok === true && soft.warnings.length > 0, `warnings=${soft.warnings.length}`);
  const strict = await exportProject(tableProject, { format: "check", strict: true, offline: true }, { resources: tableResources });
  check("strict: warnings block", strict.ok === false && strict.errors.some((e) => e.startsWith("strict")));
}

// ---------------------------------------------------------------------------
// 6) PNG error branches (fake backend: also covers the no-Chrome path on CI)
// ---------------------------------------------------------------------------
{
  const noBackend = await expectThrow(() => exportProject(chart, { format: "png", pages: [1] }, { resources }));
  check("png: missing backend clear error", noBackend instanceof ExportError && noBackend.code === EXPORT_ERRORS.NO_RENDER_BACKEND, noBackend?.code);

  let disposed = 0;
  let prepared = 0;
  const failing = async () => ({
    async prepare() {
      prepared++;
      throw new Error("未找到 Chrome/Edge（测试注入：模拟无浏览器）");
    },
    async paint() {},
    async capture() {
      return new Uint8Array([0]);
    },
    async dispose() {
      disposed++;
    },
  });
  const err = await expectThrow(() => exportProject(chart, { format: "png", pages: [1] }, { resources, renderBackend: failing }));
  check(
    "png: backend unavailable → ERR_RENDER_BACKEND",
    err instanceof ExportError && err.code === EXPORT_ERRORS.RENDER_BACKEND && /Chrome\/Edge/.test(err.message),
    err?.code
  );
  check("png: failing backend disposed", prepared === 1 && disposed === 1);

  const after = await exportProject(chart, { format: "pptx", outPath: join(TMP, "after-fail.pptx"), checkLayout: false }, { resources, ...diskSink() });
  const afterBytes = readFileSync(join(TMP, "after-fail.pptx"));
  check(
    "pptx unaffected by PNG failure",
    after.ok === true && afterBytes.length > 800000 && afterBytes.toString("latin1", 0, 2) === "PK",
    `bytes=${afterBytes.length}`
  );
  rmSync(join(TMP, "after-fail.pptx"), { force: true });
}

// ---------------------------------------------------------------------------
// 7) PNG with the real headless backend (skip on machines without Chrome)
// ---------------------------------------------------------------------------
let hasBrowser = true;
try {
  findBrowser();
} catch (e) {
  hasBrowser = false;
  console.log(`SKIP  PNG/scale 用例（${e.message}）`);
}

if (hasBrowser) {
  // Full deck once: the stable reference for single-page parity.
  const fullDir = join(TMP, "png-full");
  const events = [];
  const full = await exportProject(
    chart,
    { format: "png", outPath: fullDir, pages: "all", scale: 1, timeoutMs: 60000 },
    { resources, ...diskSink(), onProgress: (e) => events.push(e), renderBackend: (req) => createHeadlessRenderBackend({ ...req, startServer: quietStartServer, quiet: true }) }
  );
  check("png: full deck ok", full.ok === true && full.files.length === chart.deck.pages.length, `files=${full.files?.length}`);
  check("png: progress events", ["check", "resolve", "backend-ready", "page", "done"].every((s) => events.some((e) => e.stage === s)));
  checkEq("png: report.pages", full.pages.length, chart.deck.pages.length);
  const fullHashes = full.files.map((f) => sha(readFileSync(f)));
  const dims = pngDims(readFileSync(full.files[0]));
  check("png: scale1 960×540", dims.width === 960 && dims.height === 540, `${dims.width}x${dims.height}`);
  check("png: page naming", full.files[0].endsWith("deck-01.png") && full.files[23].endsWith("deck-24.png"));

  // Single page 2..8: must differ from page 1 and equal the full-deck page hash.
  for (let page = 2; page <= 8; page++) {
    const out = join(TMP, `single-${page}.png`);
    const one = await exportProject(
      chart,
      { format: "png", outPath: out, pages: [page], scale: 1, timeoutMs: 60000 },
      { resources, ...diskSink(), renderBackend: (req) => createHeadlessRenderBackend({ ...req, startServer: quietStartServer, quiet: true }) }
    );
    const h = sha(readFileSync(out));
    check(
      `png: single page ${page} parity`,
      one.ok && one.pages[0] === page && h !== fullHashes[0] && h === fullHashes[page - 1],
      `single=${h.slice(0, 8)} full=${fullHashes[page - 1].slice(0, 8)} page1=${fullHashes[0].slice(0, 8)}`
    );
    rmSync(out, { force: true });
  }

  // Scale 2: dimensions + chart-region metrics vs baseline.json + DPR diagnostics.
  const baseline = JSON.parse(readFileSync(BASELINE, "utf8"));
  const base = (page, scale) => baseline.chart.renders.find((r) => r.page === page && r.scale === scale);
  const s2Dir = join(TMP, "png-scale2");
  const s2 = await exportProject(
    chart,
    { format: "png", outPath: s2Dir, pages: [1, 2], scale: 2, timeoutMs: 60000 },
    { resources, ...diskSink(), renderBackend: (req) => createHeadlessRenderBackend({ ...req, startServer: quietStartServer, quiet: true }) }
  );
  const s2p1 = readFileSync(join(s2Dir, "deck-01.png"));
  const s2p2 = readFileSync(join(s2Dir, "deck-02.png"));
  const d1 = pngDims(s2p1), d2 = pngDims(s2p2);
  check("scale2: 1920×1080 both pages", d1.width === 1920 && d1.height === 1080 && d2.width === 1920 && d2.height === 1080);
  check("scale2: pages 1/2 distinct", sha(s2p1) !== sha(s2p2));
  const m1 = chartRegionSample(s2p1);
  const m2 = chartRegionSample(s2p2);
  const b1 = base(1, 2), b2 = base(2, 2);
  const b1s = base(1, 1), b2s = base(2, 1);
  console.log(
    `      scale2 baseline p1=${b1.chartRegion.distinctColors}/${b1.chartRegion.nonWhiteRatio} ` +
      `p2=${b2.chartRegion.distinctColors}/${b2.chartRegion.nonWhiteRatio} | actual p1=${m1.distinctColors}/${m1.nonWhiteRatio} p2=${m2.distinctColors}/${m2.nonWhiteRatio}`
  );
  // The 2.x baseline was captured with a 1× chart canvas stretched to 2×; upscaling
  // adds interpolated shades, so distinctColors is a blur proxy and naturally drops
  // once charts are rasterized at 2×. Content coverage must hold (±5%), and the 2×
  // output must stay at least as rich as the crisp scale-1 baseline.
  check("scale2: p1 nonWhiteRatio >= baseline-5%", m1.supported && m1.nonWhiteRatio >= b1.chartRegion.nonWhiteRatio * 0.95, `actual=${m1.nonWhiteRatio} baseline=${b1.chartRegion.nonWhiteRatio}`);
  check("scale2: p2 nonWhiteRatio >= baseline-5%", m2.supported && m2.nonWhiteRatio >= b2.chartRegion.nonWhiteRatio * 0.95, `actual=${m2.nonWhiteRatio} baseline=${b2.chartRegion.nonWhiteRatio}`);
  check("scale2: p1 colors >= scale1 baseline", m1.supported && m1.distinctColors >= b1s.chartRegion.distinctColors, `actual=${m1.distinctColors} scale1=${b1s.chartRegion.distinctColors}`);
  check("scale2: p2 colors >= scale1 baseline", m2.supported && m2.distinctColors >= b2s.chartRegion.distinctColors, `actual=${m2.distinctColors} scale1=${b2s.chartRegion.distinctColors}`);
  // Sharpness tier: 2x edge energy (normalized by scale) must not fall below the
  // crisp 1x render; a 1x chart upscaled into the 2x surface loses edge contrast.
  const e1s2 = edgeEnergy(s2p1), e2s2 = edgeEnergy(s2p2);
  const e1s1 = edgeEnergy(readFileSync(full.files[0])), e2s1 = edgeEnergy(readFileSync(full.files[1]));
  console.log(`      scale2 edge energy p1=${e1s2} (2x norm ${Number((e1s2 * 2).toFixed(3))}) vs p1@1x=${e1s1} | p2=${e2s2} (2x norm ${Number((e2s2 * 2).toFixed(3))}) vs p2@1x=${e2s1}`);
  check("scale2: p1 sharpness >= 1x tier", e1s2 * 2 >= e1s1 * 0.9, `${Number((e1s2 * 2).toFixed(3))} vs ${e1s1}`);
  check("scale2: p2 sharpness >= 1x tier", e2s2 * 2 >= e2s1 * 0.9, `${Number((e2s2 * 2).toFixed(3))} vs ${e2s1}`);

  // DPR proof: the chart canvas backing store is exactly scale × CSS size.
  const backend = await createHeadlessRenderBackend({ width: 960, height: 540, scale: 2, target: { manifestPath }, startServer });
  try {
    await backend.prepare();
    await backend.paint(1, { pixelRatio: 2 });
    const diag = await backend.diagnostics();
    check("scale2: window DPR = 2", diag.dpr === 2, `dpr=${diag.dpr}`);
    check(
      "scale2: chart canvases 2× backing",
      diag.canvases.length > 0 && diag.canvases.every((c) => c.ratioX === 2 && c.ratioY === 2),
      JSON.stringify(diag.canvases.slice(0, 2))
    );
  } finally {
    await backend.dispose();
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
rmSync(TMP, { recursive: true, force: true });
const failed = results.filter((r) => !r.pass);
console.log(`\nexport: ${results.length - failed.length}/${results.length} 通过${failed.length ? " ❌" : " ✅"}`);
if (failed.length) {
  for (const f of failed) console.log(`  ✗ ${f.name}${f.detail ? ` — ${f.detail}` : ""}`);
  process.exit(1);
}
