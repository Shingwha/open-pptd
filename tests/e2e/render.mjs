#!/usr/bin/env node
// ============================================================================
// tests/e2e/render.mjs — render smoke test (headless per-page PNG)
// ----------------------------------------------------------------------------
// Usage: node tests/e2e/render.mjs   (needs a local Chrome/Edge; SMOKE_CHROME can point at its path)
// Covers:
//   1. Full-page render of tests/projects/chart (all chart types) → PNG count, size, non-empty
//   2. Single-page render (--page semantics) → exactly 1 file, correctly named
//   3. The process can exit naturally (event loop drains after renderDeck returns, no leaked handles/timers)
// ============================================================================

import { readFileSync, existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderDeck } from "../../packages/renderer/headless/shoot.js";
import { findBrowser } from "../../packages/renderer/headless/browser.js";
import { startServer } from "../../packages/server/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL = join(__dirname, "../..");
const CHART_PROJECT = join(SKILL, "tests", "projects", "chart");
const MANIFEST = join(CHART_PROJECT, "deck.pptd");
const OUT = join(SKILL, "tests", "render-out-tmp");

const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
}

// ---------------------------------------------------------------------------
// Minimal PNG decode helpers (zero dependencies).
// A PNG's IDAT payload is zlib-compressed scanlines; each scanline is one filter
// byte (0=None/1=Sub/2=Up/3=Average/4=Paeth) followed by raw bytes. The filter byte
// MUST be undone before the bytes mean anything as pixels — reading IDAT directly as
// RGBA smears the Sub/Up/Paeth residuals and collapses flat regions to a handful of
// "colors".
// Decoder scope: 8-bit, non-interlaced colorType 0/2/4/6 (grey / RGB / grey+alpha /
// RGBA). Palette (3), 16-bit and Adam7 need tables/extra passes this smoke test does
// not need — the caller reports those as SKIP instead of guessing.
// ---------------------------------------------------------------------------
const CHANNELS_BY_COLOR_TYPE = { 0: 1, 2: 3, 4: 2, 6: 4 };

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/** Undo PNG scanline filtering → a packed byte buffer (width*height*bpp). */
function unfilterScanlines(raw, width, height, bpp) {
  const stride = width * bpp;
  const out = Buffer.alloc(stride * height);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const rowStart = y * stride;
    const prevStart = rowStart - stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[rowStart + x - bpp] : 0;
      const b = y > 0 ? out[prevStart + x] : 0;
      const c = y > 0 && x >= bpp ? out[prevStart + x - bpp] : 0;
      const v = raw[pos + x];
      let r;
      switch (filter) {
        case 0: r = v; break;
        case 1: r = v + a; break;
        case 2: r = v + b; break;
        case 3: r = v + ((a + b) >> 1); break;
        case 4: r = v + paethPredictor(a, b, c); break;
        default: throw new Error(`unknown PNG filter type ${filter} on row ${y}`);
      }
      out[rowStart + x] = r & 0xff;
    }
    pos += stride;
  }
  return out;
}

/** Concatenate the IDAT payload(s) of a PNG byte buffer. */
function concatIdat(buf) {
  const idat = [];
  let pos = 8;
  while (pos + 12 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    if (type === "IDAT") idat.push(buf.subarray(pos + 8, pos + 8 + len));
    if (type === "IEND") break;
    pos += 12 + len;
  }
  return Buffer.concat(idat);
}

/** Read an (r,g,b) triple for pixel (x,y) out of an unfiltered 8-bit buffer. */
function pixelRgb(pixels, x, y, stride, channels) {
  const i = y * stride + x * channels;
  if (channels <= 2) return [pixels[i], pixels[i], pixels[i]]; // grey / grey+alpha
  return [pixels[i], pixels[i + 1], pixels[i + 2]];
}

// No browser → clear message and exit (matches the other tests/e2e)
try {
  findBrowser();
} catch (e) {
  console.error(`SKIP  ${e.message}`);
  process.exit(0);
}

rmSync(OUT, { recursive: true, force: true });

// ---- 1. Full-page render ----
const pageCount = readdirSync(join(CHART_PROJECT, "pages")).filter((f) => f.endsWith(".page")).length;
const t0 = Date.now();
const { files, count } = await renderDeck({
  manifest: MANIFEST,
  outPath: OUT,
  scale: 1,
  timeoutMs: 30000,
  quiet: true,
  startServer,
});
const elapsed = Date.now() - t0;
record("页面数一致", count === pageCount, `count=${count} expected=${pageCount}`);
record("输出文件数一致", files.length === pageCount, `files=${files.length}`);
record("渲染耗时合理（<60s）", elapsed < 60000, `${elapsed}ms`);

