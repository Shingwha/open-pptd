#!/usr/bin/env node
// tests/e2e/feedback-fixes.mjs — trial-feedback regressions.
// 1. Gallery covers are static: no out-of-bounds toast, a cover drag never pans, the
//    host wheel still scrolls the gallery, and a card click still opens the project.
// 2. Wordmark: gallery / editor / full preview all read "OPEN PPTD".
// 3. Full preview keeps pan/zoom; embedded previews (covers, host embeds) stay static.
// 4. Thumbnail drag selects nothing (text selection cleared), drag-sort/click/delete/wheel
//    still work; the editor still reports out-of-bounds pages.
// Depends on local Chrome (CDP 9345); a missing browser prints SKIP and exits 0.
// Usage: node tests/e2e/feedback-fixes.mjs

import { spawn } from "node:child_process";
import { writeFileSync, rmSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../../packages/server/index.js";
import { findBrowser } from "../../packages/renderer/headless/browser.js";
import { connectCdp } from "../../packages/renderer/headless/cdp.js";

// Browser dependency: missing Chrome = SKIP (exit 0).
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

// Temporary project: 8 pages; page 1 carries an element outside the canvas, so an
// editor that keeps the overflow hint must toast while a preview must not.
const PROJECT = mkdtempSync(join(tmpdir(), "pptd-feedback-"));
mkdirSync(join(PROJECT, "pages"), { recursive: true });
const PAGE_COUNT = 8;
writeFileSync(
  join(PROJECT, "deck.pptd"),
  `version: v2\ntitle: 反馈修复\nsize: [960, 540]\npages:\n${Array.from({ length: PAGE_COUNT }, (_, i) => `  - pages/${i + 1}.page`).join("\n")}\n`
);
const pageYaml = (n, withOverflow = false) => {
  const head =
    "pageType: content\nbackground: {type: solid, color: \"#ffffff\"}\nelements:\n" +
    `  - elementId: t${n}\n    elementType: text\n    bounds: [80, 60, 360, 48]\n` +
    `    content: {fontSize: 24, color: "#1f2937", align: [left, middle], text: '第${n}页'}\n`;
  return withOverflow
    ? head +
        "  - elementId: oob\n    elementType: text\n    bounds: [900, 500, 200, 80]\n" +
        "    content: {fontSize: 20, color: \"#111111\", align: [left, middle], text: '越界'}\n"
    : head;
};
const pageTexts = {};
for (let i = 1; i <= PAGE_COUNT; i++) {
  const text = pageYaml(i, i === 1);
  writeFileSync(join(PROJECT, "pages", `${i}.page`), text);
  pageTexts[`pages/${i}.page`] = text;
}
const DECK_TEXT = `version: v2\ntitle: 反馈修复\nsize: [960, 540]\npages:\n${Array.from(
  { length: PAGE_COUNT },
  (_, i) => `  - pages/${i + 1}.page`
).join("\n")}\n`;
const FILES = { "deck.pptd": DECK_TEXT, ...pageTexts };

const server = await startServer({ port: 0, projectRoot: PROJECT });
const PORT = server.address().port;
const HOME_URL = `http://127.0.0.1:${PORT}/editor/`;
const EDITOR_URL = `http://127.0.0.1:${PORT}/editor/?deck=project/deck.pptd`;
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-first-run", "--remote-debugging-port=9345", "about:blank"], {
  stdio: "ignore",
});
let cdp;
try {
  cdp = await connectCdp(9345, 15000);
} catch (err) {
  console.error(`SKIP  Chrome 未能启动（${err.message}）`);
  chrome.kill();
  server.close();
  process.exit(0);
}
const evalJs = (expr) => cdp.evalJs(expr);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(expr, timeout = 15000, label = expr) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      if (await evalJs(expr)) return true;
    } catch {
      /* navigating / not ready yet */
    }
    await sleep(120);
  }
  throw new Error(`等待超时: ${label}`);
}
await cdp.send("Runtime.enable");
await cdp.send("Page.enable");
// Toast recorder: the first render happens before this driver can poll, so count
// document-wide .toast nodes from document-start on every navigation.
await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
  source: `window.__fbToast = { count: 0, texts: [] };
setInterval(() => {
  const ts = Array.from(document.querySelectorAll('.toast')).map((t) => t.textContent);
  if (ts.length > window.__fbToast.count) window.__fbToast = { count: ts.length, texts: ts };
}, 100);`,
});

