#!/usr/bin/env node
// tests/perf/editor-perf.mjs — editor render timing baseline (manual / pre-release).
// Not part of run-all (timing jitter would make the gate flaky); run with `npm run test:perf`.
//
// Cases:
//   1. poster-six-tea-types (1 page, 97 elements): refreshPreview ×10 (p50/p95),
//      full render (all thumbnails), duplicate+undo ×5, DOM nodes, getBoundingClientRect
//      calls during a canvas-only refresh (must be 0 after the DOM-measure removal).
//   2. qingshan-coffee-review-12p (12 pages): page switch (thumbs "none"), full render
//      (thumbs "all"), one content edit (thumbs "current"). A MutationObserver on the
//      thumbnail strip counts which cards were repainted, proving the incremental path.
//
// Thresholds (this machine, headless Chrome, 1440×900): six-tea canvas p50 ≤ 20ms /
// p95 ≤ 30ms; six-tea full ≤ 60ms; qingshan full ≤ 80ms; qingshan page switch ≤ 40ms.
// No Chrome → SKIP + exit 0.

import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "../../packages/server/index.js";
import { findBrowser } from "../../packages/renderer/headless/browser.js";
import { connectCdp } from "../../packages/renderer/headless/cdp.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const SIX_TEA = join(ROOT, "examples", "poster-six-tea-types");
const QINGSHAN = join(ROOT, "examples", "qingshan-coffee-review-12p");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let CHROME;
try {
  CHROME = findBrowser();
} catch (err) {
  console.log(`SKIP  未找到 Chrome/Edge（${err.message}）`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
const failures = [];
function check(name, value, ok, detail = "") {
  if (!ok) failures.push(name);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail}`);
}
function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[i];
}
const fmt = (v) => `${Number(v).toFixed(1)}ms`;
const fmtList = (values) => values.map((v) => Number(v).toFixed(1)).join(", ");

/** Launch headless Chrome on `url` (fixed debug port) and return { chrome, cdp }. */
async function launchChrome(url, port) {
  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--window-size=1440,900",
      `--remote-debugging-port=${port}`,
      url,
    ],
    { stdio: "ignore" }
  );
  const cdp = await connectCdp(port, 15000);
  await cdp.send("Runtime.enable");
  return { chrome, cdp };
}

/** Poll a page predicate until true (blocks on the editor's asynchronous load pipeline). */
async function waitReady(cdp, expression, label, timeoutMs = 25000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await cdp.evalJs(expression)) return;
    } catch {
      /* page still navigating */
    }
    await sleep(150);
  }
  throw new Error(`等待超时: ${label}`);
}

/** One project run: server + Chrome + measurements, always torn down. */
async function withProject({ label, root, port, readyJs }, fn) {
  const server = await startServer({ port: 0, projectRoot: root, onListen: () => {} });
  const url = `http://127.0.0.1:${server.address().port}/editor/?deck=project/deck.pptd`;
  let chrome = null;
  let cdp = null;
  try {
    ({ chrome, cdp } = await launchChrome(url, port));
    await waitReady(cdp, readyJs, `${label} 就绪`);
    await sleep(1200); // let the load pipeline's final font re-render (after fontsDone) settle before measuring
    return await fn(cdp);
  } finally {
    try {
      cdp?.close();
    } catch {
      /* already closed */
    }
    chrome?.kill();
    server.close();
    await sleep(300); // let the debug port go before the next launch
  }
}

// ---------------------------------------------------------------------------
// page-side measurement snippets
// ---------------------------------------------------------------------------

/** Canvas-only refresh: N warmups, then 10 timed calls; also counts getBoundingClientRect. */
const SNIPPET_CANVAS = `(async () => {
  const api = window.__pptdEditor;
  const orig = Element.prototype.getBoundingClientRect;
  let gbr = 0;
  Element.prototype.getBoundingClientRect = function (...a) { gbr++; return orig.apply(this, a); };
  for (let i = 0; i < 3; i++) api.refreshPreview(); // warmup: font/canvas caches
  const before = gbr;
  const samples = [];
  for (let i = 0; i < 10; i++) {
    const t0 = performance.now();
    api.refreshPreview();
    samples.push(performance.now() - t0);
  }
  Element.prototype.getBoundingClientRect = orig;
  return { samples, gbr: gbr - before };
})()`;

/** Full render (canvas + every thumbnail) — the same call the theme path makes. */
const SNIPPET_WARM_FULL = `window.__pptdEditor.endChange({ thumbs: "all" })`;
const SNIPPET_FULL = `(() => {
  const api = window.__pptdEditor;
  const samples = [];
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now();
    api.endChange({ thumbs: "all" });
    samples.push(performance.now() - t0);
  }
  return {
    samples,
    nodes: document.querySelectorAll("#page-thumbs *").length,
    thumbs: document.querySelectorAll("#page-thumbs .thumb").length,
  };
})()`;

/** duplicateSelected + undo, 5 rounds (each round re-selects the first element). */
const SNIPPET_DUP_UNDO = `(() => {
  const api = window.__pptdEditor;
  const pg = api.state.deck.pages[api.state.currentPage];
  const id = pg.elements[0]?.elementId;
  const baseline = pg.elements.length;
  const samples = [];
  for (let i = 0; i < 5; i++) {
    api.select(id);
    const t0 = performance.now();
    api.duplicateSelected();
    api.undo();
    samples.push(performance.now() - t0);
  }
  return { samples, baseline, after: api.state.deck.pages[api.state.currentPage].elements.length };
})()`;

/** Page switch ×10 (wraps around the deck); no thumbnail rebuild expected. */
const SNIPPET_SWITCH = `(() => {
  const api = window.__pptdEditor;
  const n = api.state.deck.pages.length;
  const samples = [];
  for (let i = 1; i <= 10; i++) {
    const t0 = performance.now();
    api.goToPage(i % n);
    samples.push(performance.now() - t0);
  }
  api.goToPage(0);
  return { samples, n };
})()`;

/** One content edit on the current page (duplicate, then undo to restore the deck). */
const SNIPPET_EDIT = `(() => {
  const api = window.__pptdEditor;
  const pg = api.state.deck.pages[api.state.currentPage];
  const id = pg.elements[0]?.elementId;
  const baseline = pg.elements.length;
  api.select(id);
  const t0 = performance.now();
  api.duplicateSelected();
  const duplicateMs = performance.now() - t0;
  const t1 = performance.now();
  api.undo();
  const undoMs = performance.now() - t1;
  return { duplicateMs, undoMs, baseline, after: api.state.deck.pages[api.state.currentPage].elements.length };
})()`;

/** MutationObserver: which thumbnail cards get repainted (distinct .thumb-canvas touched) + new .thumb-item nodes. */
const SNIPPET_OBSERVE = `(() => {
  const bar = document.getElementById("page-thumbs");
  window.__thumbObs?.disconnect?.();
  const stats = { cards: new Set(), addedThumbs: 0 };
  window.__thumbStats = stats;
  const mo = new MutationObserver((records) => {
    for (const r of records) {
      for (const n of r.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.classList?.contains("thumb-item")) stats.addedThumbs += 1;
        const card = n.closest?.(".thumb-canvas");
        if (card) stats.cards.add(card);
      }
    }
  });
  mo.observe(bar, { childList: true, subtree: true });
  window.__thumbObs = mo;
  return true;
})()`;
const SNIPPET_RESET_STATS = `(() => { window.__thumbStats.cards = new Set(); window.__thumbStats.addedThumbs = 0; return true; })()`;
const SNIPPET_STATS = `(() => ({ painted: window.__thumbStats.cards.size, addedThumbs: window.__thumbStats.addedThumbs }))()`;

/** Wait until at least `expected` cards were painted (non-current cards paint frame-chunked). */
async function waitPainted(cdp, expected, timeoutMs = 3000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const stats = await cdp.evalJs(SNIPPET_STATS);
    if (stats.painted >= expected) return { ...stats, ms: Date.now() - t0 };
    await sleep(16);
  }
  const stats = await cdp.evalJs(SNIPPET_STATS);
  return { ...stats, ms: Date.now() - t0, timeout: true };
}

