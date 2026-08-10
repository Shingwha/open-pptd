#!/usr/bin/env node
// ============================================================================
// incremental-load.mjs — 「有一页显示一页」渐进加载 E2E
// ----------------------------------------------------------------------------
// 用法: node tests/incremental-load.mjs [--project <目录>]（缺省用临时目录）
// 验证 Agent 写入中的项目体验：
//   1. manifest 引用 N 页但只写了 1 页 → 编辑器显示已有页（不整体失败），
//      toast 提示缺失页数
//   2. 补写一页 → SSE 自动刷新 → 页数 +1
//   3. 全部补全 → 全量显示
//   4. 页面文件写坏（YAML 语法错误）→ 错误占位页显示，其余页面不受影响
// 依赖: 本机 Chrome（CDP），SMOKE_CHROME 环境变量可指定路径。
// ============================================================================

import { spawn } from "node:child_process";
import { existsSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "../../lib/editor-server.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
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

const projIdx = process.argv.indexOf("--project");
const PROJECT = projIdx >= 0 ? process.argv[projIdx + 1] : join(__dirname, "..", "..", "pptd-incremental-tmp");
const PORT = 56122;
rmSync(PROJECT, { recursive: true, force: true });
mkdirSync(join(PROJECT, "pages"), { recursive: true });

// manifest 引用 3 页，但只先写 1 页
writeFileSync(join(PROJECT, "deck.pptd"), "version: v2\ntitle: 增量测试\ntheme: cyan\nsize: [960, 540]\npages:\n  - pages/1.page\n  - pages/2.page\n  - pages/3.page\n");
const pageYaml = (n) =>
  "pageType: content\nbackground: {type: solid, color: \"#131010\"}\nelements:\n" +
  `  - elementId: t${n}\n    elementType: text\n    bounds: [64, 64, 400, 40]\n` +
  `    content: {fontSize: 22, bold: true, color: "#F2EDED", align: [left, middle], text: '第${n}页'}\n`;
writeFileSync(join(PROJECT, "pages", "1.page"), pageYaml(1));

const server = await startServer({ port: PORT, projectRoot: PROJECT });
const URL = `http://127.0.0.1:${PORT}/editor/?deck=project/deck.pptd`;
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-first-run", `--remote-debugging-port=${9241}`, URL], { stdio: "ignore" });
let wsUrl = null;
for (let i = 0; i < 50 && !wsUrl; i++) {
  await new Promise((r) => setTimeout(r, 200));
  try {
    wsUrl = (await fetch("http://127.0.0.1:9241/json").then((r) => r.json())).find((t) => t.type === "page")?.webSocketDebuggerUrl;
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
  await new Promise((r) => setTimeout(r, 3000));

  // 1) 只写了 1/3 页 → 显示 1 页 + 缺失提示
  let s = await evalJs(`(() => ({ pages: window.__pptdEditor?.state?.deck?.pages?.length, toast: [...document.querySelectorAll('.toast')].map(t => t.textContent).join('|') }))()`);
  log("部分页面时显示已有页（1/3）", s.pages === 1, JSON.stringify(s));
  log("toast 提示缺失页数", (s.toast || "").includes("缺失"), s.toast || "");

  // 2) 补第 2 页 → 自动刷新 → 2 页
  writeFileSync(join(PROJECT, "pages", "2.page"), pageYaml(2));
  await new Promise((r) => setTimeout(r, 3500));
  s = await evalJs(`window.__pptdEditor?.state?.deck?.pages?.length`);
  log("补一页自动多一页（2/3）", s === 2, `pages=${s}`);

  // 3) 补第 3 页 → 全量
  writeFileSync(join(PROJECT, "pages", "3.page"), pageYaml(3));
  await new Promise((r) => setTimeout(r, 3500));
  s = await evalJs(`window.__pptdEditor?.state?.deck?.pages?.length`);
  log("全部补全（3/3）", s === 3, `pages=${s}`);

  // 4) 页面写坏 → 占位页，不崩溃
  writeFileSync(join(PROJECT, "pages", "2.page"), "pageType: content\n  broken: [unclosed\n");
  await new Promise((r) => setTimeout(r, 3500));
  s = await evalJs(`(() => ({ pages: window.__pptdEditor?.state?.deck?.pages?.length, err: document.querySelectorAll('.page-error').length }))()`);
  log("坏页占位不崩溃", s.pages === 3 && s.err === 1, JSON.stringify(s));
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
