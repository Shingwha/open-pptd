#!/usr/bin/env node
// ============================================================================
// page-ops.mjs — single-page operations E2E (W7 acceptance, editor-ux §2)
// ----------------------------------------------------------------------------
// Covers the 3.0 page model (no page multi-select / batch / duplicate):
//   · ＋ inserts after the current page and switches to it
//   · visible page menu: insert before, move forward/backward, delete
//   · api.insertPage / deletePage / movePage with undo and current-page following
//   · thumbnail bar drag-sort reorders the model (undoable)
//   · at least one page always survives; deleting down to one disables the menu item
// Depends on a local Chrome (CDP). A missing browser prints SKIP and exits 0.
// Usage: node tests/e2e/page-ops.mjs
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
  console.log(`SKIP  未找到 Chrome/Edge（${err.message}）`);
  process.exit(0);
}

const results = [];
function log(name, pass, detail = "") {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
}

// ---------------------------------------------------------------------------
// Temporary project: 3 pages, title marker on each page
// ---------------------------------------------------------------------------
const PROJECT = mkdtempSync(join(tmpdir(), "pptd-page-ops-"));
mkdirSync(join(PROJECT, "pages"), { recursive: true });
writeFileSync(
  join(PROJECT, "deck.pptd"),
  "version: v2\ntitle: 页面操作测试\nsize: [960, 540]\npages:\n  - pages/1.page\n  - pages/2.page\n  - pages/3.page\n"
);
const pageYaml = (n) =>
  "pageType: content\nbackground: {type: solid, color: \"#ffffff\"}\nelements:\n" +
  `  - elementId: t${n}\n    elementType: text\n    bounds: [80, 60, 360, 48]\n` +
  `    content: {fontSize: 24, color: "#1f2937", align: [left, middle], text: '第${n}页'}\n`;
for (const n of [1, 2, 3]) writeFileSync(join(PROJECT, "pages", `${n}.page`), pageYaml(n));

const server = await startServer({ port: 0, projectRoot: PROJECT });
const PORT = server.address().port;
const URL = `http://127.0.0.1:${PORT}/editor/?deck=project/deck.pptd`;
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-first-run", "--remote-debugging-port=9342", URL], { stdio: "ignore" });
let cdp;
try {
  cdp = await connectCdp(9342, 15000);
} catch (err) {
  console.error(`SKIP  Chrome 未能启动（${err.message}）`);
  chrome.kill();
  server.close();
  process.exit(0);
}
const evalJs = (expr) => cdp.evalJs(expr);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await cdp.send("Runtime.enable");

// Read the page marker order + current page + thumbnail count in one call
const snapshot = () =>
  evalJs(`(() => {
    const s = window.__pptdEditor.state;
    const marker = (p) => p.elements?.[0]?.content?.text || '';
    return {
      n: s.deck.pages.length,
      cur: s.currentPage,
      markers: s.deck.pages.map(marker),
      thumbs: document.querySelectorAll('.thumb').length,
      count: document.querySelector('#page-count')?.textContent || '',
      active: document.querySelector('.thumb.active')?.dataset?.pageIndex || null,
    };
  })()`);