// ---------------------------------------------------------------------------
// run
// ---------------------------------------------------------------------------
let sixTea = null;
let qingshan = null;

try {
  sixTea = await withProject(
    {
      label: "六茶海报",
      root: SIX_TEA,
      port: 9347,
      readyJs: `(() => {
        const api = window.__pptdEditor;
        return !!api && api.state.deck?.pages?.length === 1 &&
          document.querySelectorAll("#page-thumbs .thumb").length === 1 &&
          api.state.pagesPending?.size === 0 &&
          document.fonts?.status === "loaded" &&
          document.querySelectorAll("#canvas [data-element-id]").length > 60 &&
          !document.querySelector("#page-thumbs .thumb-canvas:empty");
      })()`,
    },
    async (cdp) => {
      await cdp.evalJs(SNIPPET_OBSERVE);
      // 1) canvas-only refresh must not repaint any thumbnail
      await cdp.evalJs(SNIPPET_RESET_STATS);
      const canvas = await cdp.evalJs(SNIPPET_CANVAS);
      await sleep(60);
      const canvasStats = await cdp.evalJs(SNIPPET_STATS);
      // 2) duplicate+undo only repaints the current card
      await cdp.evalJs(SNIPPET_RESET_STATS);
      const dupUndo = await cdp.evalJs(SNIPPET_DUP_UNDO);
      const dupStats = await waitPainted(cdp, 1);
      // 3) full render rebuilds the single card (warmup outside the counted renders)
      await cdp.evalJs(SNIPPET_WARM_FULL);
      await waitPainted(cdp, 1);
      await cdp.evalJs(SNIPPET_RESET_STATS);
      const full = await cdp.evalJs(SNIPPET_FULL);
      const fullStats = await waitPainted(cdp, 1);
      return { canvas, canvasStats, dupUndo, dupStats, full, fullStats };
    }
  );

  qingshan = await withProject(
    {
      label: "青山咖啡 12 页",
      root: QINGSHAN,
      port: 9348,
      readyJs: `(() => {
        const api = window.__pptdEditor;
        return !!api && api.state.deck?.pages?.length === 12 &&
          document.querySelectorAll("#page-thumbs .thumb").length === 12 &&
          api.state.pagesPending?.size === 0 &&
          document.fonts?.status === "loaded" &&
          !document.querySelector("#page-thumbs .thumb-canvas:empty");
      })()`,
    },
    async (cdp) => {
      await cdp.evalJs(SNIPPET_OBSERVE);
      await cdp.evalJs(SNIPPET_RESET_STATS);
      const switchRun = await cdp.evalJs(SNIPPET_SWITCH);
      await sleep(60); // let the MutationObserver microtask deliver
      const switchStats = await cdp.evalJs(SNIPPET_STATS);

      await cdp.evalJs(SNIPPET_WARM_FULL);
      await waitPainted(cdp, 12); // let the warmup's deferred batch finish
      await cdp.evalJs(SNIPPET_RESET_STATS);
      const full = await cdp.evalJs(SNIPPET_FULL);
      const fullStats = await waitPainted(cdp, 12);

      await cdp.evalJs(SNIPPET_RESET_STATS);
      const edit = await cdp.evalJs(SNIPPET_EDIT);
      const editStats = await waitPainted(cdp, 1);

      return { switchRun, switchStats, full, fullStats, edit, editStats };
    }
  );
} catch (err) {
  console.error(`SKIP  Chrome 未能启动或页面未就绪（${err.message}）`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------
const canvasP50 = percentile(sixTea.canvas.samples, 50);
const canvasP95 = percentile(sixTea.canvas.samples, 95);
const dupP50 = percentile(sixTea.dupUndo.samples, 50);
const dupP95 = percentile(sixTea.dupUndo.samples, 95);
const fullP50 = percentile(sixTea.full.samples, 50);
const switchP50 = percentile(qingshan.switchRun.samples, 50);
const switchP95 = percentile(qingshan.switchRun.samples, 95);
const qFullP50 = percentile(qingshan.full.samples, 50);

console.log("\n=== 六茶海报（1 页 97 元素）===");
console.log(`refreshPreview ×10      p50 ${fmt(canvasP50)}  p95 ${fmt(canvasP95)}   [${fmtList(sixTea.canvas.samples)}]`);
console.log(`duplicate+undo ×5       p50 ${fmt(dupP50)}  p95 ${fmt(dupP95)}   [${fmtList(sixTea.dupUndo.samples)}]`);
console.log(`全量渲染（thumbs all）×3 p50 ${fmt(fullP50)}   [${fmtList(sixTea.full.samples)}]`);
console.log(`缩略图 DOM 节点          ${sixTea.full.nodes}（${sixTea.full.thumbs} 卡）`);
console.log(`缩略图补齐（含 rAF 分批）  ${sixTea.fullStats.ms}ms`);
console.log(`refreshPreview 内 getBoundingClientRect 调用  ${sixTea.canvas.gbr}`);
console.log(`重画卡片数              refreshPreview ${sixTea.canvasStats.painted} / dup+undo ${sixTea.dupStats.painted} / 全量 ${sixTea.fullStats.painted}`);
console.log(`元素数（dup+undo 后应回到 ${sixTea.dupUndo.baseline}）  ${sixTea.dupUndo.after}`);

console.log("\n=== 青山咖啡（12 页）===");
console.log(`切页 ×10                p50 ${fmt(switchP50)}  p95 ${fmt(switchP95)}   [${fmtList(qingshan.switchRun.samples)}]`);
console.log(`全量渲染（thumbs all）×3 p50 ${fmt(qFullP50)}   [${fmtList(qingshan.full.samples)}]`);
console.log(`内容编辑 duplicate      ${fmt(qingshan.edit.duplicateMs)}   undo ${fmt(qingshan.edit.undoMs)}`);
console.log(`缩略图 DOM 节点          ${qingshan.full.nodes}（${qingshan.full.thumbs} 卡）`);
console.log(`缩略图补齐（含 rAF 分批）  ${qingshan.fullStats.ms}ms`);
console.log(
  `重画卡片数              切页 ${qingshan.switchStats.painted} / 全量 ${qingshan.fullStats.painted} / 编辑 ${qingshan.editStats.painted}` +
    `（新增 .thumb 节点 ${qingshan.switchStats.addedThumbs}/${qingshan.fullStats.addedThumbs}/${qingshan.editStats.addedThumbs}）`
);

console.log("\n=== 阈值 ===");
check("六茶 refreshPreview p50 ≤ 20ms", canvasP50, canvasP50 <= 20, fmt(canvasP50));
check("六茶 refreshPreview p95 ≤ 30ms", canvasP95, canvasP95 <= 30, fmt(canvasP95));
check("六茶全量渲染 ≤ 60ms", fullP50, fullP50 <= 60, fmt(fullP50));
check("青山全量渲染 ≤ 80ms", qFullP50, qFullP50 <= 80, fmt(qFullP50));
check("青山切页 ≤ 40ms", switchP50, switchP50 <= 40, fmt(switchP50));
check("六茶 refreshPreview 无 getBoundingClientRect", sixTea.canvas.gbr, sixTea.canvas.gbr === 0, `${sixTea.canvas.gbr} 次`);
check("六茶 refreshPreview 不重画缩略图", sixTea.canvasStats.painted, sixTea.canvasStats.painted === 0, `${sixTea.canvasStats.painted} 张`);
check("六茶 duplicate+undo 只重画当前卡", sixTea.dupStats.painted, sixTea.dupStats.painted === 1, `${sixTea.dupStats.painted} 张`);
check("六茶全量重建 1 张缩略图", sixTea.fullStats.painted, sixTea.fullStats.painted === sixTea.full.thumbs, `${sixTea.fullStats.painted} 张`);
check("青山切页不重画缩略图", qingshan.switchStats.painted, qingshan.switchStats.painted === 0, `${qingshan.switchStats.painted} 张`);
check("青山全量重建 12 张缩略图", qingshan.fullStats.painted, qingshan.fullStats.painted === qingshan.full.thumbs, `${qingshan.fullStats.painted} 张`);
check("青山内容编辑只重画当前卡", qingshan.editStats.painted, qingshan.editStats.painted === 1, `${qingshan.editStats.painted} 张`);
check("青山 duplicate+undo 回到基线元素数", qingshan.edit.after, qingshan.edit.after === qingshan.edit.baseline, `${qingshan.edit.after}/${qingshan.edit.baseline}`);
check("六茶 dup+undo 回到基线元素数", sixTea.dupUndo.after, sixTea.dupUndo.after === sixTea.dupUndo.baseline, `${sixTea.dupUndo.after}/${sixTea.dupUndo.baseline}`);

if (failures.length) {
  console.log(`\n结果: ${failures.length} 项未达阈值 ❌（${failures.join("；")}）`);
  process.exit(1);
}
console.log("\n结果: 性能基线全部达标 ✅");
process.exit(0);
