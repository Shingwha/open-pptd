// ============================================================================
// renderer/headless/browser.js — browser discovery and port helpers (Node-only)
// ----------------------------------------------------------------------------
// Same candidate strategy as tests/e2e; the SMOKE_CHROME env var overrides it.
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

/** Locate the local Chrome/Edge executable. */
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

/** Grab a random free port (for remote-debugging; the race probability is negligible). */
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
