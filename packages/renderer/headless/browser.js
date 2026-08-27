// ============================================================================
// renderer/headless/browser.js — 浏览器发现与端口工具（仅 Node 端使用）
// ----------------------------------------------------------------------------
// 与 tests/e2e 同一候选策略；SMOKE_CHROME 环境变量可覆盖。
// ============================================================================

import { existsSync } from "node:fs";
import { createServer as createNetServer } from "node:net";

const BROWSER_CANDIDATES = [
  process.env.SMOKE_CHROME,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
].filter(Boolean);

/** 定位本机 Chrome/Edge 可执行文件。 */
export function findBrowser(browserPath = null) {
  if (browserPath) {
    if (!existsSync(browserPath)) throw new Error(`浏览器不存在: ${browserPath}`);
    return browserPath;
  }
  const hit = BROWSER_CANDIDATES.find((p) => existsSync(p));
  if (!hit) {
    throw new Error("未找到 Chrome/Edge。可用 --browser <路径> 指定，或设置环境变量 SMOKE_CHROME=<浏览器路径>");
  }
  return hit;
}

/** 取一个随机空闲端口（remote-debugging 用；竞态概率可忽略）。 */
export function freePort() {
  return new Promise((resolvePort, reject) => {
    const srv = createNetServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const p = srv.address().port;
      srv.close(() => resolvePort(p));
    });
  });
}