try {
  await wait(3500);

  // -------------------------------------------------------------------------
  // 0) Initial state
  // -------------------------------------------------------------------------
  let s = await snapshot();
  log("初始 3 页 / 3 缩略图", s.n === 3 && s.thumbs === 3 && s.cur === 0, JSON.stringify(s));
  log("页码状态条为 1 / 3", s.count.trim() === "1 / 3", JSON.stringify({ count: s.count }));

  // -------------------------------------------------------------------------
  // 1) ＋ inserts after the current page and switches to it
  // -------------------------------------------------------------------------
  s = await evalJs(`(() => {
    const api = window.__pptdEditor;
    document.querySelector('#btn-add-page').click();
    return {
      n: api.state.deck.pages.length,
      cur: api.state.currentPage,
      thumbs: document.querySelectorAll('.thumb').length,
      active: document.querySelector('.thumb.active')?.dataset?.pageIndex,
    };
  })()`);
  log("＋ 插到当前页之后并切到新页", s.n === 4 && s.cur === 1 && s.thumbs === 4 && s.active === "1", JSON.stringify(s));

  s = await evalJs(`(() => { window.__pptdEditor.undo(); return window.__pptdEditor.state.deck.pages.length; })()`);
  log("插入可撤销", s === 3, JSON.stringify({ pages: s }));

  // -------------------------------------------------------------------------
  // 2) Visible page menu: insert before / move / delete
  // -------------------------------------------------------------------------
  s = await evalJs(`(async () => {
    const api = window.__pptdEditor;
    api.goToPage(0);
    document.querySelector('#btn-page-menu').click();
    await new Promise((r) => setTimeout(r, 100));
    const labels = [...document.querySelectorAll('.page-menu .mi')].map((el) => el.textContent.trim());
    [...document.querySelectorAll('.page-menu .mi')].find((el) => el.textContent.includes('在当前页前插入')).click();
    await new Promise((r) => setTimeout(r, 100));
    return { labels, n: api.state.deck.pages.length, cur: api.state.currentPage, menu: document.querySelectorAll('.page-menu').length };
  })()`);
  log(
    "页面菜单含前插/后插/前移/后移/置顶/置底/删除",
    ["在当前页前插入", "在当前页后插入", "前移一页", "后移一页", "移到最前", "移到最后", "删除当前页"].every((x) =>
      s.labels.some((l) => l.includes(x))
    ),
    JSON.stringify(s.labels)
  );
  log("菜单前插生效并关闭", s.n === 4 && s.cur === 0 && s.menu === 0, JSON.stringify(s));

  s = await evalJs(`(() => {
    const api = window.__pptdEditor;
    api.undo();
    const n0 = api.state.deck.pages.length;
    api.goToPage(0);
    document.querySelector('#btn-page-menu').click();
    [...document.querySelectorAll('.page-menu .mi')].find((el) => el.textContent.includes('后移一页')).click();
    return { pages: n0, cur: api.state.currentPage, markers: api.state.deck.pages.map((p) => p.elements?.[0]?.content?.text) };
  })()`);
  log("菜单后移一页（当前页跟随）", s.cur === 1 && s.markers[0] === "第2页" && s.markers[1] === "第1页", JSON.stringify(s));

  s = await evalJs(`(() => { window.__pptdEditor.undo(); return window.__pptdEditor.state.deck.pages.map((p)=>p.elements?.[0]?.content?.text); })()`);
  log("移动可撤销", JSON.stringify(s) === JSON.stringify(["第1页", "第2页", "第3页"]), JSON.stringify(s));

  // -------------------------------------------------------------------------
  // 3) api.movePage: current page follows the moved page; undo restores
  // -------------------------------------------------------------------------
  s = await evalJs(`(() => {
    const api = window.__pptdEditor;
    api.goToPage(0);
    const ok = api.movePage(0, 2);
    return { ok, cur: api.state.currentPage, markers: api.state.deck.pages.map((p) => p.elements?.[0]?.content?.text) };
  })()`);
  log("movePage(0,2) 当前页跟随", s.ok === true && s.cur === 2 && s.markers[2] === "第1页", JSON.stringify(s));

  s = await evalJs(`(() => { window.__pptdEditor.undo(); return window.__pptdEditor.state.deck.pages.map((p)=>p.elements?.[0]?.content?.text); })()`);
  log("movePage 可撤销", JSON.stringify(s) === JSON.stringify(["第1页", "第2页", "第3页"]), JSON.stringify(s));

  // -------------------------------------------------------------------------
  // 4) Drag-sort in the thumbnail bar (pointer events; drop on the last card's right half)
  // -------------------------------------------------------------------------
  s = await evalJs(`(async () => {
    const api = window.__pptdEditor;
    api.goToPage(0);
    await new Promise((r) => setTimeout(r, 100));
    const cards = [...document.querySelectorAll('.thumb')];
    const from = cards[0].getBoundingClientRect();
    const to = cards[2].getBoundingClientRect();
    const base = { bubbles: true, pointerId: 2, isPrimary: true, button: 0 };
    cards[0].dispatchEvent(new PointerEvent('pointerdown', { ...base, buttons: 1, clientX: from.left + 8, clientY: from.top + 8 }));
    window.dispatchEvent(new PointerEvent('pointermove', { ...base, buttons: 1, clientX: to.right - 6, clientY: to.top + to.height / 2 }));
    await new Promise((r) => setTimeout(r, 50));
    window.dispatchEvent(new PointerEvent('pointerup', { ...base, buttons: 0, clientX: to.right - 6, clientY: to.top + to.height / 2 }));
    await new Promise((r) => setTimeout(r, 300));
    return { markers: api.state.deck.pages.map((p) => p.elements?.[0]?.content?.text), cur: api.state.currentPage };
  })()`);
  log("缩略图拖拽排序", s.markers[2] === "第1页", JSON.stringify(s));

  s = await evalJs(`(() => { window.__pptdEditor.undo(); return window.__pptdEditor.state.deck.pages.map((p)=>p.elements?.[0]?.content?.text); })()`);
  log("拖拽排序可撤销", JSON.stringify(s) === JSON.stringify(["第1页", "第2页", "第3页"]), JSON.stringify(s));

  // -------------------------------------------------------------------------
  // 5) Delete: current page follows; at least one page survives; menu item disabled
  // -------------------------------------------------------------------------
  s = await evalJs(`(() => {
    const api = window.__pptdEditor;
    api.goToPage(2);
    const ok = api.deletePage(0);
    return { ok, n: api.state.deck.pages.length, cur: api.state.currentPage, markers: api.state.deck.pages.map((p) => p.elements?.[0]?.content?.text) };
  })()`);
  log("删除前页后当前页跟随", s.ok === true && s.n === 2 && s.cur === 1 && s.markers[0] === "第2页", JSON.stringify(s));

  s = await evalJs(`(() => {
    const api = window.__pptdEditor;
    api.deletePage(0);
    const t = Date.now();
    const last = api.deletePage(0); // the final page must survive
    document.querySelector('#btn-page-menu').click();
    const delItem = [...document.querySelectorAll('.page-menu .mi')].find((el) => el.textContent.includes('删除当前页'));
    return {
      n: api.state.deck.pages.length,
      lastOk: last,
      thumbs: document.querySelectorAll('.thumb').length,
      count: document.querySelector('#page-count')?.textContent || '',
      deleteDisabled: !!delItem?.classList.contains('dis'),
    };
  })()`);
  log("至少保留 1 页", s.n === 1 && s.lastOk === false && s.thumbs === 1, JSON.stringify(s));
  log("仅剩 1 页时页面菜单删除项禁用", s.deleteDisabled === true, JSON.stringify({ deleteDisabled: s.deleteDisabled }));
  log("页码状态条 1 / 1", s.count.trim() === "1 / 1", JSON.stringify({ count: s.count }));

  // Close the menu, then undo the deletions back to 3 pages
  s = await evalJs(`(() => {
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    const api = window.__pptdEditor;
    api.undo();
    api.undo();
    return { n: api.state.deck.pages.length, thumbs: document.querySelectorAll('.thumb').length };
  })()`);
  log("删除可撤销（恢复 3 页）", s.n === 3 && s.thumbs === 3, JSON.stringify(s));
} catch (err) {
  console.error("测试异常:", err);
  results.push({ name: "测试异常", pass: false });
} finally {
  cdp.close();
  chrome.kill();
  server.close();
  try {
    rmSync(PROJECT, { recursive: true, force: true });
  } catch {
    /* cleanup failure does not change the result */
  }
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);
