#!/usr/bin/env node
// ============================================================================
// incremental-load.mjs — "show every page that exists" progressive-load E2E
// ----------------------------------------------------------------------------
// Usage: node tests/e2e/incremental-load.mjs [--project <dir>] (temp dir by default)
// Verifies the experience while an agent is writing a project:
//   1. manifest references N pages but only 1 is written → the editor shows the
//      existing page (no total failure) and a toast notes the missing pages
//   2. Write one more page → SSE auto-refresh → page count +1
//   3. All pages written → everything shown
//   4. A page file is malformed (YAML syntax error) → an error placeholder page is
//      shown and the other pages are unaffected
// Depends on a local Chrome (CDP); SMOKE_CHROME can point at its path.
// ============================================================================

import { spawn } from "node:child_process";
import { writeFileSync, rmSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../../packages/server/index.js";
import { findBrowser } from "../../packages/renderer/headless/browser.js";
import { connectCdp } from "../../packages/renderer/headless/cdp.js";

let CHROME;
try {
  CHROME = findBrowser();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const results = [];
function log(name, pass, detail = "") {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
}

const projIdx = process.argv.indexOf("--project");
// Default to the system temp dir (removed on exit, keeps the repo clean); an explicit --project uses the given dir
const ownTmp = projIdx < 0;
const PROJECT = ownTmp ? mkdtempSync(join(tmpdir(), "pptd-incremental-")) : process.argv[projIdx + 1];
const PORT = 56122;
rmSync(PROJECT, { recursive: true, force: true });
mkdirSync(join(PROJECT, "pages"), { recursive: true });

// manifest references 3 pages but only 1 is written first
writeFileSync(join(PROJECT, "deck.pptd"), "version: v2\ntitle: 增量测试\ntheme: cyan\nsize: [960, 540]\npages:\n  - pages/1.page\n  - pages/2.page\n  - pages/3.page\n");
const pageYaml = (n) =>
  "pageType: content\nbackground: {type: solid, color: \"#131010\"}\nelements:\n" +
  `  - elementId: t${n}\n    elementType: text\n    bounds: [64, 64, 400, 40]\n` +
  `    content: {fontSize: 22, bold: true, color: "#F2EDED", align: [left, middle], text: '第${n}页'}\n`;
writeFileSync(join(PROJECT, "pages", "1.page"), pageYaml(1));

const server = await startServer({ port: PORT, projectRoot: PROJECT });
const URL = `http://127.0.0.1:${PORT}/editor/?deck=project/deck.pptd`;
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-first-run", `--remote-debugging-port=${9241}`, URL], { stdio: "ignore" });
const cdp = await connectCdp(9241, 10000);
const evalJs = (expr) => cdp.evalJs(expr);
await cdp.send("Runtime.enable");

try {
  await new Promise((r) => setTimeout(r, 3000));

  // 1) only 1/3 pages written → 1 page shown + a missing-page notice
  let s = await evalJs(`(() => ({ pages: window.__pptdEditor?.state?.deck?.pages?.length, toasts: document.querySelectorAll('.toast').length }))()`);
  log("部分页面时显示已有页（1/3）", s.pages === 1, JSON.stringify(s));
  // Behaviour: a notice toast must appear; assert presence, not its wording.
  log("toast 提示缺失页数", s.toasts >= 1, `toasts=${s.toasts}`);

  // 2) write page 2 → auto-refresh → 2 pages
  writeFileSync(join(PROJECT, "pages", "2.page"), pageYaml(2));
  await new Promise((r) => setTimeout(r, 3500));
  s = await evalJs(`window.__pptdEditor?.state?.deck?.pages?.length`);
  log("补一页自动多一页（2/3）", s === 2, `pages=${s}`);

  // 3) write page 3 → all present
  writeFileSync(join(PROJECT, "pages", "3.page"), pageYaml(3));
  await new Promise((r) => setTimeout(r, 3500));
  s = await evalJs(`window.__pptdEditor?.state?.deck?.pages?.length`);
  log("全部补全（3/3）", s === 3, `pages=${s}`);

  // 4) malformed page → placeholder, no crash
  writeFileSync(join(PROJECT, "pages", "2.page"), "pageType: content\n  broken: [unclosed\n");
  await new Promise((r) => setTimeout(r, 3500));
  s = await evalJs(`(() => ({ pages: window.__pptdEditor?.state?.deck?.pages?.length, err: document.querySelectorAll('.page-error').length }))()`);
  log("坏页占位不崩溃", s.pages === 3 && s.err === 1, JSON.stringify(s));
} catch (err) {
  console.error("测试异常:", err);
} finally {
  cdp.close();
  chrome.kill();
  server.close();
  if (ownTmp) try { rmSync(PROJECT, { recursive: true, force: true }); } catch { /* a failed cleanup does not change the result */ }
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);
