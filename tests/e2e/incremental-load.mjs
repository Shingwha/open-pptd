#!/usr/bin/env node
// ============================================================================
// incremental-load.mjs — 「有一页显示一页」渐进加载 E2E
// ----------------------------------------------------------------------------
// 用法: node tests/e2e/incremental-load.mjs [--project <目录>]（缺省用临时目录）
// 验证 Agent 写入中的项目体验：
//   1. manifest 引用 N 页但只写了 1 页 → 编辑器显示已有页（不整体失败），
//      toast 提示缺失页数
//   2. 补写一页 → SSE 自动刷新 → 页数 +1
//   3. 全部补全 → 全量显示
//   4. 页面文件写坏（YAML 语法错误）→ 错误占位页显示，其余页面不受影响
// 依赖: 本机 Chrome（CDP），SMOKE_CHROME 环境变量可指定路径。
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
// 缺省用系统临时目录（跑完即清，不污染仓库）；显式 --project 才用指定目录
const ownTmp = projIdx < 0;
const PROJECT = ownTmp ? mkdtempSync(join(tmpdir(), "pptd-incremental-")) : process.argv[projIdx + 1];
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
const cdp = await connectCdp(9241, 10000);
const evalJs = (expr) => cdp.evalJs(expr);
await cdp.send("Runtime.enable");

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
  cdp.close();
  chrome.kill();
  server.close();
  if (ownTmp) try { rmSync(PROJECT, { recursive: true, force: true }); } catch { /* 清理失败不影响结果 */ }
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);
