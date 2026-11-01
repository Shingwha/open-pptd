#!/usr/bin/env node
// tests/e2e/editor-minimal.mjs — minimal editor E2E.
// Covers selection/drag transform/multi-select, text/table/chart content editors (open + commit),
// text color (token list + hex), add control (6 items in fixed order) + Delete, and the Design panel (apply
// theme, custom color token, appearance toggle); legacy entries are gone (#btn-fonts/#btn-theme/
// #inspector/#quickbar/#add-menu). Depends on local Chrome (CDP 9341); SKIP when missing.
// Usage: node tests/e2e/editor-minimal.mjs

import { spawn } from "node:child_process";
import { writeFileSync, rmSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../../packages/server/index.js";
import { findBrowser } from "../../packages/renderer/headless/browser.js";
import { connectCdp } from "../../packages/renderer/headless/cdp.js";

// Browser dependency: missing Chrome = SKIP (exit 0)
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

// Temporary project: 2 pages, each with one text element
const PROJECT = mkdtempSync(join(tmpdir(), "pptd-editor-minimal-"));
mkdirSync(join(PROJECT, "pages"), { recursive: true });
writeFileSync(
  join(PROJECT, "deck.pptd"),
  "version: v2\ntitle: 最小编辑器测试\nsize: [960, 540]\npages:\n  - pages/1.page\n  - pages/2.page\n"
);
const pageYaml = (n) =>
  "pageType: content\nbackground: {type: solid, color: \"#ffffff\"}\nelements:\n" +
  `  - elementId: t${n}\n    elementType: text\n    bounds: [80, 60, 360, 48]\n` +
  `    content: {fontSize: 24, color: "#1f2937", align: [left, middle], text: '第${n}页'}\n`;
writeFileSync(join(PROJECT, "pages", "1.page"), pageYaml(1));
writeFileSync(join(PROJECT, "pages", "2.page"), pageYaml(2));

// Boot: local server + headless Chrome + CDP
const server = await startServer({ port: 0, projectRoot: PROJECT });
const PORT = server.address().port;
const URL = `http://127.0.0.1:${PORT}/editor/?deck=project/deck.pptd`;
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-first-run", "--remote-debugging-port=9341", URL], { stdio: "ignore" });
let cdp;
try {
  cdp = await connectCdp(9341, 15000);
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

  // 0) Skeleton: removed entries really are gone
  let s = await evalJs(`(() => ({
    pages: window.__pptdEditor?.state?.deck?.pages?.length,
    thumbs: document.querySelectorAll('.thumb').length,
    fonts: !!document.querySelector('#btn-fonts'),
    theme: !!document.querySelector('#btn-theme'),
    inspector: !!document.querySelector('#inspector'),
    quickbar: !!document.querySelector('#quickbar'),
    addMenu: !!document.querySelector('#add-menu'),
    design: !!document.querySelector('#btn-design'),
    addList: !!document.querySelector('#add-list'),
    pageMenu: !!document.querySelector('#btn-page-menu'),
  }))()`);
  log("加载 2 页与缩略条", s.pages === 2 && s.thumbs === 2, JSON.stringify({ pages: s.pages, thumbs: s.thumbs }));
  log(
    "旧入口已删除（#btn-fonts/#btn-theme/#inspector/#quickbar/#add-menu）",
    !s.fonts && !s.theme && !s.inspector && !s.quickbar && !s.addMenu,
    JSON.stringify(s)
  );
  log("新入口存在（设计 / 添加菜单 / 页面菜单）", s.design && s.addList && s.pageMenu);

  // 1) Selection + drag (pointer events through the stage router)
  s = await evalJs(`(() => {
    const api = window.__pptdEditor;
    const el = api.state.deck.pages[0].elements[0];
    api.select(el.elementId);
    const node = document.querySelector('[data-element-id="' + el.elementId + '"]');
    const r = node.getBoundingClientRect();
    const before = el.bounds[0];
    const opts = { bubbles: true, pointerId: 1, isPrimary: true, buttons: 1, button: 0 };
    node.dispatchEvent(new PointerEvent('pointerdown', { ...opts, clientX: r.left + 12, clientY: r.top + 12 }));
    window.dispatchEvent(new PointerEvent('pointermove', { ...opts, clientX: r.left + 72, clientY: r.top + 52 }));
    window.dispatchEvent(new PointerEvent('pointerup', { ...opts, buttons: 0, clientX: r.left + 72, clientY: r.top + 52 }));
    return { before, after: el.bounds[0], selected: api.getSelected(), overlay: document.querySelectorAll('.sel-overlay').length };
  })()`);
  log("选中元素出现选择框", s.selected && s.overlay === 1, JSON.stringify({ selected: s.selected, overlay: s.overlay }));
  log("拖动后位置变化", s.after > s.before, JSON.stringify({ before: s.before, after: s.after }));

  // 2) Multi-select
  s = await evalJs(`(() => {
    const api = window.__pptdEditor;
    const els = api.state.deck.pages[0].elements;
    const id2 = api.addText();
    const all = api.state.deck.pages[0].elements.map((e) => e.elementId);
    api.select(all[0]);
    api.select(id2, 'add');
    return { count: api.getSelection().length, members: document.querySelectorAll('.sel-overlay .member').length };
  })()`);
  log("多选（Shift/add）", s.count === 2, JSON.stringify(s));

  // 3) Text content editor: content + color (hex input uses all theme tokens)
  s = await evalJs(`(async () => {
    const api = window.__pptdEditor;
    const el = api.state.deck.pages[0].elements[0];
    api.openTextEditor(el);
    await new Promise((r) => setTimeout(r, 500));
    const dlg = document.querySelector('.dialog');
    if (!dlg) return { dialog: 0 };
    const ta = dlg.querySelector('textarea');
    ta.value = '改后的文字';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    const hex = dlg.querySelector('.color-hex');
    hex.value = '#ff0000';
    hex.dispatchEvent(new Event('change', { bubbles: true }));
    const tokens = dlg.querySelectorAll('.color-pop-item').length;
    dlg.querySelector('.dialog-foot .btn-primary').click();
    return { dialog: 1, text: el.content.text, color: el.content.color, tokens, closed: document.querySelectorAll('.dialog').length };
  })()`);
  log("文字编辑器打开", s.dialog === 1 && s.closed === 0, JSON.stringify(s));
  log("文字内容保存到模型", s.text === "改后的文字", JSON.stringify({ text: s.text }));
  log("文字颜色保存到模型（token 列表可用）", s.color === "#ff0000" && s.tokens >= 10, JSON.stringify({ color: s.color, tokens: s.tokens }));

  // 4) Table content editor (created via the add control, edited, committed)
  s = await evalJs(`(async () => {
    const api = window.__pptdEditor;
    const id = api.addTable();
    await new Promise((r) => setTimeout(r, 500));
    const dlg = document.querySelector('.dialog');
    if (!dlg) return { dialog: 0 };
    const cell = dlg.querySelector('.table-editor .data-table td.grid-cell input');
    cell.value = '表格已编辑';
    cell.dispatchEvent(new Event('change', { bubbles: true }));
    const panel = dlg.querySelectorAll('.style-panel .color-field').length;
    dlg.querySelector('.dialog-head button').click();
    const el = api.state.deck.pages[api.state.currentPage].elements.find((e) => e.elementId === id);
    return { dialog: 1, text: el?.rows?.[0]?.[0]?.text, colorFields: panel, closed: document.querySelectorAll('.dialog').length };
  })()`);
  log("表格编辑器打开并提交单元格", s.dialog === 1 && s.text === "表格已编辑", JSON.stringify(s));
  log("表格编辑器仅保留字色/填充颜色（无样式面板）", s.colorFields === 2, JSON.stringify({ colorFields: s.colorFields }));

  // 5) Chart content editor (type switch commits; no style panel)
  s = await evalJs(`(async () => {
    const api = window.__pptdEditor;
    const id = api.addChart();
    await new Promise((r) => setTimeout(r, 500));
    const dlg = document.querySelector('.dialog');
    if (!dlg) return { dialog: 0 };
    const sel = dlg.querySelector('.chart-top select');
    sel.value = 'line';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    const series = dlg.querySelectorAll('.series-item').length;
    dlg.querySelector('.dialog-head button').click();
    const el = api.state.deck.pages[api.state.currentPage].elements.find((e) => e.elementId === id);
    return { dialog: 1, type: el?.series?.[0]?.type, series, closed: document.querySelectorAll('.dialog').length };
  })()`);
  log("图表编辑器打开并切换类型", s.dialog === 1 && s.type === "line" && s.series === 1, JSON.stringify(s));

  // 6) Add control: exactly six items in fixed order; delete key removes the selection
  s = await evalJs(`(() => {
    const api = window.__pptdEditor;
    document.querySelector('#btn-add').click();
    const items = [...document.querySelectorAll('#add-list .add-item')].map((b) => b.dataset.addType);
    const before = api.state.deck.pages[api.state.currentPage].elements.length;
    document.querySelector('#add-list .add-item[data-add-type="text"]').click();
    const afterAdd = api.state.deck.pages[api.state.currentPage].elements.length;
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    const afterDelete = api.state.deck.pages[api.state.currentPage].elements.length;
    return { items, deltaAdd: afterAdd - before, deltaDelete: afterAdd - afterDelete };
  })()`);
  log(
    "添加菜单六类且顺序固定",
    JSON.stringify(s.items) === JSON.stringify(["text", "table", "chart", "shape", "line", "image"]),
    JSON.stringify(s.items)
  );
  log("添加 + 删除元素", s.deltaAdd === 1 && s.deltaDelete === 1, JSON.stringify(s));

  // 7) Design panel: apply theme, custom color token, appearance
  s = await evalJs(`(async () => {
    document.querySelector('#btn-design').click();
    await new Promise((r) => setTimeout(r, 1000));
    const cards = document.querySelectorAll('.design-theme-card').length;
    const tokens = document.querySelectorAll('.design-token').length;
    const before = window.__pptdEditor.state.deck.theme.colors.primary;
    document.querySelectorAll('.design-theme-card')[2].querySelector('.design-theme-name').click();
    const after = window.__pptdEditor.state.deck.theme.colors.primary;
    return { cards, tokens, before, after, changed: before !== after };
  })()`);
  log("Design 面板主题库与颜色令牌可见", s.cards >= 10 && s.tokens >= 16, JSON.stringify({ cards: s.cards, tokens: s.tokens }));
  log("应用主题写入 deck.theme", s.changed === true, JSON.stringify({ before: s.before, after: s.after }));

  s = await evalJs(`(async () => {
    const btns = [...document.querySelectorAll('.design-body .btn')];
    btns.find((b) => b.textContent.includes('添加颜色')).click();
    await new Promise((r) => setTimeout(r, 200));
    const dlg = document.querySelector('.dialog');
    const inputs = dlg.querySelectorAll('input');
    inputs[0].value = 'gold';
    inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
    inputs[1].value = '#ffcc00';
    inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
    dlg.querySelector('.dialog-foot .btn-primary').click();
    return {
      color: window.__pptdEditor.state.deck.theme.colors.gold,
      rows: document.querySelectorAll('.design-token').length,
    };
  })()`);
  log("自定义颜色 token 添加", s.color === "#ffcc00" && s.rows >= 17, JSON.stringify(s));

  s = await evalJs(`(async () => {
    window.__pptdEditor.undo();
    const restored = window.__pptdEditor.state.deck.theme.colors.gold;
    const before = window.__pptdEditor.state.deck.theme.colors.primary;
    window.__pptdEditor.undo();
    return { restored, primaryUndone: before !== window.__pptdEditor.state.deck.theme.colors.primary };
  })()`);
  log("Design 改动可撤销", s.restored === undefined && s.primaryUndone === true, JSON.stringify(s));

  s = await evalJs(`(() => {
    [...document.querySelectorAll('.design-tab')].find((b) => b.dataset.tab === 'fonts').click();
    const fonts = { list: document.querySelectorAll('.design-font').length, importRow: document.querySelectorAll('.design-font-import').length };
    [...document.querySelectorAll('.design-tab')].find((b) => b.dataset.tab === 'appearance').click();
    const modes = document.querySelectorAll('.design-mode-btn').length;
    [...document.querySelectorAll('.design-mode-btn')].find((b) => b.textContent === '深色').click();
    const dark = document.documentElement.getAttribute('data-pptd-theme');
    [...document.querySelectorAll('.design-mode-btn')].find((b) => b.textContent === '浅色').click();
    const light = document.documentElement.getAttribute('data-pptd-theme');
    document.querySelector('.design-head .btn').click();
    return { fonts: fonts.list, importRow: fonts.importRow, modes, dark, light, closed: document.querySelector('#design-panel').hidden };
  })()`);
  log("字体库与外观切换", s.fonts > 0 && s.importRow === 1 && s.modes === 3 && s.dark === "dark" && s.light === "light", JSON.stringify(s));
  log("Design 面板关闭", s.closed === true);

  // 8) Static-hosting degradation: no /api → built-in themes/fonts only
  s = await evalJs(`(async () => {
    const original = window.fetch;
    window.fetch = (url, opts) => String(url).includes('/api/') ? Promise.reject(new Error('offline')) : original(url, opts);
    document.querySelector('#btn-design').click();
    await new Promise((r) => setTimeout(r, 1200));
    const cards = document.querySelectorAll('.design-theme-card').length;
    const btnTexts = [...document.querySelectorAll('.design-body .btn')].map((b) => b.textContent);
    const hintText = [...document.querySelectorAll('.design-body .prop-hint')].map((h) => h.textContent).join(' | ');
    [...document.querySelectorAll('.design-tab')].find((b) => b.dataset.tab === 'fonts').click();
    const fontCount = document.querySelectorAll('.design-font').length;
    const importRows = document.querySelectorAll('.design-font-import').length;
    document.querySelector('.design-head .btn').click();
    window.fetch = original;
    return { cards, saveDisabled: btnTexts.some((t) => t.includes('保存当前为主题')), hintText, fontCount, importRows };
  })()`);
  log(
    "无 /api 时仅内置主题/字体并提示",
    s.cards === 11 && s.fontCount > 0 && s.importRows === 0 && /静态站/.test(s.hintText),
    JSON.stringify({ cards: s.cards, fontCount: s.fontCount, importRows: s.importRows })
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
