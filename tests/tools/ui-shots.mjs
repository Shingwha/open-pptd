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
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "../../packages/server/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL = join(__dirname, "../..");
const outIdx = process.argv.indexOf("--out");
const OUT = outIdx > 0 ? process.argv[outIdx + 1] : join(SKILL, "tests", "ui-shots-out");
mkdirSync(OUT, { recursive: true });

const CHROME = [
  process.env.SMOKE_CHROME,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].filter(Boolean).find((p) => existsSync(p));
if (!CHROME) {
  console.error("未找到 Chrome/Edge，请设置 SMOKE_CHROME=<浏览器路径>");
  process.exit(1);
}

const PORT = 56199;
const CDP_PORT = 9247;
const DECK = "tests/projects/chart/deck.pptd"; // 14 页全图表类型，元素丰富

const server = await startServer({ port: PORT, projectRoot: SKILL });
const chrome = spawn(CHROME, [
  "--headless=new", "--disable-gpu", "--no-first-run", "--hide-scrollbars",
  `--remote-debugging-port=${CDP_PORT}`, "about:blank",
], { stdio: "ignore" });

let wsUrl = null;
for (let i = 0; i < 50 && !wsUrl; i++) {
  await new Promise((r) => setTimeout(r, 200));
  try {
    wsUrl = (await fetch(`http://127.0.0.1:${CDP_PORT}/json`).then((r) => r.json())).find((t) => t.type === "page")?.webSocketDebuggerUrl;
  } catch {}
}
if (!wsUrl) { console.error("无法连接 Chrome 调试端口"); process.exit(1); }

const ws = new WebSocket(wsUrl);
let msgId = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
};
const send = (method, params = {}) => new Promise((res) => {
  const id = ++msgId;
  pending.set(id, res);
  ws.send(JSON.stringify({ id, method, params }));
});
await new Promise((r) => (ws.onopen = r));
await send("Runtime.enable");
await send("Page.enable");

const evalJs = async (expr) =>
  (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;

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
  ws.close();
  chrome.kill();
  server.close();
}
console.log(`\n截图输出目录: ${OUT}`);
