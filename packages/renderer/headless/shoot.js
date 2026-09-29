// ============================================================================
// renderer/headless/shoot.js — headless render orchestration (open-pptd render, Node-only)
// ----------------------------------------------------------------------------
// Flow: a temporary static server + local headless Chrome/Edge + CDP screenshots, emitting
// one PNG per page through the same render pipeline as the editor preview
// (editor/?shot=1 → renderer/page.js, same font files and imageMap). No browser window,
// no user interaction.
//
// startServer is injected by the caller (packages/server) to keep renderer → server free of
// a reverse dependency (direction: model ← renderer ← cli/server, see tests/regression/dep-graph.mjs).
// ============================================================================

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, rmSync, readdirSync, statSync, mkdtempSync } from "node:fs";
import { join, dirname, basename, extname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { findBrowser, freePort } from "./browser.js";
import { connectCdp, enableReady, waitReady, withTimeout, sleep } from "./cdp.js";

/**
 * Render a deck page by page to PNG.
 * @param {object} opts
 * @param {string} opts.manifest .pptd file path (or a project directory containing exactly one .pptd)
 * @param {string} [opts.outPath] output: a directory (defaults to the deck directory); for a single page a path ending in .png is treated as a file
 * @param {number|string} [opts.page] page number (1-based) or "all" (default all)
 * @param {number} [opts.scale] 1|2|3 (default 1 → 960×540)
 * @param {string} [opts.browserPath] browser executable path (auto-discovered by default)
 * @param {number} [opts.timeoutMs] per-step timeout (default 30s)
 * @param {boolean} [opts.quiet] quiet (no intermediate logs)
 * @param {(options: object) => Promise<import("node:http").Server>} opts.startServer
 *        static server factory (injected from packages/server to keep layering free of a reverse dependency)
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
  // ---- Resolve the manifest (directory → the single .pptd) ----
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

  // ---- Start a temporary server (random port) ----
  const server = await startServer({ port: 0, projectRoot: deckDir, deckUrl: null });
  const actualPort = server.address().port;
  const pageUrl = `http://127.0.0.1:${actualPort}/editor/?deck=project/${encodeURIComponent(basename(manifestPath))}&shot=1`;

  // ---- Launch the headless browser ----
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
      "about:blank", // blank page first: assemble the ready binding, then navigate, so the first bindingCalled is not lost
    ],
    { stdio: "ignore" }
  );
  chrome.unref(); // the browser process must not block Node exit (fallback if cleanup fails)

  let cdp = null;
  try {
    log(`渲染 ${manifestPath}（${browser}）`);
    cdp = await connectCdp(dbgPort, timeoutMs);
    await cdp.send("Page.enable");
    await enableReady(cdp); // Runtime.enable + addBinding (must precede navigation)
    // Register the ready listener before navigating: the page calls the binding after paint → event push (no polling)
    const ready = waitReady(cdp, timeoutMs);
    await cdp.send("Page.navigate", { url: pageUrl });
    await ready;

    // Viewport = the deck's own size (width/height come back from the shot contract);
    // deviceScaleFactor only scales the output resolution. Multiplying scale into
    // width/height would make the CSS viewport larger than the container, shrinking
    // content into the top-left with a large white margin bottom-right (always at scale>1)
    const meta = await cdp.evalJs(
      "({count: window.__pptdShot.count, width: window.__pptdShot.width, height: window.__pptdShot.height})"
    );
    if (!Number.isInteger(meta?.count) || meta.count < 1) throw new Error(`页面数异常: ${meta?.count}`);
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: meta.width,
      height: meta.height,
      deviceScaleFactor: scale,
      mobile: false,
    });

    const indices =
      pageSpec === "all" ? Array.from({ length: meta.count }, (_, i) => i) : [pageSpec - 1];
    for (const i of indices) {
      if (i < 0 || i >= meta.count) throw new Error(`页码 ${i + 1} 超出范围（共 ${meta.count} 页）`);
    }

    const files = [];
    const single = indices.length === 1;
    for (const i of indices) {
      if (i !== 0) {
        await cdp.evalJs(`window.__pptdShot.goto(${i})`, timeoutMs); // switch page in-page to avoid a full reload
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
      log(`  ✓ 第 ${i + 1}/${meta.count} 页 → ${filePath}（${(buf.length / 1024).toFixed(0)}KB）`);
    }
    return { files, count: meta.count };
  } finally {
    // ---- Cleanup: close the browser, delete the temp profile, close the server ----
    try {
      if (cdp) await withTimeout(cdp.send("Browser.close"), 2000, "关闭浏览器");
    } catch {}
    try {
      cdp?.close();
    } catch {}
    // Wait up to 1.5s for the browser to exit on its own, then kill it
    const exited = new Promise((r) => chrome.once("exit", r));
    await Promise.race([exited, sleep(1500)]);
    try {
      chrome.kill();
    } catch {}
    try {
      rmSync(profileDir, { recursive: true, force: true });
    } catch {}
    // Force-close all connections (the shot-mode SSE long connection would make server.close() wait forever)
    try {
      server.closeAllConnections?.();
    } catch {}
    server.close();
  }
}
