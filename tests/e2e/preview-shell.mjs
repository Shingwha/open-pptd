#!/usr/bin/env node
// tests/e2e/preview-shell.mjs — createPreview / createEditor / single shell E2E.
// Covers two createEditor instances mounted at once (isolated state/DOM/services), idempotent
// instance-scoped destroy(), createPreview embedded/full/headless, and single-shell navigation
// (/editor/ Home, card → Editor ?deck=, brand → Home, File → ?blank=1); chrome:"shot" is gone.
// Depends on local Chrome (CDP 9343); missing browser prints SKIP and exits 0.
// Usage: node tests/e2e/preview-shell.mjs

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

// Temporary project (used by the shell's ?deck= route) + page fixtures for the two in-page
// instances (memorySource, no disk IO).
const PROJECT = mkdtempSync(join(tmpdir(), "pptd-preview-shell-"));
mkdirSync(join(PROJECT, "pages"), { recursive: true });
writeFileSync(
  join(PROJECT, "deck.pptd"),
  "version: v2\ntitle: 双实例测试\nsize: [960, 540]\npages:\n  - pages/1.page\n  - pages/2.page\n"
);
const pageYaml = (n) =>
  "pageType: content\nbackground: {type: solid, color: \"#ffffff\"}\nelements:\n" +
  `  - elementId: t${n}\n    elementType: text\n    bounds: [80, 60, 360, 48]\n` +
  `    content: {fontSize: 24, color: "#1f2937", align: [left, middle], text: '第${n}页'}\n`;
writeFileSync(join(PROJECT, "pages", "1.page"), pageYaml(1));
writeFileSync(join(PROJECT, "pages", "2.page"), pageYaml(2));

const deckText = (title) => `version: v2\ntitle: ${title}\nsize: [640, 360]\npages:\n  - pages/a.page\n`;
const pageText = (marker) =>
  "pageType: content\nbackground: {type: solid, color: \"#ffffff\"}\nelements:\n" +
  `  - elementId: t1\n    elementType: text\n    bounds: [40, 40, 300, 40]\n` +
  `    content: {fontSize: 22, color: "#111111", align: [left, middle], text: '${marker}'}\n`;
const DEPTH_TEXT = deckText("A");
const PAGE_TEXT = pageText("实例A");
const DEPTH_TEXT_B = deckText("B");
const PAGE_TEXT_B = pageText("实例B");

const server = await startServer({ port: 0, projectRoot: PROJECT });
const PORT = server.address().port;
const HOME_URL = `http://127.0.0.1:${PORT}/editor/`;
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-first-run", "--remote-debugging-port=9343", HOME_URL], { stdio: "ignore" });
let cdp;
try {
  cdp = await connectCdp(9343, 15000);
} catch (err) {
  console.error(`SKIP  Chrome 未能启动（${err.message}）`);
  chrome.kill();
  server.close();
  process.exit(0);
}
const evalJs = (expr) => cdp.evalJs(expr);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await cdp.send("Runtime.enable");

