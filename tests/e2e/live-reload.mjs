#!/usr/bin/env node
// ============================================================================
// live-reload.mjs — 项目模式 E2E：SSE 实时刷新 + 保存写回磁盘
// ----------------------------------------------------------------------------
// 用法: node tests/live-reload.mjs [--project <目录>]   （缺省用临时目录）
// 链路验证（统一「项目模式」的核心承诺）：
//   1. serve --project 挂载 → 编辑器加载项目（状态栏显示"已连接项目"）
//   2. 外部写文件（模拟 Agent 改文件）→ server 指纹检测 → SSE 推送
//      → 编辑器自动重载（保留当前页，页面数 +1）
//   3. 编辑器保存 → POST /api/save → 磁盘文件更新（新增页落盘）
// 依赖: 本机 Chrome（CDP），SMOKE_CHROME 环境变量可指定路径。
// ============================================================================

import { spawn } from "node:child_process";
import { existsSync, writeFileSync, readFileSync, rmSync, mkdirSync, cpSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "../../lib/editor-server.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL = join(__dirname, "..");

const CHROME_CANDIDATES = [
  process.env.SMOKE_CHROME,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);
const CHROME = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!CHROME) {
  console.error("未找到 Chrome/Edge，请设置环境变量 SMOKE_CHROME=<浏览器路径>");
  process.exit(1);
}

const results = [];
function log(name, pass, detail = "") {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
}

// 临时项目目录（--project 指定则复用）
const projIdx = process.argv.indexOf("--project");
const PROJECT = projIdx >= 0 ? process.argv[projIdx + 1] : join(SKILL, "..", "pptd-live-test-tmp");
const PORT = 56111;
rmSync(PROJECT, { recursive: true, force: true });
mkdirSync(PROJECT, { recursive: true });
cpSync(join(SKILL, "themes", "01-商务经典"), PROJECT, { recursive: true });

const server = await startServer({ port: PORT, projectRoot: PROJECT });
const URL = `http://127.0.0.1:${PORT}/editor/?deck=project/deck.pptd`;

const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-first-run", `--remote-debugging-port=${9231}`, URL], { stdio: "ignore" });
let wsUrl = null;
for (let i = 0; i < 50 && !wsUrl; i++) {
  await new Promise((r) => setTimeout(r, 200));
  try {
    wsUrl = (await fetch("http://127.0.0.1:9231/json").then((r) => r.json())).find((t) => t.type === "page")?.webSocketDebuggerUrl;
  } catch {}
}
if (!wsUrl) {
  console.error("无法连接 Chrome 调试端口");
  process.exit(1);
}
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
const evalJs = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
await send("Runtime.enable");

try {
  await new Promise((r) => setTimeout(r, 2500));

  // 1) 编辑器加载 + 项目模式（顶栏刷新按钮 + 无部署模式提示）
  const s1 = await evalJs(`(() => ({
    pages: window.__pptdEditor?.state?.deck?.pages?.length,
    reloadBtn: !!document.getElementById("btn-reload"),
    deployHint: !document.getElementById("status-hint")?.hidden,
  }))()`);
  log("编辑器加载项目", s1.pages >= 1, JSON.stringify(s1));
  log("顶栏刷新按钮存在", !!s1.reloadBtn);
  log("本地项目不显示部署提示", !s1.deployHint);

  // 2) 外部写文件 → SSE 自动刷新（页面数 +1）
  const before = await evalJs(`window.__pptdEditor.state.deck.pages.length`);
  writeFileSync(join(PROJECT, "pages", "9_live.page"), "pageType: content\nelements: []\n");
  const manifest = readFileSync(join(PROJECT, "deck.pptd"), "utf8");
  writeFileSync(join(PROJECT, "deck.pptd"), manifest.replace("pages:", "pages:\n  - pages/9_live.page"));
  await new Promise((r) => setTimeout(r, 4500));
  const after = await evalJs(`window.__pptdEditor?.state?.deck?.pages?.length`);
  log("SSE 自动刷新（新增页已加载）", after === before + 1, `before=${before} after=${after}`);

  // 3) 编辑器保存 → 写回磁盘（新增页落盘）
  await evalJs(`window.__pptdIo.saveProject().then(() => "saved").catch((e) => "err:" + e.message)`);
  await new Promise((r) => setTimeout(r, 1500));
  const onDisk = existsSync(join(PROJECT, "pages", "9_live.page")) &&
    readFileSync(join(PROJECT, "deck.pptd"), "utf8").includes("9_live");
  log("保存写回磁盘", onDisk);
} catch (err) {
  console.error("测试异常:", err);
} finally {
  ws.close();
  chrome.kill();
  server.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);
