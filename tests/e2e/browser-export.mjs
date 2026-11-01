#!/usr/bin/env node
// tests/e2e/browser-export.mjs — browser save + ExportService export E2E (real Chrome, real downloads).
// 1. save: add text → disk updated, source revision changes.
// 2. revision conflict: external edit → save → overwrite/reload/cancel dialog; overwrite wins.
// 3. PPTX export through the browser ExportService adapter; package-integrity passes.
// 4. project bundle entries; 5. PNG foreignObject fallback at scale 2 (RGBA, 1920×1080).
// A missing Chrome prints SKIP and exits 0. Usage: node tests/e2e/browser-export.mjs

import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../../packages/server/index.js";
import { findBrowser } from "../../packages/renderer/headless/browser.js";
import { connectCdp } from "../../packages/renderer/headless/cdp.js";
import { unzip } from "../lib/unzip.js";
import { run } from "../lib/run.js";

let CHROME;
try {
  CHROME = findBrowser();
} catch (err) {
  console.log(`SKIP  未找到 Chrome/Edge（${err.message}）`);
  process.exit(0);
}

const results = [];
function log(name, pass, detail = "") {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
}

const ROOT = mkdtempSync(join(tmpdir(), "pptd-browser-export-"));
const PROJECT = join(ROOT, "project");
const DOWNLOADS = join(ROOT, "downloads");
mkdirSync(join(PROJECT, "pages"), { recursive: true });
mkdirSync(DOWNLOADS, { recursive: true });
writeFileSync(
  join(PROJECT, "deck.pptd"),
  "version: v2\ntitle: 浏览器导出测试\nsize: [960, 540]\npages:\n  - pages/1.page\n  - pages/2.page\n"
);
const pageYaml = (n) =>
  "pageType: content\nbackground: {type: solid, color: \"#ffffff\"}\nelements:\n" +
  `  - elementId: t${n}\n    elementType: text\n    bounds: [80, 60, 360, 48]\n` +
  `    content: {fontSize: 24, color: "#1f2937", align: [left, middle], text: '第${n}页'}\n`;
writeFileSync(join(PROJECT, "pages", "1.page"), pageYaml(1));
writeFileSync(join(PROJECT, "pages", "2.page"), pageYaml(2));

const server = await startServer({ port: 0, projectRoot: PROJECT, liveReload: false });
const PORT = server.address().port;
const URL = `http://127.0.0.1:${PORT}/editor/?deck=project/deck.pptd`;
const chrome = spawn(
  CHROME,
  ["--headless=new", "--disable-gpu", "--no-first-run", "--remote-debugging-port=9345", URL],
  { stdio: "ignore" }
);
let cdp;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const sleepUntil = async (fn, timeoutMs = 15000, step = 200) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await fn();
    if (value) return value;
    await wait(step);
  }
  return null;
};

try {
  cdp = await connectCdp(9345, 15000);
} catch (err) {
  console.error(`SKIP  Chrome 未能启动（${err.message}）`);
  chrome.kill();
  await new Promise((r) => server.close(r));
  rmSync(ROOT, { recursive: true, force: true });
  process.exit(0);
}

const evalJs = (expr) => cdp.evalJs(expr);
const consoleLogs = [];
cdp.onEvent((msg) => {
  if (msg.method === "Runtime.consoleAPICalled") {
    consoleLogs.push(`[console.${msg.params.type}] ${msg.params.args.map((a) => a.value ?? a.description ?? "").join(" ")}`.slice(0, 500));
  }
  if (msg.method === "Runtime.exceptionThrown") {
    consoleLogs.push(`[exception] ${msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text}`.slice(0, 500));
  }
});
const toastText = () =>
  evalJs(`[...document.querySelectorAll('.toast')].map((e) => e.textContent).join(' | ')`).catch(() => "");
