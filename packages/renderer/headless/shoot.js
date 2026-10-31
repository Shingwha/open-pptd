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
//
// Framebuffer / DPR invariants (W3, decisions D10):
//   · deviceScaleFactor = scale is applied BEFORE navigation, so the page's first paint
//     (and ECharts' module-level devicePixelRatio snapshot) is already at the export DPR;
//   · after navigation the viewport is corrected to the deck size (same scale) and page 0
//     is repainted — a metrics change alone leaves a stale surface / old-DPR chart canvas;
//   · every page switch waits for the page's own paint-complete signal (pptdReady, fired
//     after fonts + image decode + double rAF) before the screenshot is requested;
//   · the one-shot render server runs with liveReload:false: the SSE "ready" push would
//     otherwise reload the project and repaint page 0 while the driver is switching pages.
// ============================================================================

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, rmSync, readdirSync, statSync, mkdtempSync } from "node:fs";
import { join, dirname, basename, extname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { findBrowser, freePort } from "./browser.js";
import { connectCdp, enableReady, waitReady, withTimeout, sleep } from "./cdp.js";

/**
 * Resolve a render target: a .pptd path, or a project directory holding exactly one .pptd.
 * @param {string} manifest path or directory
 * @returns {string} absolute .pptd path
 */
export function resolveShotManifest(manifest) {
  let manifestPath = manifest;
  if (!existsSync(manifestPath)) throw new Error(`文件不存在: ${manifestPath}`);
  if (statSync(manifestPath).isDirectory()) {
    const candidates = readdirSync(manifestPath).filter((f) => f.endsWith(".pptd"));
    if (candidates.length !== 1) {
      throw new Error(`目录 ${manifestPath} 下应有且仅有一个 .pptd 文件（实际 ${candidates.length} 个）`);
    }
    manifestPath = join(manifestPath, candidates[0]);
  }
  return resolve(manifestPath);
}

/** Validate/parse the CLI page/scale options with the historical messages. */
function normalizePage(page) {
  const pageSpec = page === "all" ? "all" : Number(page);
  if (pageSpec !== "all" && (!Number.isInteger(pageSpec) || pageSpec < 1)) {
    throw new Error(`--page 仅支持页码（1 起）或 all（当前 ${page}）`);
  }
  return pageSpec;
}

function normalizeScale(scale) {
  const n = Number(scale);
  if (![1, 2, 3].includes(n)) throw new Error(`--scale 仅支持 1|2|3（当前 ${scale}）`);
  return n;
}

const METRICS_WIDTH = 960;
const METRICS_HEIGHT = 540;

/**
 * Open one headless shot session: temp server + browser + CDP, viewport/DPR prepared,
 * page 0 repainted after the final metrics override.
 * @param {object} opts
 * @param {string} opts.manifest .pptd path (or a directory containing exactly one)
 * @param {number} [opts.scale] 1|2|3
 * @param {string} [opts.browserPath]
 * @param {number} [opts.timeoutMs]
 * @param {boolean} [opts.quiet]
 * @param {(options: object) => Promise<import("node:http").Server>} opts.startServer
 * @returns {Promise<{
 *   manifestPath: string, deckDir: string, deckBase: string, count: number,
 *   width: number, height: number, scale: number, browser: string,
 *   paint(index: number): Promise<void>, capture(): Promise<Uint8Array>,
 *   diagnostics(): Promise<object>, close(): Promise<void>
 * }>}
 */
export async function openShotSession({
  manifest,
  scale = 1,
  browserPath = null,
  timeoutMs = 30000,
  quiet = false,
  startServer,
}) {
  if (typeof startServer !== "function") {
    throw new Error("renderDeck 需要注入 startServer（来自 packages/server）");
  }
  const manifestPath = resolveShotManifest(manifest);
  const deckDir = dirname(manifestPath);
  const deckBase = basename(manifestPath, extname(manifestPath));
  const shotScale = normalizeScale(scale);
  const browser = findBrowser(browserPath);
  const log = (msg) => {
    if (!quiet) console.log(msg);
  };

  // liveReload:false — one-shot temp server; the SSE "ready" push would reload the
  // project (state.currentPage → 0) while the driver is switching pages.
  const server = await startServer({ port: 0, projectRoot: deckDir, deckUrl: null, liveReload: false });
  const actualPort = server.address().port;
  const pageUrl = `http://127.0.0.1:${actualPort}/editor/?deck=project/${encodeURIComponent(basename(manifestPath))}&shot=1`;

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
      `--window-size=${METRICS_WIDTH},${METRICS_HEIGHT}`,
      "about:blank", // blank page first: assemble the ready binding, then navigate, so the first bindingCalled is not lost
    ],
    { stdio: "ignore" }
  );
  chrome.unref(); // the browser process must not block Node exit (fallback if cleanup fails)

  let cdp = null;
  let closed = false;
  const cleanup = async () => {
    if (closed) return;
    closed = true;
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
  };

  try {
    log(`渲染 ${manifestPath}（${browser}）`);
    cdp = await connectCdp(dbgPort, timeoutMs);
    await cdp.send("Page.enable");
    await enableReady(cdp); // Runtime.enable + addBinding (must precede navigation)

    // DPR first: set deviceScaleFactor before the document (and ECharts) evaluates.
    // ECharts snapshots window.devicePixelRatio at module load, so a later override
    // cannot make its canvas backing store scale (it would stay 1x → blurry export).
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: METRICS_WIDTH,
      height: METRICS_HEIGHT,
      deviceScaleFactor: shotScale,
      mobile: false,
    });

    // Register the ready listener before navigating: the page calls the binding after paint → event push (no polling)
    const firstReady = waitReady(cdp, timeoutMs);
    await cdp.send("Page.navigate", { url: pageUrl });
    await firstReady;

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
      deviceScaleFactor: shotScale,
      mobile: false,
    });

    const paint = async (index) => {
      if (!Number.isInteger(index) || index < 0 || index >= meta.count) {
        throw new Error(`页码 ${index + 1} 超出范围（共 ${meta.count} 页）`);
      }
      // Register the one-shot ready listener BEFORE goto: the page notifies after
      // fonts/images are ready and two frames have been produced. A navigation/resize
      // can otherwise leave the compositor on the previous frame.
      const ready = waitReady(cdp, timeoutMs);
      try {
        await cdp.evalJs(`window.__pptdShot.goto(${index})`, timeoutMs); // switch page in-page to avoid a full reload
      } catch (err) {
        ready.catch(() => {}); // the pending listener must not become an unhandled rejection
        throw err;
      }
      await ready;
    };

    // The metrics override is a viewport resize: repaint page 0 at the final viewport
    // and wait for its ready signal before any capture (otherwise the first screenshot
    // can be the pre-resize surface, and page 0's charts stay at the old DPR).
    await paint(0);

    return {
      manifestPath,
      deckDir,
      deckBase,
      count: meta.count,
      width: meta.width,
      height: meta.height,
      scale: shotScale,
      browser,
      paint,
      async capture() {
        const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
        if (!shot.result?.data) throw new Error("截图失败（无数据）");
        return new Uint8Array(Buffer.from(shot.result.data, "base64"));
      },
      /** Frame diagnostic (tests): current window DPR + chart canvas backing ratios. */
      async diagnostics() {
        return cdp.evalJs(
          `(function(){
            var out = {dpr: window.devicePixelRatio, canvases: []};
            var nodes = document.querySelectorAll('#shot-root [data-chart-el] canvas');
            for (var i = 0; i < nodes.length; i++) {
              var c = nodes[i], r = c.getBoundingClientRect();
              out.canvases.push({width: c.width, height: c.height, cssWidth: r.width, cssHeight: r.height});
            }
            return out;
          })()`
        );
      },
      close: cleanup,
    };
  } catch (err) {
    await cleanup();
    throw err;
  }
}

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
  const pageSpec = normalizePage(page);
  const log = (msg) => {
    if (!quiet) console.log(msg);
  };
  const session = await openShotSession({
    manifest,
    scale,
    browserPath,
    timeoutMs,
    quiet,
    startServer,
  });
  try {
    const indices =
      pageSpec === "all" ? Array.from({ length: session.count }, (_, i) => i) : [pageSpec - 1];
    for (const i of indices) {
      if (i < 0 || i >= session.count) throw new Error(`页码 ${i + 1} 超出范围（共 ${session.count} 页）`);
    }

    const files = [];
    const single = indices.length === 1;
    for (const i of indices) {
      await session.paint(i);
      const data = await session.capture();

      let filePath;
      if (single && outPath && outPath.toLowerCase().endsWith(".png")) {
        filePath = resolve(outPath);
      } else {
        const dir = outPath ? resolve(outPath) : session.deckDir;
        mkdirSync(dir, { recursive: true });
        filePath = join(dir, `${session.deckBase}-${String(i + 1).padStart(2, "0")}.png`);
      }
      writeFileSync(filePath, data);
      files.push(filePath);
      log(`  ✓ 第 ${i + 1}/${session.count} 页 → ${filePath}（${(data.length / 1024).toFixed(0)}KB）`);
    }
    return { files, count: session.count };
  } finally {
    await session.close();
  }
}
