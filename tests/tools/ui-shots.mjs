#!/usr/bin/env node
// ============================================================================
// tests/tools/ui-shots.mjs — 编辑器 / 画廊界面截图走查工具（非测试，不出 PASS/FAIL）
// ----------------------------------------------------------------------------
// 用法: node tests/tools/ui-shots.mjs [--out <目录>]
// 用 CDP 驱动本机 Chrome/Edge，对关键界面状态截图，供视觉走查：
//   editor         编辑器主界面（选中一个元素，带出快速条 + 属性面板）
//   editor-addmenu 添加元素浮层展开
//   editor-narrow  窄屏 480px（响应式变形：顶栏图标化 / 缩略条迷你化）
//   gallery        画廊首页
//   gallery-narrow 画廊窄屏
// 依赖: 本机 Chrome/Edge（SMOKE_CHROME 可指定路径）。
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
const DECK = "tests/projects/chart/deck.pptd"; // 21 页全图表类型，元素丰富

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
  await new Promise((r) => setTimeout(r, 2500));
};

const viewport = (w, h) =>
  send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 900 });

try {
  // —— 编辑器主界面：选中首个元素，带出快速条 + 属性面板 ——
  await viewport(1440, 900);
  await go(`http://127.0.0.1:${PORT}/editor/?deck=${DECK}`);
  await evalJs(`(() => {
    const api = window.__pptdEditor;
    const el = api?.state?.deck?.pages?.[0]?.elements?.[0];
    if (el) api.select(el.elementId);
    return !!el;
  })()`);
  await new Promise((r) => setTimeout(r, 600));
  await shot("editor");

  // —— 添加元素浮层 ——
  await evalJs(`(() => { document.querySelector("#btn-add")?.click(); return true; })()`);
  await new Promise((r) => setTimeout(r, 400));
  await shot("editor-addmenu");
  await evalJs(`(() => { document.body.click(); return true; })()`);

  // —— 窄屏响应式 ——
  await viewport(480, 840);
  await new Promise((r) => setTimeout(r, 600));
  await shot("editor-narrow");

  // —— 画廊 ——
  await viewport(1440, 900);
  await go(`http://127.0.0.1:${PORT}/`);
  await shot("gallery");
  await viewport(480, 840);
  await new Promise((r) => setTimeout(r, 400));
  await shot("gallery-narrow");
} finally {
  cdp.close();
  chrome.kill();
  server.close();
}
console.log(`\n截图输出目录: ${OUT}`);