const toastLog = [];
const toastTimer = setInterval(async () => {
  try {
    const text = await toastText();
    for (const part of String(text || "").split(" | ")) {
      if (part && !toastLog.includes(part)) toastLog.push(part);
    }
  } catch {
    /* page not ready yet */
  }
}, 400);
const listDownloads = () => {
  try {
    return readdirSync(DOWNLOADS);
  } catch {
    return [];
  }
};
const waitDownload = (ext, before) =>
  sleepUntil(() => {
    const hit = listDownloads().find((n) => n.endsWith(ext) && !before.includes(n));
    if (!hit) return null;
    const p = join(DOWNLOADS, hit);
    const size = statSync(p).size;
    return size > 0 ? { name: hit, path: p, size } : null;
  }, 120000, 250);
const clickDialogButton = (text) =>
  evalJs(
    `(() => {
      const btn = [...document.querySelectorAll('.dialog button')].find((b) => b.textContent.trim() === ${JSON.stringify(text)});
      if (btn) { btn.click(); return true; }
      return false;
    })()`
  );
const dialogText = () => evalJs(`document.querySelector('.dialog')?.textContent || ''`);

try {
  await cdp.send("Runtime.enable");
  try {
    await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: DOWNLOADS, eventsEnabled: true });
  } catch {
    /* page-level fallback below */
  }
  try {
    await cdp.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: DOWNLOADS });
  } catch {
    /* browser-level behavior above already applies */
  }
  await wait(3500);

  // 0) load + revision
  let s = await evalJs(`(() => ({
    pages: window.__pptdEditor?.state?.deck?.pages?.length,
    revision: window.__pptdIo?.source?.lastRevision,
    title: window.__pptdEditor?.state?.deck?.title,
  }))()`);
  log("浏览器加载项目并取得 revision", s?.pages === 2 && typeof s?.revision === "string" && s.revision.startsWith("rev-"), JSON.stringify(s));
  const revisionBefore = s.revision;
  const pageBefore = readFileSync(join(PROJECT, "pages", "1.page"), "utf8");

  // 1) save: add text → revision changes on disk
  await evalJs(`window.__pptdEditor.addText()`);
  await evalJs(`window.__pptdIo.saveProject()`);
  const saved = await sleepUntil(() => {
    try {
      return readFileSync(join(PROJECT, "pages", "1.page"), "utf8") !== pageBefore ? true : null;
    } catch {
      return null;
    }
  }, 10000);
  const revisionAfterSave = await evalJs(`window.__pptdIo.source.lastRevision`);
  log(
    "保存写盘且 revision 更新",
    !!saved && revisionAfterSave !== revisionBefore,
    JSON.stringify({ revisionBefore, revisionAfterSave })
  );
  const savedPage = readFileSync(join(PROJECT, "pages", "1.page"), "utf8");

  // 2) conflict → overwrite
  writeFileSync(join(PROJECT, "pages", "1.page"), `# external edit\n${savedPage}`);
  // Do not await: saveProject stays pending while the conflict dialog is open.
  await evalJs(`void window.__pptdIo.saveProject(); true`);
  const conflictText = await sleepUntil(async () => {
    const text = await dialogText();
    return text.includes("项目已被外部修改") ? text : null;
  }, 8000);
  log("冲突弹窗（覆盖/重新加载/取消）", !!conflictText && conflictText.includes("覆盖保存") && conflictText.includes("重新加载磁盘版本"), JSON.stringify({ hasText: !!conflictText }));
  const clicked = await clickDialogButton("覆盖保存");
  const overwritten = await sleepUntil(() => {
    try {
      return readFileSync(join(PROJECT, "pages", "1.page"), "utf8") === savedPage;
    } catch {
      return null;
    }
  }, 10000);
  log("覆盖保存写入编辑器版本", clicked === true && !!overwritten);

  // 3) PPTX via ExportService
  const pptxBefore = listDownloads();
  await evalJs(`window.__pptdIo.exportPptx()`);
  const opened = await sleepUntil(async () => (await dialogText()).includes("导出 PPTX"), 5000);
  log("PPTX 导出对话框", !!opened);
  await clickDialogButton("导出");
  const pptx = await waitDownload(".pptx", pptxBefore);
  log(
    "PPTX 下载完成",
    !!pptx,
    JSON.stringify(pptx ? { name: pptx.name, size: pptx.size } : { toasts: toastLog, logs: consoleLogs.slice(-6) })
  );
  if (pptx) {
    const { code, stdout } = await run(`node tests/regression/package-integrity.mjs ${pptx.path} 2`);
    log("浏览器 PPTX 包一致性（与 CLI 同结构门禁）", code === 0, code === 0 ? "" : stdout.slice(-300));
  }

  // 4) project bundle
  const zipBefore = listDownloads();
  await evalJs(`window.__pptdIo.exportProjectZip()`);
  const bundle = await waitDownload(".zip", zipBefore);
  let bundleEntries = [];
  if (bundle) {
    const dir = join(ROOT, "bundle");
    mkdirSync(dir, { recursive: true });
    bundleEntries = unzip(readFileSync(bundle.path), dir);
  }
  log(
    "项目包条目（deck + 2 页）",
    !!bundle && bundleEntries.includes("deck.pptd") && bundleEntries.includes("pages/1.page") && bundleEntries.includes("pages/2.page"),
    JSON.stringify(bundleEntries)
  );

  // 5) PNG foreignObject fallback, scale 2, 2 pages zip
  const pngZipBefore = listDownloads();
  await evalJs(`window.__pptdForceImageFallback = true; window.__pptdIo.exportImages()`);
  const imgDialog = await sleepUntil(async () => (await dialogText()).includes("导出图片"), 5000);
  log("PNG 导出对话框", !!imgDialog);
  await clickDialogButton("全选");
  await clickDialogButton("导出");
  const pngZip = await waitDownload(".zip", pngZipBefore);
  log("PNG zip 下载完成", !!pngZip, JSON.stringify(pngZip && { name: pngZip.name, size: pngZip.size }));
  if (pngZip) {
    const dir = join(ROOT, "png");
    mkdirSync(dir, { recursive: true });
    const entries = unzip(readFileSync(pngZip.path), dir).filter((f) => /\.png$/i.test(f));
    log("PNG zip 含 2 张", entries.length === 2, JSON.stringify(entries));
    const dims = entries.map((f) => {
      const bytes = readFileSync(join(dir, f));
      return { name: f.split("/").pop(), width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), colorType: bytes[25] };
    });
    log(
      "foreignObject 2x 尺寸 1920×1080",
      dims.length === 2 && dims.every((d) => d.width === 1920 && d.height === 1080),
      JSON.stringify(dims)
    );
    log("foreignObject PNG 保留 alpha 通道（color type 6）", dims.length === 2 && dims.every((d) => d.colorType === 6), JSON.stringify(dims.map((d) => d.colorType)));
  }

  // 6) PNG capture path (server /api/export-image → headless backend)
  //    Chrome blocks a 4th automatic download in one tab, so this path is asserted
  //    on the in-page ExportImageResult bytes (the zip packaging itself is already
  //    covered by the foreignObject step).
  await evalJs(`window.__pptdForceImageFallback = false; window.__pptdIo.exportImages()`);
  await sleepUntil(async () => (await dialogText()).includes("导出图片"), 5000);
  await clickDialogButton("全选");
  await clickDialogButton("导出");
  const captureResults = await sleepUntil(async () => {
    const rows = await evalJs(`(() => (window.__pptdEditor.state.lastImageExport || []).map((r) => {
      const view = r.png ? new DataView(r.png.buffer, r.png.byteOffset, r.png.byteLength) : null;
      return { source: r.source, len: r.png?.length || 0, width: view ? view.getUint32(16) : 0, height: view ? view.getUint32(20) : 0 };
    }))()`);
    return Array.isArray(rows) && rows.length === 2 && rows.every((r) => r.source === "capture" && r.len > 1000) ? rows : null;
  }, 120000);
  log("capture 后端经由 server 端点出图", !!captureResults, JSON.stringify(captureResults || toastLog.slice(-3)));
  log(
    "capture 2x 尺寸 1920×1080",
    !!captureResults && captureResults.every((r) => r.width === 1920 && r.height === 1080),
    JSON.stringify(captureResults)
  );
} catch (err) {
  console.error("测试异常:", err);
  results.push({ name: "测试异常", pass: false });
} finally {
  clearInterval(toastTimer);
  cdp.close();
  chrome.kill();
  await new Promise((r) => server.close(r));
  try {
    rmSync(ROOT, { recursive: true, force: true });
  } catch {
    /* cleanup failure does not change the result */
  }
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);
