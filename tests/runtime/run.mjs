#!/usr/bin/env node
// ============================================================================
// tests/runtime/run.mjs — ProjectRuntime + Node adapters self-test
// ----------------------------------------------------------------------------
// Self-running (lead wires it into tests/run-all.mjs after merge):
//   node tests/runtime/run.mjs
//
// Coverage:
//   1. memorySource: manifest/page/media/revision/capabilities, watch, write
//   2. loadProject/parseProject/createProject: hint passthrough, ProjectFiles normalize
//   3. serializeProject: snapshot round-trip, raw original texts, media bytes
//   4. revision conflict: stale expectedRevision -> RevisionConflictError
//   5. errors: codes/fields for RevisionConflictError/ResourceMissingError/UnsupportedFormatError
//   6. resolveProject: theme/imageMap (file + data URL)/iconMap/fontStatus/missing/unsupported
//   7. checkProject: disk table project parity with the pre-runtime validate chain and checkDeck,
//      CLI check output parity, memory project errors/warnings, layout:false fast path
//   8. Node disk source: tests/projects/text + tests/projects/image (media, unsupported ext)
//   9. CLI loadProjectFiles delegation shape
// ============================================================================

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  IMAGE_EXTS,
  ResourceMissingError,
  RevisionConflictError,
  UnsupportedFormatError,
  assertImageFormat,
  checkProject,
  createProject,
  decodeImageDataUrl,
  loadProject,
  memoryProvider,
  memorySource,
  parseProject,
  requireResource,
  resolveProject,
  serializeProject,
} from "../../packages/runtime/index.js";
import { createDiskProjectSource, createFsResourceProvider } from "../../packages/server/runtime-node.js";
import { loadProjectFiles } from "../../packages/cli/project.js";
import { checkDeck } from "../../packages/cli/check.js";
import { parseDeck } from "../../packages/model/pptd-io.js";
import { validateDeck } from "../../packages/model/validate.js";
import { layout } from "../../packages/layout/index.js";
import { fontMetricsMeasure } from "../../packages/measure/index.js";
import { check, checkEq, results } from "../lib/test-utils.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// 1×1 transparent PNG (valid signature + IHDR/IDAT/IEND, 67 bytes)
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const PNG = new Uint8Array(Buffer.from(PNG_B64, "base64"));

async function throws(name, fn, predicate) {
  try {
    await fn();
    check(name, false, "未抛出");
  } catch (err) {
    check(name, !!predicate(err), predicate(err) ? `${err.code}` : `错误不符: ${err?.code} ${err?.message}`);
  }
}

const MANIFEST = `version: v2\ntitle: 运行时测试\nsize: [960, 540]\npages:\n  - pages/1.page\n`;
const PAGE = `pageType: content\nelements:\n  - elementId: t1\n    elementType: text\n    bounds: [10, 10, 100, 20]\n    content: {text: hello}\n`;

// ---------------------------------------------------------------- 1) memorySource
const mem = memorySource({
  files: {
    "deck.pptd": MANIFEST,
    "pages/1.page": PAGE,
    "media/a.png": PNG,
  },
});
{
  const files = await mem.read();
  checkEq("memorySource capabilities", mem.capabilities, { writable: true, liveWatch: true, binary: true });
  checkEq("memorySource manifest", files.manifestText, MANIFEST);
  checkEq("memorySource pageFiles", [...files.pageFiles.keys()], ["pages/1.page"]);
  check("memorySource media bytes", files.media.get("media/a.png")?.length === PNG.length);
  checkEq("memorySource revision", files.revision, "r0");
  checkEq("memorySource manifestPath", files.manifestPath, "deck.pptd");
}

// ---------------------------------------------------------------- 2) loadProject/parse/create
const loaded = await loadProject("ignored-hint", { source: mem });
{
  checkEq("loadProject normalizes pageFiles to Map", loaded.pageFiles instanceof Map, true);
  checkEq("loadProject normalizes media to Map", loaded.media instanceof Map, true);
  checkEq("loadProject manifestName", loaded.manifestName, "deck.pptd");

  let hintSeen = null;
  const spy = {
    capabilities: { writable: false, liveWatch: false, binary: true },
    async read(hint) {
      hintSeen = hint;
      return loaded;
    },
  };
  await loadProject("my-hint", { source: spy });
  checkEq("loadProject passes read hint", hintSeen, "my-hint");

  const deck = parseProject(loaded);
  checkEq("parseProject title", deck.title, "运行时测试");
  checkEq("parseProject page count", deck.pages.length, 1);
  checkEq("parseProject page path", deck.pages[0]._path, "pages/1.page");

  const project = createProject(loaded);
  checkEq("createProject manifestName", project.manifestName, "deck.pptd");
  checkEq("createProject baseDir", project.baseDir, "");
  check("createProject parses deck", project.deck.pages.length === 1);
  checkEq("createProject keeps revision", project.revision, "r0");
}