try {
  // --------------------------------------------------------------------------
  // 1) Gallery: static cover, no overflow toast, host wheel scrolls, click opens.
  // --------------------------------------------------------------------------
  await cdp.send("Page.navigate", { url: HOME_URL });
  await waitFor("!!window.__pptdEditor || !!document.querySelector('.gallery-card')", 20000, "Home 首屏");
  await waitFor(
    "document.querySelectorAll('.gallery-card-canvas .pptd-preview .canvas').length > 0 && document.querySelector('.gallery-card-canvas .pptd-preview .canvas')?.childElementCount > 0",
    20000,
    "画廊封面绘制"
  );
  await sleep(900); // let every in-view cover render the overflow page at least once
  // Sweep the grid: the examples include pages with out-of-canvas elements, so loading
  // every cover proves the gallery hint is actually silent (not merely unloaded).
  await evalJs(`(async () => {
    const step = Math.max(200, Math.floor(innerHeight * 0.8));
    for (let y = 0; y <= document.scrollingElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 220));
    }
    window.scrollTo(0, 0);
  })()`);
  await sleep(1200);

  let s = await evalJs(`(() => {
    const painted = Array.from(document.querySelectorAll('.gallery-card-canvas .pptd-preview .canvas')).filter((c) => c.childElementCount > 0);
    const overflowCard = Array.from(document.querySelectorAll('.gallery-card')).find((c) => (c.querySelector('.gallery-card-title')?.textContent || '').includes('山茗集'));
    return {
      cards: document.querySelectorAll('.gallery-card').length,
      covers: document.querySelectorAll('.gallery-card-canvas .pptd-preview[data-chrome="embedded"]').length,
      painted: painted.length,
      overflowPainted: !!overflowCard?.querySelector('.pptd-preview .canvas')?.childElementCount,
      brand: document.querySelector('.gallery-top .brand-home')?.textContent,
      toast: window.__fbToast,
      pageScrollable: document.scrollingElement.scrollHeight > innerHeight,
    };
  })()`);
  log(
    "画廊封面为 embedded 且无越界 toast",
    s.covers > 0 && s.overflowPainted && s.toast?.count === 0,
    JSON.stringify({ cards: s.cards, covers: s.covers, painted: s.painted, overflowPainted: s.overflowPainted, toast: s.toast })
  );
  log("画廊字标 OPEN PPTD", s.brand === "OPEN PPTD", JSON.stringify(s.brand));

  s = await evalJs(`(() => {
    const cover = document.querySelector('.gallery-card-canvas');
    const canvas = cover.querySelector('.canvas');
    const stage = cover.querySelector('.stage');
    if (!canvas || !stage) return { ok: false, reason: 'no stage/canvas' };
    const rect = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x * 10) / 10, y: Math.round(r.y * 10) / 10, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 }; };
    const before = rect(canvas);
    const r = stage.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const base = { bubbles: true, pointerId: 11, isPrimary: true, button: 0 };
    stage.dispatchEvent(new PointerEvent('pointerdown', { ...base, buttons: 1, clientX: x, clientY: y }));
    const panningDown = stage.classList.contains('panning');
    window.dispatchEvent(new PointerEvent('pointermove', { ...base, buttons: 1, clientX: x + 70, clientY: y + 40 }));
    const panningMove = stage.classList.contains('panning');
    const after = rect(canvas);
    window.dispatchEvent(new PointerEvent('pointerup', { ...base, buttons: 0, clientX: x + 70, clientY: y + 40 }));
    const wheelAccepted = stage.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 240 }));
    const afterWheel = rect(canvas);
    return { ok: true, before, after, afterWheel, panningDown, panningMove, wheelAccepted, cx: Math.round(x), cy: Math.round(y) };
  })()`);
  log(
    "拖封面不触发 pan/zoom（canvas rect 不变）",
    s.ok && !s.panningDown && !s.panningMove && JSON.stringify(s.before) === JSON.stringify(s.after) && JSON.stringify(s.before) === JSON.stringify(s.afterWheel),
    JSON.stringify({ before: s.before, after: s.after, panningDown: s.panningDown, panningMove: s.panningMove })
  );
  log("封面不吞滚轮（wheel 未被 preventDefault）", s.wheelAccepted === true, String(s.wheelAccepted));

  // Real wheel over the gallery: a static cover must not stop the host page scroll.
  await evalJs("window.scrollTo(0, 0)");
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: s.cx, y: s.cy, deltaX: 0, deltaY: 420 });
  await sleep(500);
  const scrollInfo = await evalJs(`({ y: window.scrollY, scrollable: document.scrollingElement.scrollHeight > innerHeight })`);
  log("滚轮滚动画廊（window.scrollY 变化）", scrollInfo.scrollable && scrollInfo.y > 0, JSON.stringify(scrollInfo));
  await evalJs("window.scrollTo(0, 0)");
  await sleep(250);

  // --------------------------------------------------------------------------
  // 2) createPreview: embedded static by default, full interactive, both silent.
  // --------------------------------------------------------------------------
  s = await evalJs(`(async () => {
    const { createPreview } = await import('./preview.js');
    const { memorySource } = await import('./app/project/source.js');
    const files = ${JSON.stringify(FILES)};
    const mk = (id, css) => { const el = document.createElement('div'); el.id = id; el.style.cssText = css; document.body.appendChild(el); return el; };
    const emb = mk('fb-emb', 'position:fixed;left:0;top:0;width:360px;height:220px;z-index:99;');
    const full = mk('fb-full', 'position:fixed;left:380px;top:0;width:420px;height:300px;z-index:99;');
    const pEmb = createPreview(emb, { source: memorySource({ files }), chrome: 'embedded' });
    const pFull = createPreview(full, { source: memorySource({ files }), chrome: 'full' });
    await Promise.all([pEmb.ready, pFull.ready]);
    await new Promise((r) => setTimeout(r, 700));
    const rect = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x * 10) / 10, y: Math.round(r.y * 10) / 10 }; };
    const eStage = emb.querySelector('.stage');
    const eCanvas = emb.querySelector('.canvas');
    const before = rect(eCanvas);
    const r = eStage.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const base = { bubbles: true, pointerId: 12, isPrimary: true, button: 0 };
    eStage.dispatchEvent(new PointerEvent('pointerdown', { ...base, buttons: 1, clientX: x, clientY: y }));
    const panning = eStage.classList.contains('panning');
    window.dispatchEvent(new PointerEvent('pointermove', { ...base, buttons: 1, clientX: x + 60, clientY: y + 30 }));
    const after = rect(eCanvas);
    window.dispatchEvent(new PointerEvent('pointerup', { ...base, buttons: 0, clientX: x + 60, clientY: y + 30 }));
    const embWheel = eStage.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -40, ctrlKey: true }));
    const embZoom = pEmb.view.getZoom();
    const fStage = full.querySelector('.stage');
    const fr = fStage.getBoundingClientRect();
    fStage.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true, cancelable: true, deltaY: -40, ctrlKey: true,
      clientX: fr.left + fr.width / 2, clientY: fr.top + fr.height / 2,
    }));
    const fullZoom = pFull.view.getZoom();
    const out = {
      embToasts: emb.querySelectorAll('.toast').length,
      fullToasts: full.querySelectorAll('.toast').length,
      embBrand: emb.querySelector('.brand-home') ? emb.querySelector('.brand-home').textContent : null,
      fullBrand: full.querySelector('.brand-home')?.textContent,
      embPanning: panning, rectStable: JSON.stringify(before) === JSON.stringify(after),
      embWheel, embZoom, fullZoom,
    };
    pEmb.destroy(); pFull.destroy();
    emb.remove(); full.remove();
    return out;
  })()`);
  log("embedded 预览默认静态：不 pan、不吞滚轮、不改缩放", !s.embPanning && s.rectStable && s.embWheel === true && Math.abs(s.embZoom - 1) < 1e-6, JSON.stringify(s));
  log("embedded/full 预览都不弹越界 toast", s.embToasts === 0 && s.fullToasts === 0, JSON.stringify({ emb: s.embToasts, full: s.fullToasts }));
  log("整页 preview 字标 OPEN PPTD", s.fullBrand === "OPEN PPTD", JSON.stringify(s.fullBrand));
  log("chrome:full 预览保留缩放交互", Math.abs(s.fullZoom - 1.1) < 1e-6, String(s.fullZoom));

  // Real click on a gallery card still enters the project.
  const cardPoint = await evalJs(`(() => {
    const card = document.querySelector('.gallery-card');
    card.scrollIntoView({ block: 'center' });
    const r = card.querySelector('.gallery-card-cover').getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(Math.min(r.top + r.height / 2, innerHeight - 20)) };
  })()`);
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: cardPoint.x, y: cardPoint.y });
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: cardPoint.x, y: cardPoint.y, button: "left", clickCount: 1 });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: cardPoint.x, y: cardPoint.y, button: "left", clickCount: 1 });
  await waitFor("location.search.includes('deck=') && typeof window.__pptdEditor === 'object'", 12000, "画廊点击进入编辑器");
  s = await evalJs(`({ search: location.search, brand: document.querySelector('.topbar .brand-home')?.textContent })`);
  log("单击画廊卡片进入项目", s.search.includes("deck="), JSON.stringify(s.search));
  log("编辑器字标 OPEN PPTD", s.brand === "OPEN PPTD", JSON.stringify(s.brand));

  // --------------------------------------------------------------------------
  // 3) Editor: overflow hint kept; thumbnail drag selects nothing.
  // --------------------------------------------------------------------------
  await cdp.send("Page.navigate", { url: EDITOR_URL });
  await waitFor(
    "typeof window.__pptdEditor === 'object' && window.__pptdEditor.state.deck.pages.length === 8 && document.querySelectorAll('.thumb').length === 8",
    20000,
    "编辑器 8 页"
  );
  await waitFor("document.querySelectorAll('[data-element-id]').length > 0", 10000, "画布元素");
  await sleep(600);
  s = await evalJs(`({ toast: window.__fbToast, brand: document.querySelector('.topbar .brand-home')?.textContent })`);
  log("编辑器越界提示仍出现", s.toast?.count >= 1 && s.toast.texts.some((t) => t.includes("超出画布")), JSON.stringify(s.toast));
  log("编辑器字标 OPEN PPTD", s.brand === "OPEN PPTD", JSON.stringify(s.brand));

  s = await evalJs(`(() => {
    const thumbs = Array.from(document.querySelectorAll('.thumb'));
    const imgs = Array.from(document.querySelectorAll('.thumb img'));
    const cs = getComputedStyle(thumbs[0]);
    const mini = getComputedStyle(thumbs[0].querySelector('.thumb-canvas'));
    return {
      n: thumbs.length, active: document.querySelector('.thumb.active')?.dataset?.pageIndex,
      allNotDraggable: thumbs.every((t) => t.draggable === false),
      imgs: imgs.length, allImgNotDraggable: imgs.every((i) => i.draggable === false),
      userSelect: cs.userSelect, miniUserSelect: mini.userSelect,
    };
  })()`);
  log("缩略图为不可拖拽/不可选中节点", s.n === 8 && s.allNotDraggable && s.allImgNotDraggable && s.userSelect === "none" && s.miniUserSelect === "none", JSON.stringify(s));

  s = await evalJs(`(async () => {
    const api = window.__pptdEditor;
    api.goToPage(0);
    await new Promise((r) => setTimeout(r, 120));
    const el = api.state.deck.pages[0].elements[0];
    api.select(el.elementId);
    const node = document.querySelector('[data-element-id="' + el.elementId + '"]');
    const b0 = node.getBoundingClientRect();
    // Thumbnail text is CSS-unselectable (user-select:none); an outside selection is
    // what the drag must clear (the reported repro selected the whole page).
    const sel = getSelection();
    const r1 = document.createRange();
    r1.selectNodeContents(document.querySelector('.thumb-canvas'));
    sel.removeAllRanges();
    sel.addRange(r1);
    const thumbText = sel.toString();
    const r2 = document.createRange();
    const probe = document.createElement('p');
    probe.textContent = '选区探针';
    probe.style.cssText = 'position:fixed;left:0;top:0;font-size:12px;';
    document.body.appendChild(probe);
    r2.selectNodeContents(probe);
    sel.removeAllRanges();
    sel.addRange(r2);
    const selBefore = sel.toString();
    const cards = Array.from(document.querySelectorAll('.thumb'));
    const from = cards[0].getBoundingClientRect();
    const to = cards[7].getBoundingClientRect();
    const base = { bubbles: true, pointerId: 21, isPrimary: true, button: 0 };
    cards[0].dispatchEvent(new PointerEvent('pointerdown', { ...base, buttons: 1, clientX: from.left + 8, clientY: from.top + 8 }));
    const selAfterDown = getSelection().toString();
    window.dispatchEvent(new PointerEvent('pointermove', { ...base, buttons: 1, clientX: to.right - 6, clientY: to.top + to.height / 2 }));
    await new Promise((r) => setTimeout(r, 80));
    window.dispatchEvent(new PointerEvent('pointerup', { ...base, buttons: 0, clientX: to.right - 6, clientY: to.top + to.height / 2 }));
    await new Promise((r) => setTimeout(r, 450));
    const selAfterUp = getSelection().toString();
    probe.remove();
    const node2 = document.querySelector('[data-element-id="' + el.elementId + '"]');
    const b1 = node2.getBoundingClientRect();
    return {
      thumbText, selBefore: selBefore.length, selAfterDown, selAfterUp,
      markers: api.state.deck.pages.map((p) => p.elements?.[0]?.content?.text),
      cur: api.state.currentPage, count: document.querySelector('#page-count')?.textContent,
      active: document.querySelector('.thumb.active')?.dataset?.pageIndex,
      selected: api.getSelection()?.length, ov: document.querySelectorAll('.sel-overlay').length,
      dx: Math.round(b1.left - b0.left), dy: Math.round(b1.top - b0.top),
    };
  })()`);
  const expectedOrder = ["第2页", "第3页", "第4页", "第5页", "第6页", "第7页", "第8页", "第1页"];
  log(
    "拖动缩略图清空文字选区",
    s.thumbText === "" && s.selBefore > 0 && s.selAfterDown === "" && s.selAfterUp === "",
    JSON.stringify({ thumbText: s.thumbText, before: s.selBefore, down: s.selAfterDown, up: s.selAfterUp })
  );
  log(
    "拖拽排序后页码/当前页正确",
    JSON.stringify(s.markers) === JSON.stringify(expectedOrder) && s.cur === 7 && s.count === "8 / 8" && s.active === "7",
    JSON.stringify({ markers: s.markers, cur: s.cur, count: s.count, active: s.active })
  );
  log("拖拽不影响主画布选择与元素位置", s.selected === 1 && s.ov === 1 && s.dx === 0 && s.dy === 0, JSON.stringify({ selected: s.selected, ov: s.ov, dx: s.dx, dy: s.dy }));

  // Real click a thumbnail after the drag: page switch must still fire (pointerdown is canceled).
  // Drag-sort auto-scrolled the active card into view, so bring the first card back on screen.
  const thumbPoint = await evalJs(`(async () => {
    const bar = document.querySelector('.page-thumbs');
    bar.scrollLeft = 0;
    await new Promise((r) => requestAnimationFrame(() => r()));
    const r = document.querySelectorAll('.thumb')[0].getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), visible: r.left >= 0 && r.right <= innerWidth };
  })()`);
  await sleep(250); // past the post-drag click suppression window
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: thumbPoint.x, y: thumbPoint.y });
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: thumbPoint.x, y: thumbPoint.y, button: "left", clickCount: 1 });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: thumbPoint.x, y: thumbPoint.y, button: "left", clickCount: 1 });
  await sleep(450);
  s = await evalJs(`({
    cur: window.__pptdEditor.state.currentPage,
    count: document.querySelector('#page-count')?.textContent,
    active: document.querySelector('.thumb.active')?.dataset?.pageIndex,
    sel: getSelection().toString(),
  })`);
  log("真实点击缩略图切页仍生效", thumbPoint.visible && s.cur === 0 && s.count === "1 / 8" && s.active === "0", JSON.stringify({ ...s, point: thumbPoint }));

  // Delete chip: a real hover+click (the pointerdown guard must leave buttons alone).
  const delPoint = await evalJs(`(() => {
    const thumb = document.querySelectorAll('.thumb')[1];
    const t = thumb.getBoundingClientRect();
    return { hx: Math.round(t.left + t.width / 2), hy: Math.round(t.top + t.height / 2) };
  })()`);
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: delPoint.hx, y: delPoint.hy });
  await sleep(200);
  const delRect = await evalJs(`(() => {
    const b = document.querySelectorAll('.thumb')[1].querySelector('.thumb-del').getBoundingClientRect();
    return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2), visible: getComputedStyle(document.querySelectorAll('.thumb')[1].querySelector('.thumb-del')).display !== 'none' };
  })()`);
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: delRect.x, y: delRect.y });
  await sleep(150);
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: delRect.x, y: delRect.y, button: "left", clickCount: 1 });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: delRect.x, y: delRect.y, button: "left", clickCount: 1 });
  await sleep(450);
  s = await evalJs(`({ n: window.__pptdEditor.state.deck.pages.length, thumbs: document.querySelectorAll('.thumb').length, count: document.querySelector('#page-count')?.textContent })`);
  log("× 删除按钮仍可用", delRect.visible && s.n === 7 && s.thumbs === 7, JSON.stringify({ visible: delRect.visible, ...s }));
  const restored = await evalJs(`(async () => {
    window.__pptdEditor.undo();
    await new Promise((r) => setTimeout(r, 300));
    return { n: window.__pptdEditor.state.deck.pages.length, thumbs: document.querySelectorAll('.thumb').length };
  })()`);
  log("删除可撤销（恢复 8 页）", restored.n === 8 && restored.thumbs === 8, JSON.stringify(restored));

  s = await evalJs(`(async () => {
    const bar = document.querySelector('.page-thumbs');
    bar.scrollLeft = 0;
    const o = { sw: bar.scrollWidth, cw: bar.clientWidth };
    bar.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 160 }));
    await new Promise((r) => setTimeout(r, 120));
    const sl = bar.scrollLeft;
    bar.scrollLeft = 0;
    return { ...o, sl };
  })()`);
  log("缩略条滚轮横向滚动仍生效", s.sw > s.cw && s.sl > 0, JSON.stringify(s));
} catch (err) {
  console.error("测试异常:", err);
  results.push({ name: "测试异常", pass: false });
} finally {
  // CDP close may hang if the page is mid-navigation; never block the report.
  try {
    cdp.close();
  } catch {
    /* ignore */
  }
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
