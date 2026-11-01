#!/usr/bin/env node
// tests/regression/image-alpha.mjs — transparent PNG alpha preservation.
// PPTX media bytes are the original image bytes (no canvas flattening, no re-encode), so a
// transparent PNG stays transparent inside the package. Builds a temp project with a 1×1 RGBA
// PNG, exports via ExportService format=pptx (the CLI/browser path), unzips, and asserts the
// media part is byte-identical and still IHDR color type 6. Pure Node, no Chrome.
// Run: node tests/regression/image-alpha.mjs

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { exportProject } from "../../packages/export/index.js";
import { createProject } from "../../packages/runtime/index.js";
import { createDiskProjectSource, createFsResourceProvider } from "../../packages/server/runtime-node.js";
import { unzip } from "../lib/unzip.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const TMP = mkdtempSync(join(tmpdir(), "pptd-alpha-"));

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
}

/** 1×1 transparent RGBA PNG (bit depth 8, color type 6). */
const ALPHA_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

/** PNG IHDR color type (6 = truecolor + alpha). */
const pngColorType = (bytes) => bytes[25];

try {
  const projectDir = join(TMP, "project");
  mkdirSync(join(projectDir, "pages"), { recursive: true });
  mkdirSync(join(projectDir, "media"), { recursive: true });
  writeFileSync(
    join(projectDir, "deck.pptd"),
    "version: v2\ntitle: 透明图片\nsize: [960, 540]\npages:\n  - pages/1.page\n"
  );
  writeFileSync(
    join(projectDir, "pages", "1.page"),
    [
      "pageType: content",
      "background: {type: solid, color: \"#ffffff\"}",
      "elements:",
      "  - elementId: alpha1",
      "    elementType: image",
      "    bounds: [100, 100, 200, 200]",
      "    src: media/alpha.png",
      "    fit: {mode: contain}",
      "",
    ].join("\n")
  );
  writeFileSync(join(projectDir, "media", "alpha.png"), ALPHA_PNG);

  check("输入 PNG 为 RGBA（IHDR color type 6）", pngColorType(ALPHA_PNG) === 6, `colorType=${pngColorType(ALPHA_PNG)}`);

  const manifestPath = join(projectDir, "deck.pptd");
  const files = await createDiskProjectSource(manifestPath).read();
  const project = createProject(files);
  const resources = createFsResourceProvider({ baseDir: projectDir });
  const report = await exportProject(project, { format: "pptx", embedFonts: false }, { resources });
  check("PPTX 导出成功", report.ok && !!report.artifacts?.[0]?.bytes, JSON.stringify({ ok: report.ok, errors: report.errors }));

  const pptx = report.artifacts[0].bytes;
  const unzipDir = join(TMP, "unzipped");
  mkdirSync(unzipDir, { recursive: true });
  const filesInZip = unzip(Buffer.from(pptx), unzipDir);
  const mediaParts = filesInZip.filter((f) => /^ppt\/media\/.*\.png$/i.test(f));
  check("包内含 PNG 媒体", mediaParts.length === 1, JSON.stringify(mediaParts));

  if (mediaParts.length === 1) {
    const embedded = readFileSync(join(unzipDir, mediaParts[0]));
    check("PPTX 媒体字节 === 输入字节（未压平）", embedded.equals(ALPHA_PNG), `input=${ALPHA_PNG.length} embedded=${embedded.length}`);
    check("包内 PNG 仍为 RGBA（color type 6）", pngColorType(embedded) === 6, `colorType=${pngColorType(embedded)}`);
  }
} catch (err) {
  console.error(err);
  results.push({ name: "测试异常", pass: false });
} finally {
  try {
    rmSync(TMP, { recursive: true, force: true });
  } catch {
    /* cleanup failure does not change the result */
  }
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);
