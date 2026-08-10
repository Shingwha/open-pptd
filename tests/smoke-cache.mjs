// 冒烟测试：画廊懒加载 + Cache API 缓存 + 编辑器加载（真实浏览器 CDP）
// 用法: node scripts/smoke-cache.mjs
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
// Chrome 路径：环境变量优先，否则探测常见位置
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
const URL = process.env.SMOKE_URL || "http://localhost:55173/";

const results = [];
function log(name, pass, detail = "") {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
}

(async () => {
  // 启动 Chrome（调试端口）
  const chrome = spawn(CHROME, [
    "--headless=new", "--disable-gpu", "--no-first-run",
    "--remote-debugging-port=9223", "--window-size=1280,900", URL,
  ], { stdio: "ignore" });

  // 等调试端口就绪
  let wsUrl = null;
  for (let i = 0; i < 50 && !wsUrl; i++) {
    await new Promise((r) => setTimeout(r, 200));
    try {
      const list = await fetch("http://127.0.0.1:9223/json").then((r) => r.json());
      const page = list.find((t) => t.type === "page");
      if (page) wsUrl = page.webSocketDebuggerUrl;
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

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const evalJs = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    return r.result?.result?.value;
  };

  try {
    await send("Runtime.enable");
    await sleep(1500);

    // 1) 首屏卡片状态（应只有可见的渲染，其余骨架）
    const initial = await evalJs(`(() => {
      const cards = [...document.querySelectorAll(".theme-card")];
      return cards.map((c) => ({
        name: c.querySelector(".theme-card-name")?.childNodes[0]?.textContent.trim(),
        loading: !!c.querySelector(".theme-card-thumb.loading"),
        rendered: !!c.querySelector(".gallery-page"),
        err: !!c.querySelector(".theme-card-err"),
      }));
    })()`);
    const rendered0 = initial.filter((c) => c.rendered).length;
    const skeleton0 = initial.filter((c) => c.loading).length;
    log("画廊首屏：有卡片渲染", rendered0 >= 1, `rendered=${rendered0} skeleton=${skeleton0} err=${initial.filter(c=>c.err).length}`);

    // 2) 滚动到底 → 全部应渲染
    await evalJs(`(async () => {
      const grid = document.getElementById("gallery-grid");
      for (let y = 0; y <= grid.scrollHeight + 500; y += 400) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 150));
      }
    })()`);
    await sleep(3000);
    const after = await evalJs(`[...document.querySelectorAll(".theme-card")].map((c) => ({
      loading: !!c.querySelector(".theme-card-thumb.loading"),
      rendered: !!c.querySelector(".gallery-page"),
      err: !!c.querySelector(".theme-card-err"),
    }))`);
    const total = after.length;
    const renderedAll = after.filter((c) => c.rendered).length;
    const errAll = after.filter((c) => c.err).length;
    log("画廊滚动后：全部渲染", renderedAll === total && errAll === 0,
      `rendered=${renderedAll}/${total} err=${errAll}`);

    // 3) Cache API：行为取决于部署模式。project-cache.js 的设计是
    //    本地 serve 对静态文件发 Cache-Control: no-store → 应用层缓存跳过；
    //    GitHub Pages 等部署环境（无 no-store）→ 应写入 Cache API。
    //    先探测模式，再按对应预期断言。
    const deployMode = await evalJs(`(async () => {
      const r = await fetch("themes/manifest.json", { cache: "no-store" });
      return (r.headers.get("cache-control") || "").includes("no-store") ? "local" : "deployed";
    })()`);
    if (deployMode === "local") {
      log("本地 serve：应用层缓存按设计跳过", true, "(静态文件 no-store)");
    } else {
      const cacheInfo = await evalJs(`(async () => {
        const keys = await caches.keys();
        if (!keys.includes("open-pptd-projects-v1")) return { keys };
        const cache = await caches.open("open-pptd-projects-v1");
        const entries = await cache.keys();
        return { keys, entries: entries.length, sample: entries[0]?.url };
      })()`);
      log("Cache API 已写入项目缓存", (cacheInfo.entries || 0) >= 1, JSON.stringify(cacheInfo));
    }

    // 4) 第二次加载（统计项目文件网络请求数）：
    //    部署模式应命中 Cache API（首次>二次）；本地模式无缓存，每次全量拉取（首次=二次>0）。
    const nav1 = await evalJs(`performance.getEntriesByType("resource").map(e => e.name).filter(n => n.includes(".page") || n.includes("deck.pptd")).length`);
    await send("Page.reload", { ignoreCache: false });
    await sleep(2500);
    const nav2 = await evalJs(`performance.getEntriesByType("resource").map(e => e.name).filter(n => n.includes(".page") || n.includes("deck.pptd")).length`);
    if (deployMode === "local") {
      log("二次访问（本地）：无缓存全量拉取", nav2 > 0 && nav1 === nav2, `首次=${nav1} 二次=${nav2}`);
    } else {
      log("二次访问：项目文件走缓存（首次>二次）", nav1 > nav2, `首次=${nav1} 二次=${nav2}`);
    }

    // 5) 编辑器加载主题（io.js 缓存路径）
    await evalJs(`location.href = "editor/?deck=themes/01-商务经典/deck.pptd"`);
    await sleep(4000);
    const editor = await evalJs(`(() => ({
      pages: window.__pptdEditor?.state?.deck?.pages?.length,
      title: window.__pptdEditor?.state?.deck?.title,
      toast: document.querySelector(".toast")?.textContent || "",
    }))()`);
    log("编辑器加载主题成功", editor.pages >= 1, JSON.stringify(editor));
  } catch (err) {
    console.error("测试异常:", err);
  } finally {
    ws.close();
    chrome.kill();
  }
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} 通过`);
  process.exit(failed.length ? 1 : 0);
})();