let dimsOk = true;
let nonEmptyOk = true;
for (const f of files) {
  const b = readFileSync(f);
  if (!(b.length > 4 && b.toString("latin1", 0, 4) === "\x89PNG")) nonEmptyOk = false;
  const w = b.readUInt32BE(16);
  const h = b.readUInt32BE(20);
  if (w !== 960 || h !== 540) dimsOk = false;
  if (b.length < 5000) {
    nonEmptyOk = false;
      console.log(`      ${f} only ${b.length} bytes, looks blank`);
  }
}
record("全部 PNG 尺寸 960×540", dimsOk);
record("全部 PNG 非空（>5KB）", nonEmptyOk);

// ---- 2. Single-page render (--page semantics) ----
rmSync(OUT, { recursive: true, force: true });
const single = await renderDeck({
  manifest: MANIFEST,
  outPath: OUT,
  page: 3,
  scale: 1,
  timeoutMs: 30000,
  quiet: true,
  startServer,
});
const singleFiles = readdirSync(OUT);
record(
  "单页渲染只出 1 张且命名正确",
  single.files.length === 1 && singleFiles.length === 1 && /deck-03\.png$/.test(singleFiles[0]),
  singleFiles.join(",")
);

// ---- 2.5 scale>1: the viewport stays canvas-sized, only the output resolution scales
//      (guards against content shrinking into the top-left with a white margin) ----
rmSync(OUT, { recursive: true, force: true });
const scaled = await renderDeck({
  manifest: MANIFEST,
  outPath: OUT,
  page: 1,
  scale: 2,
  timeoutMs: 30000,
  quiet: true,
  startServer,
});
const scaledFile = join(OUT, "deck-01.png");
const sb = readFileSync(scaledFile);
const sw = sb.readUInt32BE(16);
const sh = sb.readUInt32BE(20);
record("scale=2 输出 1920×1080", sw === 1920 && sh === 1080, `${sw}x${sh}`);
// the bottom-right quarter must not be all white (content fills the canvas, not a top-left thumbnail)
const bitDepth = sb[24];
const colorType = sb[25];
const interlace = sb[28];
const channels = CHANNELS_BY_COLOR_TYPE[colorType];
if (bitDepth === 8 && interlace === 0 && channels) {
  const raw = inflateSync(concatIdat(sb));
  const pixels = unfilterScanlines(raw, sw, sh, channels);
  const stride = sw * channels;
  const colors = new Set();
  // Sample the bottom-right quarter densely enough to catch anti-aliased text/edges
  // (a sparse grid lands only on flat fills and undercounts).
  for (let y = Math.floor(sh / 2); y < sh; y += 8) {
    for (let x = Math.floor(sw / 2); x < sw; x += 8) {
      const [r, g, b] = pixelRgb(pixels, x, y, stride, channels);
      colors.add((r >> 4) << 8 | (g >> 4) << 4 | (b >> 4));
    }
  }
  record("scale=2 右下角区域有内容（无白边）", colors.size > 5, `colors=${colors.size}`);
} else {
  // Palette (3), 16-bit and Adam7 need tables/extra passes the decoder above does not
  // implement — report it instead of guessing.
  console.log(`SKIP  scale=2 右下角像素断言（PNG colorType=${colorType} bitDepth=${bitDepth} interlace=${interlace}）`);
  record("scale=2 右下角区域有内容（无白边）", true, `SKIP（不支持的 PNG 格式 colorType=${colorType} bitDepth=${bitDepth}）`);
}
rmSync(OUT, { recursive: true, force: true });

// ---- 3. The process can exit naturally: check for leaked timers (500ms after renderDeck returns) ----
await new Promise((r) => setTimeout(r, 500));
// Node internal API: count active timers (0 = no leak)
const timers = process._getActiveHandles().filter((h) => h.constructor.name === "Timeout").length;
record("无残留定时器（进程可退出）", timers === 0, `timeouts=${timers}`);

rmSync(OUT, { recursive: true, force: true });

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${failed === 0 ? "✓" : "✗"} render 冒烟测试 ${results.length - failed}/${results.length} 通过`);
process.exit(failed ? 1 : 0);
