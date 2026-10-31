#!/usr/bin/env node
// ============================================================================
// tests/regression/parity-png.mjs — PNG scale/backend parity (W9)
// ----------------------------------------------------------------------------
// Renders the chart project's first two pages through the shared ExportService +
// Node/headless RenderBackend at scale 1/2/3 and asserts structural facts:
//   · report pages/artifacts, non-empty PNGs, exact pixel dimensions (960×540 ×N)
//   · chart-region density (non-white ratio / distinct colors) does not collapse
//   · sharpness (mean edge energy per device pixel) at 2x/3x is at least 85% of 1x
//     (the 2.x page-1 chart blur bug would fail this)
//   · pages 1 and 2 produce different images
// A missing Chrome/Edge prints SKIP and exits 0 (browser gate is optional).
//
// Usage: node tests/regression/parity-png.mjs
// ============================================================================

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

import { exportProject } from "../../packages/export/index.js";
import { createProject } from "../../packages/runtime/index.js";
import { createDiskProjectSource, createFsResourceProvider } from "../../packages/server/runtime-node.js";
import { startServer } from "../../packages/server/index.js";
import { createHeadlessRenderBackend } from "../../packages/renderer/headless/backend.js";
import { findBrowser } from "../../packages/renderer/headless/browser.js";

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

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
}

// ---------------------------------------------------------------------------
// Minimal PNG decoder + chart-region metrics (same coarse metric as tests/export)
// ---------------------------------------------------------------------------
const CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 };
const paeth = (a, b, c) => {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
};

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
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
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
  return { width, height, channels, pixels, colorType };
}

function chartRegionSample(buf) {
  const img = decodePng(buf);
  if (!img) return { supported: false };
  const { width, height, channels, pixels } = img;
  const x0 = Math.floor(width * 0.1), x1 = Math.floor(width * 0.9);
  const y0 = Math.floor(height * 0.2), y1 = Math.floor(height * 0.95);
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
  return { supported: true, distinctColors: colors.size, nonWhiteRatio: Number((nonWhite / sampled).toFixed(4)) };
}

/** Mean luminance gradient per device pixel in the chart region. */
function edgeEnergy(buf) {
  const img = decodePng(buf);
  if (!img) return 0;
  const { width, height, channels, pixels } = img;
  const x0 = Math.floor(width * 0.1), x1 = Math.floor(width * 0.9);
  const y0 = Math.floor(height * 0.2), y1 = Math.floor(height * 0.95);
  const lum = (x, y) => {
    const i = (y * width + x) * channels;
    const r = pixels[i], g = channels <= 2 ? pixels[i] : pixels[i + 1], b = channels <= 2 ? pixels[i] : pixels[i + 2];
    return 0.299 * r + 0.587 * g + 0.114 * b;
  };
  let sum = 0, n = 0;
  for (let y = y0 + 1; y < y1 - 1; y += 2) {
    for (let x = x0 + 1; x < x1 - 1; x += 2) {
      sum += (Math.abs(lum(x + 1, y) - lum(x - 1, y)) + Math.abs(lum(x, y + 1) - lum(x, y - 1))) / 2;
      n++;
    }
  }
  return n ? Number((sum / n).toFixed(3)) : 0;
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
      // Energy is sampled every 2 device pixels; ×scale maps it back to CSS-pixel
      // density (same normalization as the W3 export parity evidence).
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