// ---------------------------------------------------------------- 3) serialize snapshot/raw
const project = createProject(loaded);
{
  const snap = serializeProject(project, { mode: "snapshot" });
  checkEq("snapshot manifestName", snap.manifestName, "deck.pptd");
  const paths = snap.files.map((f) => f.path);
  checkEq("snapshot file list", paths, ["deck.pptd", "pages/1.page", "media/a.png"]);
  check("snapshot media bytes preserved", snap.files[2].bytes?.length === PNG.length);

  const manifestFile = snap.files[0];
  const pageFile = snap.files[1];
  const reparsed = parseProject({
    manifestText: manifestFile.text,
    pageFiles: new Map([[pageFile.path, pageFile.text]]),
  });
  checkEq("snapshot round-trip title", reparsed.title, "运行时测试");
  checkEq("snapshot round-trip pages", reparsed.pages.length, 1);
  checkEq("snapshot round-trip elementId", reparsed.pages[0].elements[0].elementId, "t1");
  checkEq("snapshot round-trip bounds", reparsed.pages[0].elements[0].bounds, [10, 10, 100, 20]);

  const raw = serializeProject(project, { mode: "raw" });
  checkEq("raw manifest text byte-identical", raw.files[0].text, MANIFEST);
  checkEq("raw page text byte-identical", raw.files[1].text, PAGE);
  check("raw media bytes", raw.files[2].bytes?.length === PNG.length);

  await throws(
    "raw without original texts -> UnsupportedFormatError",
    () => serializeProject({ deck: project.deck }, { mode: "raw" }),
    (err) => err instanceof UnsupportedFormatError && err.code === "ERR_UNSUPPORTED_FORMAT" && err.format === "raw"
  );
}

// ---------------------------------------------------------------- 4) revision + write + watch
{
  const events = [];
  const unwatch = mem.watch((evt) => events.push(evt));
  const n = await mem.write([{ path: "pages/1.page", text: `${PAGE}\n# edited\n` }], {
    expectedRevision: "r0",
  });
  checkEq("memorySource write count", n, 1);
  const after = await mem.read();
  checkEq("memorySource revision after write", after.revision, "r1");
  check("memorySource write visible", after.pageFiles.get("pages/1.page").includes("# edited"));
  checkEq("memorySource watch event", events[0], { kind: "page", path: "pages/1.page" });
  unwatch();

  await throws(
    "stale expectedRevision -> RevisionConflictError",
    () => mem.write([{ path: "pages/1.page", text: PAGE }], { expectedRevision: "r0" }),
    (err) =>
      err instanceof RevisionConflictError &&
      err.code === "ERR_REVISION_CONFLICT" &&
      err.currentRevision === "r1" &&
      err.expectedRevision === "r0"
  );
  const n2 = await mem.write([{ path: "pages/1.page", text: PAGE }]);
  checkEq("unconditional write allowed", n2, 1);
}

// ---------------------------------------------------------------- 5) error types
{
  const rev = new RevisionConflictError("r2", "r1");
  checkEq("RevisionConflictError code", rev.code, "ERR_REVISION_CONFLICT");
  checkEq("RevisionConflictError fields", [rev.currentRevision, rev.expectedRevision], ["r2", "r1"]);

  const missing = new ResourceMissingError("font", { family: "Ghost" });
  checkEq("ResourceMissingError code", missing.code, "ERR_RESOURCE_MISSING");
  checkEq("ResourceMissingError fields", [missing.kind, missing.ref.family], ["font", "Ghost"]);

  const unsupported = new UnsupportedFormatError("webp");
  checkEq("UnsupportedFormatError code", unsupported.code, "ERR_UNSUPPORTED_FORMAT");
  checkEq("UnsupportedFormatError format", unsupported.format, "webp");

  await throws(
    "requireResource throws ResourceMissingError",
    () => requireResource(null, "icon", "fas:nope"),
    (err) => err instanceof ResourceMissingError && err.code === "ERR_RESOURCE_MISSING" && err.kind === "icon"
  );
  checkEq("requireResource passthrough", requireResource("x", "icon", "fas:home"), "x");

  checkEq("assertImageFormat png ok", assertImageFormat(PNG, "png"), PNG);
  await throws(
    "assertImageFormat webp rejected",
    () => assertImageFormat(PNG, "webp"),
    (err) => err instanceof UnsupportedFormatError && err.format === "webp"
  );
  await throws(
    "assertImageFormat signature mismatch rejected",
    () => assertImageFormat(PNG, "jpg"),
    (err) => err instanceof UnsupportedFormatError && err.format === "png"
  );
  checkEq("decodeImageDataUrl png", decodeImageDataUrl(`data:image/png;base64,${PNG_B64}`)?.ext, "png");
  await throws(
    "decodeImageDataUrl webp rejected",
    () => decodeImageDataUrl("data:image/webp;base64,AAAA"),
    (err) => err instanceof UnsupportedFormatError && err.format === "image/webp"
  );
  checkEq("IMAGE_EXTS", [...IMAGE_EXTS].sort(), ["gif", "jpeg", "jpg", "png"]);
}

