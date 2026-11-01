#!/usr/bin/env node
// tests/regression/parity-png.mjs — PNG scale/backend parity.
// Renders the chart project's first two pages through the shared ExportService + Node/headless
// RenderBackend at scale 1/2/3: report pages/artifacts, exact 960×540 ×N dimensions, chart-region
// density stable, edge energy at 2x/3x ≥ 85% of 1x (per CSS pixel), and pages 1 and 2 differ.
// A missing Chrome/Edge prints SKIP and exits 0.
// Usage: node tests/regression/parity-png.mjs

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { exportProject } from "../../packages/export/index.js";
import { createProject } from "../../packages/runtime/index.js";
import { createDiskProjectSource, createFsResourceProvider } from "../../packages/server/runtime-node.js";
import { startServer } from "../../packages/server/index.js";
import { createHeadlessRenderBackend } from "../../packages/renderer/headless/backend.js";
import { findBrowser } from "../../packages/renderer/headless/browser.js";
import { check, results } from "../lib/test-utils.js";
import { chartRegionSample, edgeEnergy } from "../tools/golden-lib.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MANIFEST = join(ROOT, "tests/projects/chart/deck.pptd");
const TMP = mkdtempSync(join(tmpdir(), "pptd-parity-png-"));

try {
  findBrowser();
} catch (err) {
  console.log(`SKIP  未找到 Chrome/Edge（${err.message}）`);
  rmSync(TMP, { recursive: true, force: true });
  process.exit(0);
}

const quietStartServer = (options) => startServer({ ...options, onListen: () => {} });

try {
  const files = await createDiskProjectSource(MANIFEST).read();
  const project = createProject(files);
  const resources = createFsResourceProvider({ baseDir: files.baseDir });
  const metrics = {};

  for (const scale of [1, 2, 3]) {
    const report = await exportProject(
      project,
      { format: "png", pages: [1, 2], scale, backend: "headless" },
      {
        resources,
        renderBackend: (options) => createHeadlessRenderBackend({ ...options, startServer: quietStartServer }),
      }
    );
    check(`scale=${scale} 导出成功`, report.ok && report.pages?.join(",") === "1,2", JSON.stringify({ ok: report.ok, errors: report.errors }));
    const artifacts = report.artifacts || [];
    check(`scale=${scale} 产出 2 张`, artifacts.length === 2, `files=${artifacts.length}`);
    for (let i = 0; i < artifacts.length; i++) {
      const bytes = Buffer.from(artifacts[i].bytes);
      const dims = { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
      const page = report.pages[i];
      check(
        `scale=${scale} page${page} 尺寸 ${960 * scale}×${540 * scale}`,
        dims.width === 960 * scale && dims.height === 540 * scale && bytes.length > 1000,
        `${dims.width}x${dims.height} bytes=${bytes.length}`
      );
      const sample = chartRegionSample(bytes);
      check(
        `scale=${scale} page${page} 图表区域有内容`,
        sample.supported && sample.distinctColors >= 8 && sample.nonWhiteRatio >= 0.05,
        JSON.stringify(sample)
      );
      const energy = edgeEnergy(bytes);
      const key = `p${page}`;
      metrics[key] ||= {};
      // Energy is sampled every 2 device pixels; ×scale maps it back to CSS-pixel density.
      metrics[key][scale] = { energy, normalized: Number((energy * scale).toFixed(3)), ...sample };
    }
  }

  for (const page of [1, 2]) {
    const m = metrics[`p${page}`];
    check(
      `page${page} 2x/3x 清晰度不低于 1x 的 85%（按 CSS 像素归一）`,
      m[2].normalized >= m[1].energy * 0.85 && m[3].normalized >= m[1].energy * 0.85,
      `1x=${m[1].energy} 2x=${m[2].normalized} 3x=${m[3].normalized}`
    );
    check(
      `page${page} 非白比例随 scale 稳定`,
      Math.abs(m[2].nonWhiteRatio - m[1].nonWhiteRatio) < 0.05 && Math.abs(m[3].nonWhiteRatio - m[1].nonWhiteRatio) < 0.05,
      `1x=${m[1].nonWhiteRatio} 2x=${m[2].nonWhiteRatio} 3x=${m[3].nonWhiteRatio}`
    );
  }
  console.log(`  metrics ${JSON.stringify(metrics)}`);
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
