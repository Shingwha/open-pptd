// ============================================================================
// renderer/headless/shoot.js — 无头渲染编排（open-pptd render，仅 Node 端）
// ----------------------------------------------------------------------------
// 流程：临时静态 server + 本机 Chrome/Edge headless + CDP 截图，逐页输出 PNG，
// 与编辑器预览同一条渲染管线（editor/?shot=1 → renderer/page.js，同一份字体
// 文件与 imageMap）。无浏览器窗口、无需用户操作。
//
// startServer 由调用方注入（packages/server），保持 renderer → server 无反向
// 依赖（依赖方向 model ← renderer ← cli/server，见 tests/regression/dep-graph.mjs）。
// ============================================================================

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, rmSync, readdirSync, statSync, mkdtempSync } from "node:fs";
import { join, dirname, basename, extname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { PAGE_WIDTH, PAGE_HEIGHT } from "../../model/model.js";
import { findBrowser, freePort } from "./browser.js";
import { connectCdp, waitReady, withTimeout, sleep } from "./cdp.js";

/**
 * 逐页渲染 deck 为 PNG。
 * @param {object} opts
 * @param {string} opts.manifest .pptd 文件路径（或仅含一个 .pptd 的项目目录）
 * @param {string} [opts.outPath] 输出：目录（缺省 deck 同目录）；单页时若以 .png 结尾视为文件
 * @param {number|string} [opts.page] 页码（1 起）或 "all"（缺省 all）
 * @param {number} [opts.scale] 1|2|3（缺省 1 → 960×540）
 * @param {string} [opts.browserPath] 浏览器可执行文件路径（缺省自动发现）
 * @param {number} [opts.timeoutMs] 每步超时（缺省 30s）
 * @param {boolean} [opts.quiet] 静默（不打印中间日志）
 * @param {(options: object) => Promise<import("node:http").Server>} opts.startServer
 *        静态 server 工厂（packages/server 注入，保持分层无反向依赖）
 * @returns {Promise<{files: string[], count: number}>}
 */
export async function renderDeck({
  manifest,
  outPath = null,
  page = "all",
  scale = 1,
  browserPath = null,
  timeoutMs = 30000,
  quiet = false,
  startServer,
}) {
  if (typeof startServer !== "function") {
    throw new Error("renderDeck 需要注入 startServer（来自 packages/server）");
  }
  // ---- 解析 manifest（目录 → 唯一 .pptd）----
  let manifestPath = manifest;
  if (!existsSync(manifestPath)) throw new Error(`文件不存在: ${manifestPath}`);
  if (statSync(manifestPath).isDirectory()) {
    const candidates = readdirSync(manifestPath).filter((f) => f.endsWith(".pptd"));
    if (candidates.length !== 1) {
      throw new Error(`目录 ${manifestPath} 下应有且仅有一个 .pptd 文件（实际 ${candidates.length} 个）`);
    }
    manifestPath = join(manifestPath, candidates[0]);
  }
  manifestPath = resolve(manifestPath);
  const deckDir = dirname(manifestPath);
  const deckBase = basename(manifestPath, extname(manifestPath));
  scale = Number(scale);
  if (![1, 2, 3].includes(scale)) throw new Error(`--scale 仅支持 1|2|3（当前 ${scale}）`);
  const pageSpec = page === "all" ? "all" : Number(page);
  if (pageSpec !== "all" && (!Number.isInteger(pageSpec) || pageSpec < 1)) {
    throw new Error(`--page 仅支持页码（1 起）或 all（当前 ${page}）`);
  }

  const browser = findBrowser(browserPath);
  const log = (msg) => {
    if (!quiet) console.log(msg);
  };

  // ---- 起临时 server（随机端口）----
  const server = await startServer({ port: 0, projectRoot: deckDir, deckUrl: null });
  const actualPort = server.address().port;
  const pageUrl = `http://127.0.0.1:${actualPort}/editor/?deck=project/${encodeURIComponent(basename(manifestPath))}&shot=1`;

  // ---- 无头启动浏览器 ----
  const dbgPort = await freePort();
  const profileDir = mkdtempSync(join(tmpdir(), "pptd-shot-"));
  const chrome = spawn(
    browser,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--hide-scrollbars",
      `--remote-debugging-port=${dbgPort}`,
      `--user-data-dir=${profileDir}`,
      "--window-size=960,540",
      pageUrl,
    ],
    { stdio: "ignore" }
  );
  chrome.unref(); // 浏览器进程不阻塞 Node 退出（清理失败时兜底）

  let cdp = null;
  try {
    log(`渲染 ${manifestPath}（${browser}）`);
    cdp = await connectCdp(dbgPort, timeoutMs);
    await cdp.send("Runtime.enable");
    await cdp.send("Page.enable");
    await waitReady(cdp, timeoutMs); // 首页就绪

    // 视口 = 画布原生尺寸 × scale（截图即页面像素）
    // 视口 CSS 尺寸恒为画布尺寸（shot-root 固定 960×540），deviceScaleFactor 只放大
    // 输出分辨率（截图 = 960*scale × 540*scale 设备像素）——若把 scale 乘进 width/height，
    // CSS 视口会大于容器，内容缩在左上角、右下方出现大片白边（scale>1 时必现）
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: PAGE_WIDTH,
      height: PAGE_HEIGHT,
      deviceScaleFactor: scale,
      mobile: false,
    });

    const count = await cdp.evalJs("window.__pptdShot.count");
    if (!Number.isInteger(count) || count < 1) throw new Error(`页面数异常: ${count}`);

    const indices =
      pageSpec === "all" ? Array.from({ length: count }, (_, i) => i) : [pageSpec - 1];
    for (const i of indices) {
      if (i < 0 || i >= count) throw new Error(`页码 ${i + 1} 超出范围（共 ${count} 页）`);
    }

    const files = [];
    const single = indices.length === 1;
    for (const i of indices) {
      if (i !== 0) {
        await cdp.evalJs(`window.__pptdShot.goto(${i})`, timeoutMs); // 页内切页，避免整页重载
      }
      const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
      if (!shot.result?.data) throw new Error(`第 ${i + 1} 页截图失败（无数据）`);
      const buf = Buffer.from(shot.result.data, "base64");

      let filePath;
      if (single && outPath && outPath.toLowerCase().endsWith(".png")) {
        filePath = resolve(outPath);
      } else {
        const dir = outPath ? resolve(outPath) : deckDir;
        mkdirSync(dir, { recursive: true });
        filePath = join(dir, `${deckBase}-${String(i + 1).padStart(2, "0")}.png`);
      }
      writeFileSync(filePath, buf);
      files.push(filePath);
      log(`  ✓ 第 ${i + 1}/${count} 页 → ${filePath}（${(buf.length / 1024).toFixed(0)}KB）`);
    }
    return { files, count };
  } finally {
    // ---- 清理：关浏览器、删临时 profile、关 server ----
    try {
      if (cdp) await withTimeout(cdp.send("Browser.close"), 2000, "关闭浏览器");
    } catch {}
    try {
      cdp?.close();
    } catch {}
    // 等浏览器自行退出（最多 1.5s），未退出再 kill
    const exited = new Promise((r) => chrome.once("exit", r));
    await Promise.race([exited, sleep(1500)]);
    try {
      chrome.kill();
    } catch {}
    try {
      rmSync(profileDir, { recursive: true, force: true });
    } catch {}
    // 强制断开全部连接（shot 模式的 SSE 长连接会让 server.close() 永远等不到）
    try {
      server.closeAllConnections?.();
    } catch {}
    server.close();
  }
}
