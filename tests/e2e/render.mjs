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
const rightBottom = await import("node:zlib").then(async ({ inflateSync }) => {
  let pos = 8;
  const idat = [];
  while (pos < sb.length) {
    const len = sb.readUInt32BE(pos);
    const type = sb.toString("ascii", pos + 4, pos + 8);
    if (type === "IDAT") idat.push(sb.subarray(pos + 8, pos + 8 + len));
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = sw * 4 + 1;
  const colors = new Set();
  for (let y = sh / 2; y < sh; y += 40) {
    for (let x = 1 + (sw / 2) * 4; x < stride; x += 40) {
      const i = y * stride + x;
      colors.add((raw[i] >> 4) << 8 | (raw[i + 1] >> 4) << 4 | (raw[i + 2] >> 4));
    }
  }
  return colors.size;
});
record("scale=2 右下角区域有内容（无白边）", rightBottom > 5, `colors=${rightBottom}`);
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