// ---------------------------------------------------------------- 6) resolveProject
{
  const manifest = `version: v2\ntitle: resolve\nsize: [960, 540]\nfonts:\n  Demo: { family: Demo }\npages:\n  - pages/1.page\n`;
  const page = `pageType: content
elements:
  - elementId: im1
    elementType: image
    bounds: [0, 0, 20, 20]
    src: media/a.png
  - elementId: im2
    elementType: image
    bounds: [20, 0, 20, 20]
    src: data:image/png;base64,${PNG_B64}
  - elementId: im3
    elementType: image
    bounds: [40, 0, 20, 20]
    src: media/missing.png
  - elementId: im4
    elementType: image
    bounds: [60, 0, 20, 20]
    src: media/pic.webp
  - elementId: ic1
    elementType: icon
    bounds: [80, 0, 20, 20]
    iconName: "fas:home"
  - elementId: ic2
    elementType: icon
    bounds: [100, 0, 20, 20]
    iconName: "fas:nope"
  - elementId: t1
    elementType: text
    bounds: [0, 40, 200, 20]
    content:
      text: hello
      fontFamily: Demo
`;
  const source = memorySource({ files: { "deck.pptd": manifest, "pages/1.page": page, "media/a.png": PNG } });
  const files = await source.read();
  const proj = createProject(files);
  const provider = memoryProvider({
    fonts: { Demo: PNG },
    icons: { "fas:home": "<svg>home</svg>" },
    images: { "media/a.png": PNG, "media/pic.webp": PNG },
  });
  const resolved = await resolveProject(proj, { resources: provider });

  checkEq("resolveProject project passthrough", resolved.project === proj, true);
  check("resolveProject theme colors", typeof resolved.theme.colors?.primary === "string");
  checkEq("resolveProject imageMap size", resolved.imageMap.size, 2);
  check("resolveProject image bytes", resolved.imageMap.get("media/a.png").bytes.length === PNG.length);
  checkEq("resolveProject data URL image", resolved.imageMap.get(`data:image/png;base64,${PNG_B64}`)?.ext, "png");
  checkEq("resolveProject iconMap hit", resolved.iconMap.get("fas:home"), "<svg>home</svg>");
  checkEq("resolveProject iconMap miss", resolved.iconMap.get("fas:nope"), null);
  checkEq("resolveProject fontStatus ready", resolved.fontStatus.Demo, "ready");
  checkEq("resolveProject missing images", resolved.missing.images, ["media/missing.png"]);
  checkEq("resolveProject missing icons", resolved.missing.icons, ["fas:nope"]);
  checkEq("resolveProject missing fonts", resolved.missing.fonts, []);
  check(
    "resolveProject unsupported webp diagnosed",
    resolved.unsupported.some((u) => u.kind === "image" && u.ref === "media/pic.webp" && u.format === "webp")
  );

  const deckOnly = await resolveProject(proj.deck, { resources: memoryProvider() });
  checkEq("resolveProject deck-only project field", deckOnly.project, null);
  check("resolveProject deck-only missing fonts", deckOnly.missing.fonts.includes("Demo"));
}

