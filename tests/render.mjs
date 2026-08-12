#!/usr/bin/env node
// ============================================================================
// tests/render.mjs — render 冒烟测试（无头渲染逐页 PNG）
// ----------------------------------------------------------------------------
// 用法: node tests/render.mjs   （需要本机 Chrome/Edge；SMOKE_CHROME 可指定路径）
// 覆盖:
//   1. 全页渲染 tests/projects/chart（14 页，覆盖全部图表类型）→ PNG 数量、尺寸、非空
//   2. 单页渲染（--page 语义）→ 只出 1 张且命名正确
//   3. 进程可自然退出（renderDeck 返回后事件循环清空，不残留句柄/定时器）
// ============================================================================

import { readFileSync, existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderDeck, findBrowser } from "../lib/pptd-render.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL = join(__dirname, "..");
const CHART_PROJECT = join(SKILL, "tests", "projects", "chart");
const MANIFEST = join(CHART_PROJECT, "deck.pptd");
const OUT = join(SKILL, "tests", "render-out-tmp");

const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
}

// 浏览器不存在 → 明确提示后退出（与 tests/e2e 一致）
try {
  findBrowser();
} catch (e) {
  console.error(`SKIP  ${e.message}`);
  process.exit(0);
}

rmSync(OUT, { recursive: true, force: true });

// ---- 1. 全页渲染 ----
const pageCount = readdirSync(join(CHART_PROJECT, "pages")).filter((f) => f.endsWith(".page")).length;
const t0 = Date.now();
const { files, count } = await renderDeck({
  manifest: MANIFEST,
  outPath: OUT,
  scale: 1,
  timeoutMs: 30000,
  quiet: true,
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
    console.log(`      ${f} 仅 ${b.length} 字节，疑似空白页`);
  }
}
record("全部 PNG 尺寸 960×540", dimsOk);
record("全部 PNG 非空（>5KB）", nonEmptyOk);

// ---- 2. 单页渲染（--page 语义）----
rmSync(OUT, { recursive: true, force: true });
const single = await renderDeck({
  manifest: MANIFEST,
  outPath: OUT,
  page: 3,
  scale: 1,
  timeoutMs: 30000,
  quiet: true,
});
const singleFiles = readdirSync(OUT);
record(
  "单页渲染只出 1 张且命名正确",
  single.files.length === 1 && singleFiles.length === 1 && /deck-03\.png$/.test(singleFiles[0]),
  singleFiles.join(",")
);

// ---- 2.5 scale>1：视口恒为画布尺寸，仅放大输出分辨率（防内容缩左上角+白边回归）----
rmSync(OUT, { recursive: true, force: true });
const scaled = await renderDeck({
  manifest: MANIFEST,
  outPath: OUT,
  page: 1,
  scale: 2,
  timeoutMs: 30000,
  quiet: true,
});
const scaledFile = join(OUT, "deck-01.png");
const sb = readFileSync(scaledFile);
const sw = sb.readUInt32BE(16);
const sh = sb.readUInt32BE(20);
record("scale=2 输出 1920×1080", sw === 1920 && sh === 1080, `${sw}x${sh}`);
// 右下 1/4 区域不应全白（内容铺满，非左上角缩图）
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

// ---- 3. 进程可自然退出：检查残留定时器（renderDeck 返回 500ms 后）----
await new Promise((r) => setTimeout(r, 500));
// Node 内部 API：统计活跃定时器数量（0 = 无泄漏）
const timers = process._getActiveHandles().filter((h) => h.constructor.name === "Timeout").length;
record("无残留定时器（进程可退出）", timers === 0, `timeouts=${timers}`);

rmSync(OUT, { recursive: true, force: true });

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${failed === 0 ? "✓" : "✗"} render 冒烟测试 ${results.length - failed}/${results.length} 通过`);
process.exit(failed ? 1 : 0);
