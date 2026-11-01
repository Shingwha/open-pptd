#!/usr/bin/env node
// ============================================================================
// tests/tools/ui-shots.mjs — editor / gallery UI screenshot walkthrough (not a test, no PASS/FAIL)
// ----------------------------------------------------------------------------
// Usage: node tests/tools/ui-shots.mjs [--out <dir>]
// Drives a local Chrome/Edge over CDP to capture the key UI states for visual review:
//   editor           editor at 1440×900 (one element selected → selection frame + action bar)
//   editor-dark      the same in the dark palette
//   editor-file      File menu expanded (grouped rows, right-aligned shortcuts)
//   editor-addmenu   add-element popover expanded
//   editor-design    Design drawer open (theme tab)
//   editor-design-colors  same drawer scrolled to the color-token table
//   editor-design-fonts   same drawer, font tab
//   editor-dialog    table editor dialog at 1440×900 (grid + side panel)
//   editor-narrow    narrow 480×840 (icon-only topbar, mini page cards)
//   editor-dialog-narrow  table editor dialog at 480×840 (bottom-sheet form)
//   gallery          Home at 1440×900 (masthead + 3-column work grid)
//   gallery-poster   Home with the poster tab active (3:4 covers, 3 columns)
//   gallery-dark     Home in the dark palette
//   gallery-narrow   Home at 480×840 (single column)
// Depends on a local Chrome/Edge (SMOKE_CHROME can point at its path).
// docs/images/editor.png is taken from editor.png; gallery.png from gallery.png.
// ============================================================================

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "../../packages/server/index.js";
import { findBrowser } from "../../packages/renderer/headless/browser.js";
import { connectCdp } from "../../packages/renderer/headless/cdp.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL = join(__dirname, "../..");
const outIdx = process.argv.indexOf("--out");
const OUT = outIdx > 0 ? process.argv[outIdx + 1] : join(SKILL, "tests", "ui-shots-out");
mkdirSync(OUT, { recursive: true });

let CHROME;
try {
  CHROME = findBrowser();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const PORT = 56199;
const CDP_PORT = 9247;
const DECK = "examples/qingshan-coffee-review-12p/deck.pptd"; // long real deck: charts, tables, text

const server = await startServer({ port: PORT, projectRoot: SKILL });
const chrome = spawn(CHROME, [
  "--headless=new", "--disable-gpu", "--no-first-run", "--hide-scrollbars",
  `--remote-debugging-port=${CDP_PORT}`, "about:blank",
], { stdio: "ignore" });

const cdp = await connectCdp(CDP_PORT, 10000);
const send = cdp.send;
const evalJs = (expr) => cdp.evalJs(expr);
await send("Runtime.enable");
await send("Page.enable");

const shot = async (name) => {
  const { data } = (await send("Page.captureScreenshot", { format: "png" })).result;
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, "base64"));
  console.log(`SHOT  ${name}.png`);
};

const go = async (url) => {
  await send("Page.navigate", { url });
  await new Promise((r) => setTimeout(r, 3500));
};

const viewport = (w, h) =>
  send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 900 });

const theme = (mode) => evalJs(`(() => { window.__pptdTheme?.apply({ mode: "${mode}" }); return true; })()`);
const clearToasts = () => evalJs(`(() => {
  document.querySelectorAll(".toast-container").forEach((n) => n.remove());
  return true;
})()`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  // —— editor: one element selected (selection frame + selection action bar) ——
  await viewport(1440, 900);
  await go(`http://127.0.0.1:${PORT}/editor/?deck=${DECK}`);
  await evalJs(`(() => {
    const api = window.__pptdEditor;
    const el = api?.state?.deck?.pages?.[api.state.currentPage]?.elements?.[0];
    if (el) api.select(el.elementId);
    return !!el;
  })()`);
  await wait(800);
  await clearToasts();
  await wait(400);
  await shot("editor");

  // dark palette
  await theme("dark");
  await wait(600);
  await shot("editor-dark");
  await theme("light");
  await wait(300);

  // —— add-element popover ——
  await evalJs(`(() => { document.querySelector("#btn-add")?.click(); return true; })()`);
  await wait(400);
  await shot("editor-addmenu");
  await evalJs(`(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    return true;
  })()`);
  await wait(300);

  // —— File menu ——
  await evalJs(`(() => { document.querySelector("#btn-file")?.click(); return true; })()`);
  await wait(500);
  await shot("editor-file");
  await evalJs(`(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    return true;
  })()`);
  await wait(300);

  // —— Design drawer (theme tab) ——
  await evalJs(`(() => { document.querySelector("#btn-design")?.click(); return true; })()`);
  await wait(1000);
  await shot("editor-design");
  await evalJs(`(() => { const b = document.querySelector(".design-body"); if (b) b.scrollTop = b.scrollHeight; return true; })()`);
  await wait(400);
  await shot("editor-design-colors");
  await evalJs(`(() => { document.querySelector('.design-tab[data-tab="fonts"]')?.click(); return true; })()`);
  await wait(900);
  await evalJs(`(() => { const b = document.querySelector(".design-body"); if (b) b.scrollTop = 0; return true; })()`);
  await wait(400);
  await shot("editor-design-fonts");
  await evalJs(`(() => { document.querySelector('.design-head .btn')?.click(); return true; })()`);
  await wait(300);

  // —— Table editor dialog at 1440 (grid + side panel), then undo the added table ——
  await evalJs(`(() => { document.querySelector("#btn-add")?.click(); return true; })()`);
  await wait(300);
  await evalJs(`(() => { document.querySelector('#add-list .add-item[data-add-type="table"]')?.click(); return true; })()`);
  await wait(1200);
  await shot("editor-dialog");
  await evalJs(`(() => { document.querySelector(".dialog-head .btn")?.click(); return true; })()`);
  await wait(300);
  await evalJs(`(() => { window.__pptdEditor?.undo(); return true; })()`);
  await wait(400);

  // —— narrow responsive ——
  await viewport(480, 840);
  await wait(700);
  await shot("editor-narrow");

  // —— Dialog at 480 (bottom sheet): add a table, capture, close ——
  await evalJs(`(() => { document.querySelector("#btn-add")?.click(); return true; })()`);
  await wait(300);
  await evalJs(`(() => { document.querySelector('#add-list .add-item[data-add-type="table"]')?.click(); return true; })()`);
  await wait(1200);
  await shot("editor-dialog-narrow");
  await evalJs(`(() => { document.querySelector(".dialog-head .btn")?.click(); return true; })()`);
  await wait(300);

  // —— Home: masthead + work grid ——
  await viewport(1440, 900);
  await go(`http://127.0.0.1:${PORT}/`);
  await wait(1200);
  await clearToasts();
  await wait(500);
  await shot("gallery");

  // dark palette
  await theme("dark");
  await wait(700);
  await clearToasts();
  await wait(300);
  await shot("gallery-dark");
  await theme("light");
  await wait(300);

  // poster tab: text tab switch + 3:4 cover grid
  await evalJs(`(() => { document.querySelector('.gallery-tab[data-kind="poster"]')?.click(); return true; })()`);
  await wait(1200);
  await clearToasts();
  await wait(300);
  await shot("gallery-poster");
  await evalJs(`(() => { document.querySelector('.gallery-tab[data-kind="ppt"]')?.click(); return true; })()`);
  await wait(600);

  // —— Home narrow ——
  await viewport(480, 840);
  await wait(700);
  await clearToasts();
  await wait(300);
  await shot("gallery-narrow");
} finally {
  cdp.close();
  chrome.kill();
  server.close();
}
console.log(`\n截图输出目录: ${OUT}`);