// ---------------------------------------------------------------- 7) checkProject
{
  const tableDir = join(ROOT, "tests/projects/table");
  const tableManifest = join(tableDir, "deck.pptd");
  const source = createDiskProjectSource(tableManifest);
  const files = source.readSync();
  const proj = createProject(files);
  const provider = createFsResourceProvider({ baseDir: tableDir });
  const report = checkProject(proj, {
    resources: provider,
    fileExists: (rel) => existsSync(join(tableDir, rel)),
  });

  // Independent reproduction of the pre-runtime CLI chain (parse -> layout -> validateDeck).
  const deck = parseDeck(files.manifestText, files.pageFiles);
  const baseline = validateDeck(deck, {
    fileExists: (rel) => existsSync(join(tableDir, rel)),
    fontRegistry: provider.fontRegistry,
    iconRegistry: provider.iconRegistry,
    layout: layout(deck, fontMetricsMeasure),
  });

  checkEq("checkProject errors == baseline validateDeck", report.errors, baseline.errors);
  checkEq("checkProject warnings == baseline validateDeck", report.warnings, baseline.warnings);
  checkEq("checkProject ok (warnings only)", report.ok, true);
  checkEq("checkProject warning count", report.warnings.length, 2);
  checkEq("checkProject warning rule", [...new Set(report.warnings.map((w) => w.rule))], ["geometry"]);
  checkEq("checkProject warning pages", report.warnings.map((w) => w.page), [2, 7]);

  const { report: cliReport } = checkDeck(tableManifest);
  checkEq("checkDeck == checkProject", cliReport.warnings, report.warnings);
  checkEq("checkDeck perPage parity", [...cliReport.perPage.keys()], [...report.perPage.keys()]);

  // CLI command output baseline: contract 3.0 keeps the same issue lines/counts, but human
  // text goes to stderr (stdout is reserved for --json single-line output).
  const cli = spawnSync(process.execPath, [join(ROOT, "bin/open-pptd.js"), "check", tableManifest], {
    cwd: ROOT,
    encoding: "utf8",
  });
  checkEq("CLI check exit code", cli.status, 0);
  check("CLI check count line", cli.stderr.includes("0 个错误，2 个警告"));
  check("CLI check warning line", cli.stderr.includes("⚠ [geometry] t1"));
  checkEq("CLI check stdout empty without --json", cli.stdout, "");

  // No layout facts when explicitly disabled (fast structural path).
  const fast = checkProject(proj, { resources: provider, layout: false, fileExists: () => true });
  checkEq("checkProject layout:false skips geometry", fast.warnings.length, 0);
}

// memory project: schema error + missing image warning
{
  const manifest = `version: v2\ntitle: bad\nsize: [960, 540]\npages:\n  - pages/1.page\n`;
  const page = `pageType: content
elements:
  - elementId: x1
    elementType: bogus
    bounds: [0, 0, 10, 10]
  - elementId: im1
    elementType: image
    bounds: [0, 20, 10, 10]
    src: media/missing.png
`;
  const proj = createProject({ manifestText: manifest, pageFiles: new Map([["pages/1.page", page]]), media: new Map() });
  const report = checkProject(proj, { layout: false });
  checkEq("checkProject memory ok=false", report.ok, false);
  check(
    "checkProject memory schema error",
    report.errors.some((e) => e.rule === "schema" && e.elementId === "x1")
  );
  check(
    "checkProject memory missing image warning",
    report.warnings.some((w) => w.rule === "resource" && w.message.includes("图片文件不存在"))
  );
}

// ---------------------------------------------------------------- 8) Node disk source
{
  const textManifest = join(ROOT, "tests/projects/text/deck.pptd");
  const textSource = createDiskProjectSource(textManifest);
  const textFiles = textSource.readSync();
  checkEq("disk source manifest name", textFiles.manifestName, "deck.pptd");
  checkEq("disk source text page count", textFiles.pageFiles.size, 8);
  check("disk source page key", textFiles.pageFiles.has("pages/1_cover.page"));
  check("disk source revision non-empty", typeof textFiles.revision === "string" && textFiles.revision.length > 0);

  const textProject = createProject(textFiles);
  checkEq("disk project deck title", textProject.deck.title, "PPTD v2 格式对齐验证");
  checkEq("disk project deck pages", textProject.deck.pages.length, 8);

  const imageManifest = join(ROOT, "tests/projects/image/deck.pptd");
  const imageSource = createDiskProjectSource(imageManifest);
  const imageFiles = await imageSource.read();
  check("disk read includes referenced media", imageFiles.media.has("media/test.png"));
  const mediaBytes = await imageSource.readMedia("media/test.png");
  check("disk readMedia png bytes", mediaBytes instanceof Uint8Array && mediaBytes[1] === 0x50);
  checkEq("disk readMedia missing", await imageSource.readMedia("media/nope.png"), null);
  checkEq("disk readMedia unsupported ext", await imageSource.readMedia("media/test.svg"), null);
  checkEq("disk readMedia escape rejected", await imageSource.readMedia("../deck.pptd"), null);
}

// ---------------------------------------------------------------- 9) CLI delegation shape
{
  const files = loadProjectFiles("tests/projects/text/deck.pptd");
  checkEq(
    "loadProjectFiles keys",
    Object.keys(files).sort(),
    ["deckDir", "manifestObj", "manifestText", "pageFiles"]
  );
  checkEq("loadProjectFiles deckDir stays relative", files.deckDir, "tests/projects/text");
  checkEq("loadProjectFiles page count", files.pageFiles.size, 8);
  check("loadProjectFiles manifestObj", files.manifestObj.title === "PPTD v2 格式对齐验证");
}

// ---------------------------------------------------------------- summary
const failed = results.filter((r) => !r.pass);
console.log(`\nruntime: ${results.length - failed.length}/${results.length} 通过${failed.length ? " ❌" : " ✅"}`);
if (failed.length) {
  for (const f of failed) console.log(`  ✗ ${f.name}${f.detail ? ` — ${f.detail}` : ""}`);
  process.exit(1);
}