try {
  await wait(3500);

  // 0) Single shell starts at Home; old second page is gone; root redirects.
  let s = await evalJs(`(() => ({
    home: !!document.querySelector('.gallery-view'),
    oldGalleryId: !!document.querySelector('#gallery-view'),
    cards: document.querySelectorAll('.gallery-card').length,
    editorHook: typeof window.__pptdEditor,
    ioHook: typeof window.__pptdIo,
    title: document.title,
  }))()`);
  log("无 ?deck= 时 /editor/ 为 Home", s.home && s.cards > 0 && s.editorHook === "undefined", JSON.stringify(s));
  log("旧独立画廊页已移除（#gallery-view / window.__pptdEditor）", !s.oldGalleryId && s.ioHook === "undefined");

  s = await evalJs(`(() => {
    const tabs = [...document.querySelectorAll('.gallery-tab')];
    const prompt = document.querySelector('#gallery-guide-prompt')?.textContent || '';
    return {
      kinds: tabs.map((b) => b.dataset.kind).join(','),
      active: document.querySelector('.gallery-tab.active')?.dataset.kind,
      cards: document.querySelectorAll('.gallery-card').length,
      allCount: Number(document.querySelector('.gallery-tab[data-kind="all"] .cnt')?.textContent),
      guide: document.querySelector('.gallery-guide summary')?.textContent,
      noDirectNew: !document.querySelector('#btn-new-blank'),
      promptValid: prompt.includes('Windows (PowerShell):') && prompt.includes('macOS/Linux:') &&
        prompt.includes('open-pptd assets skill install --dir') && !/[\u4e00-\u9fff]/.test(prompt) && !prompt.includes('open-pptd doctor'),
    };
  })()`);
  log(
    "主页默认全部、筛选及精简英文安装 Prompt",
    s.kinds === "all,ppt,poster" && s.active === "all" && s.cards === s.allCount && s.guide === "使用说明" && s.noDirectNew && s.promptValid,
    JSON.stringify(s)
  );

  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await wait(300);
  s = await evalJs(`(() => {
    const guide = document.querySelector('.gallery-guide');
    guide.querySelector('summary').click();
    const panel = guide.querySelector('.gallery-guide-panel').getBoundingClientRect();
    const actions = document.querySelector('.gallery-top-actions').getBoundingClientRect();
    const columns = getComputedStyle(document.querySelector('.gallery-grid')).gridTemplateColumns.split(' ').filter(Boolean).length;
    const snapshot = {
      columns,
      open: guide.open,
      panelInside: panel.left >= 0 && panel.right <= innerWidth && panel.top >= 0 && panel.bottom <= innerHeight,
      actionsInside: actions.left >= 0 && actions.right <= innerWidth,
      width: innerWidth,
    };
    guide.querySelector('summary').click();
    return snapshot;
  })()`);
  log("390px 移动端单列、导航及说明面板无越界", s.columns === 1 && s.open && s.panelInside && s.actionsInside && s.width === 390, JSON.stringify(s));
  await cdp.send("Emulation.clearDeviceMetricsOverride");
  await wait(300);

  s = await evalJs(`fetch('/').then((r) => r.text()).then((t) => ({
    redirect: /location\\.replace\\(\"\\.\\/editor\\/\"/.test(t),
    noGallerySkeleton: !/gallery-grid/.test(t),
  }))`);
  log("根 index.html 重定向到 ./editor/（保留 query/hash）", s.redirect && s.noGallerySkeleton, JSON.stringify(s));

  s = await evalJs(`(() => ({
    covers: document.querySelectorAll('.gallery-card-canvas .pptd-preview[data-chrome="embedded"]').length,
    painted: document.querySelectorAll('.gallery-card-canvas .pptd-preview .canvas > *').length,
  }))()`);
  log("画廊封面由 createPreview(embedded) 绘制", s.covers > 0 && s.painted > 0, JSON.stringify(s));

  // 1) Two createEditor instances side by side (memorySource, embedded chrome).
  s = await evalJs(`(async () => {
    const { createEditor } = await import('./editor.js');
    const { memorySource } = await import('./app/project/source.js');
    const mk = (id, left) => {
      const el = document.createElement('div');
      el.id = id;
      el.style.cssText = 'position:fixed;left:' + left + 'px;top:0;width:420px;height:300px;z-index:5;';
      document.body.appendChild(el);
      return el;
    };
    const A = mk('inst-a', 0);
    const B = mk('inst-b', 440);
    const deckA = { manifestText: ${JSON.stringify(DEPTH_TEXT)}, pageFiles: new Map([['pages/a.page', ${JSON.stringify(PAGE_TEXT)}]]) };
    const deckB = { manifestText: ${JSON.stringify(DEPTH_TEXT_B)}, pageFiles: new Map([['pages/a.page', ${JSON.stringify(PAGE_TEXT_B)}]]) };
    const a = createEditor(A, { source: memorySource({ files: {} }), deck: deckA, chrome: 'embedded' });
    const b = createEditor(B, { source: memorySource({ files: {} }), deck: deckB, chrome: 'embedded' });
    await Promise.all([a.ready, b.ready]);
    window.__instA = a; window.__instB = b;
    const idOf = (inst) => inst.state.deck.pages[0].elements[0].elementId;
    a.editor.select(idOf(a));
    const snapshot = {
      titles: [a.state.deck.title, b.state.deck.title],
      pages: [a.state.deck.pages.length, b.state.deck.pages.length],
      dom: [
        A.querySelectorAll('.thumb').length,
        B.querySelectorAll('.thumb').length,
        A.querySelectorAll('#canvas').length,
        B.querySelectorAll('#canvas').length,
      ],
      distinctCanvas: A.querySelector('#canvas') !== B.querySelector('#canvas'),
      painted: [A.querySelector('#canvas').childNodes.length > 0, B.querySelector('#canvas').childNodes.length > 0],
      selected: [a.editor.getSelected(), b.editor.getSelected()],
      overlays: [A.querySelectorAll('.sel-overlay').length, B.querySelectorAll('.sel-overlay').length],
      brandHidden: [getComputedStyle(A.querySelector('.brand-home')).display, getComputedStyle(B.querySelector('.brand-home')).display],
    };
    // model isolation: mutate A's text only
    a.state.deck.pages[0].elements[0].content.text = '改动A';
    return snapshot;
  })()`);
  log("双实例同时挂载（A/B 标题/页数独立）", s.titles[0] === "A" && s.titles[1] === "B" && s.pages[0] === 1 && s.pages[1] === 1, JSON.stringify(s.titles));
  log("DOM 作用域隔离（各自 1 缩略图 / 1 canvas，不是同一节点）", s.dom.join(",") === "1,1,1,1" && s.distinctCanvas, JSON.stringify(s.dom));
  log("两实例都完成绘制", s.painted[0] && s.painted[1], JSON.stringify(s.painted));
  log("选择状态互不污染（A 选中，B 无选择）", s.selected[0] === "t1" && s.selected[1] === null && s.overlays[0] === 1 && s.overlays[1] === 0, JSON.stringify(s.selected));
  log("chrome=embedded 裁掉品牌链接（两实例各自生效）", s.brandHidden[0] === "none" && s.brandHidden[1] === "none", JSON.stringify(s.brandHidden));

  s = await evalJs(`(() => {
    const a = window.__instA, b = window.__instB;
    return {
      aText: a.state.deck.pages[0].elements[0].content.text,
      bText: b.state.deck.pages[0].elements[0].content.text,
      sameDeck: a.state.deck === b.state.deck,
    };
  })()`);
  log("模型隔离（改 A 不动 B）", s.aText === "改动A" && s.bText === "实例B" && !s.sameDeck, JSON.stringify(s));

  // 2) destroy: idempotent + instance-scoped.
  s = await evalJs(`(() => {
    const A = document.querySelector('#inst-a');
    const B = document.querySelector('#inst-b');
    const a = window.__instA, b = window.__instB;
    a.destroy();
    a.destroy(); // idempotent: no throw, no double teardown
    const afterA = {
      aEmpty: A.innerHTML === "",
      bStillMounted: !!B.querySelector('#canvas'),
      bPainted: B.querySelector('#canvas').childNodes.length > 0,
      bPages: b.state.deck.pages.length,
    };
    // sibling keeps working: add an element through its api
    b.editor.addText();
    afterA.bElements = b.state.deck.pages[0].elements.length;
    afterA.bStillSelected = typeof b.editor.getSelected() === 'string' || b.editor.getSelected() === null;
    b.destroy();
    afterA.bEmpty = B.innerHTML === "";
    return afterA;
  })()`);
  log("destroy 幂等且清空自身 DOM", s.aEmpty && s.bEmpty, JSON.stringify(s));
  log("destroy A 不影响 B（B 继续绘制 / 编辑）", s.bStillMounted && s.bPainted && s.bPages === 1 && s.bElements === 2, JSON.stringify(s));

  // 3) createPreview: embedded / full / headless.
  s = await evalJs(`(async () => {
    const { createPreview } = await import('./preview.js');
    const { memorySource } = await import('./app/project/source.js');
    const files = { 'deck.pptd': ${JSON.stringify(DEPTH_TEXT)}, 'pages/a.page': ${JSON.stringify(PAGE_TEXT)} };
    const mk = (id, css) => {
      const el = document.createElement('div');
      el.id = id;
      el.style.cssText = css;
      document.body.appendChild(el);
      return el;
    };
    const emb = mk('pv-emb', 'position:fixed;left:0;top:320px;width:300px;height:200px;');
    const full = mk('pv-full', 'position:fixed;left:320px;top:320px;width:420px;height:320px;');
    const headless = mk('pv-head', 'position:fixed;left:760px;top:320px;');
    const pEmb = createPreview(emb, { source: memorySource({ files }), chrome: 'embedded' });
    const pFull = createPreview(full, { source: memorySource({ files }), chrome: 'full' });
    const pHead = createPreview(headless, { source: memorySource({ files }), chrome: 'embedded', headless: true });
    await Promise.all([pEmb.ready, pFull.ready, pHead.ready]);
    window.__pv = { pEmb, pFull, pHead };
    const zoomBefore = pEmb.view.getZoom();
    pEmb.zoomIn();
    const zoomAfter = pEmb.view.getZoom();
    pEmb.zoomReset();
    return {
      embChrome: emb.querySelector('.pptd-preview')?.dataset.chrome,
      embNoTopbar: !emb.querySelector('.topbar'),
      embNoThumbbar: !emb.querySelector('footer.thumbbar'),
      embPainted: emb.querySelector('#canvas').childNodes.length > 0,
      fullTopbar: !!full.querySelector('.topbar'),
      fullThumbbar: !!full.querySelector('footer.thumbbar'),
      fullCount: full.querySelector('#page-count')?.textContent,
      fullThumbs: full.querySelectorAll('.thumb').length,
      headW: headless.style.width,
      headH: headless.style.height,
      headNoSkeleton: !headless.querySelector('.stage'),
      headPainted: headless.childNodes.length > 0,
      zoomBefore, zoomAfter,
      api: ['goToPage','nextPage','prevPage','zoomIn','zoomOut','zoomReset','present','reload','destroy','ready'].filter((k) => k in pEmb).length,
    };
  })()`);
  log("preview embedded：仅画布表面（无顶栏/缩略条）并绘制", s.embChrome === "embedded" && s.embNoTopbar && s.embNoThumbbar && s.embPainted, JSON.stringify(s));
  log("preview full：查看器顶栏 + 缩略条 + 页码", s.fullTopbar && s.fullThumbbar && s.fullCount === "1 / 1" && s.fullThumbs === 1, JSON.stringify({ fullCount: s.fullCount, fullThumbs: s.fullThumbs }));
  log("preview headless：deck 尺寸绘制面（无骨架）", s.headW === "640px" && s.headH === "360px" && s.headNoSkeleton && s.headPainted, JSON.stringify({ headW: s.headW, headH: s.headH }));
  log("preview 缩放/复位动作可用", s.zoomBefore === 1 && Math.abs(s.zoomAfter - 1.25) < 1e-6, JSON.stringify({ before: s.zoomBefore, after: s.zoomAfter }));
  log("preview 返回契约齐全", s.api === 10, String(s.api));

  s = await evalJs(`(() => {
    const { pEmb, pFull, pHead } = window.__pv;
    pEmb.destroy(); pEmb.destroy();
    pFull.destroy(); pHead.destroy();
    return {
      embEmpty: document.querySelector('#pv-emb').innerHTML === "",
      fullEmpty: document.querySelector('#pv-full').innerHTML === "",
      headEmpty: document.querySelector('#pv-head').innerHTML === "",
    };
  })()`);
  log("preview destroy 幂等且清空各自容器", s.embEmpty && s.fullEmpty && s.headEmpty, JSON.stringify(s));

  // 4) Removed entries: chrome "shot" throws (headless goes through createPreview).
  s = await evalJs(`(async () => {
    const { createEditor } = await import('./editor.js');
    const { memorySource } = await import('./app/project/source.js');
    let shotError = "";
    try {
      createEditor(document.createElement('div'), { source: memorySource({ files: {} }), chrome: 'shot' });
    } catch (err) {
      shotError = err.message;
    }
    return { shotError };
  })()`);
  log("旧入口 chrome:\"shot\" 已删除（明确报错）", /chrome/.test(s.shotError) && /full/.test(s.shotError), JSON.stringify(s.shotError));

  // 5) Single shell navigation: Home → Editor (?deck=) → Home → blank editor.
  s = await evalJs(`(() => {
    const card = document.querySelector('.gallery-card');
    if (!card) return { clicked: false };
    card.click();
    return { clicked: true };
  })()`);
  await wait(4500);
  s = await evalJs(`(() => ({
    search: location.search,
    editor: typeof window.__pptdEditor,
    io: typeof window.__pptdIo,
    homeGone: !document.querySelector('.gallery-view'),
    thumbs: document.querySelectorAll('.thumb').length,
    painted: document.querySelectorAll('#canvas > *').length,
    pages: window.__pptdEditor?.state?.deck?.pages?.length,
  }))()`);
  log(
    "Home 卡片进入 Editor（同页路由 ?deck=）",
    s.search.includes("deck=") && s.editor === "object" && s.homeGone && s.thumbs > 0 && s.painted > 0,
    JSON.stringify({ search: s.search, thumbs: s.thumbs, pages: s.pages })
  );

  s = await evalJs(`(() => { document.querySelector('.brand-home').click(); return true; })()`);
  await wait(1200);
  s = await evalJs(`(() => ({
    search: location.search,
    home: !!document.querySelector('.gallery-view'),
    editor: typeof window.__pptdEditor,
    cards: document.querySelectorAll('.gallery-card').length,
  }))()`);
  log("品牌返回 Home（编辑器销毁、hook 移除）", s.home && s.cards > 0 && s.editor === "undefined" && !s.search.includes("deck="), JSON.stringify(s));

  s = await evalJs(`(async () => {
    document.querySelector('#btn-file').click();
    await new Promise((r) => setTimeout(r, 150));
    const item = [...document.querySelectorAll('.file-menu .file-menu-item')].find((b) => b.textContent.includes('新建空白演示'));
    if (!item) return { found: false, items: [...document.querySelectorAll('.file-menu .file-menu-item')].map((b) => b.textContent) };
    item.click();
    await new Promise((r) => setTimeout(r, 1800));
    return {
      found: true,
      search: location.search,
      pages: window.__pptdEditor?.state?.deck?.pages?.length,
      homeGone: !document.querySelector('.gallery-view'),
    };
  })()`);
  log("Home 文件菜单新建空白进入 Editor（?blank=1，1 页）", s.found && s.search.includes("blank=1") && s.pages === 1 && s.homeGone, JSON.stringify(s));

  // 6) Real browser navigation through the site root: / → /editor/ + ?deck=.
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/?deck=project/deck.pptd` });
  await wait(4500);
  s = await evalJs(`(() => ({
    path: location.pathname,
    search: location.search,
    editor: typeof window.__pptdEditor,
    pages: window.__pptdEditor?.state?.deck?.pages?.length,
  }))()`);
  log(
    "根 index.html 在浏览器中重定向到 /editor/（保留 ?deck=）",
    s.path === "/editor/" && s.search.includes("deck=") && s.editor === "object" && s.pages === 2,
    JSON.stringify(s)
  );
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
