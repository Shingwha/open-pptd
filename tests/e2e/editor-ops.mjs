#!/usr/bin/env node
// ============================================================================
// editor-ops.mjs — editor element operations E2E (3.1 W1)
// ----------------------------------------------------------------------------
// Covers the element operations restored in 3.1 (interfaces.md §1–§3):
//   · multi-select + the visible selection action bar (copy / duplicate / delete)
//   · Ctrl+C / Ctrl+V: new ids, +16px offset, pasted selection, undo
//   · action bar copy / duplicate behave like the keyboard shortcuts
//   · cut → cross-page paste → undo twice restores both pages
//   · consecutive pastes cascade +16 / +32
//   · Ctrl+Shift+V pastes in place (offset 0)
//   · input / contenteditable focus keeps native clipboard behaviour
//   · delete button removes the selection, undo restores it
//   · two instances: A's clipboard never leaks into B (and vice versa)
// Depends on a local Chrome (CDP); SMOKE_CHROME can point at its path. A missing
// browser prints SKIP and exits 0 (the gate is optional off a desktop machine).
// Usage: node tests/e2e/editor-ops.mjs
// ============================================================================

import { spawn } from "node:child_process";
import { writeFileSync, rmSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../../packages/server/index.js";
import { findBrowser } from "../../packages/renderer/headless/browser.js";
import { connectCdp } from "../../packages/renderer/headless/cdp.js";

// ---------------------------------------------------------------------------
// Browser dependency: missing Chrome = SKIP (exit 0)
// ---------------------------------------------------------------------------
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
// Temporary project: page 1 with two text elements, page 2 with one
// ---------------------------------------------------------------------------
const PROJECT = mkdtempSync(join(tmpdir(), "pptd-editor-ops-"));
mkdirSync(join(PROJECT, "pages"), { recursive: true });
writeFileSync(
  join(PROJECT, "deck.pptd"),
  "version: v2\ntitle: 元素操作测试\nsize: [960, 540]\npages:\n  - pages/1.page\n  - pages/2.page\n"
);
const textYaml = (id, y, text) =>
  `  - elementId: ${id}\n    elementType: text\n    bounds: [80, ${y}, 360, 48]\n` +
  `    content: {fontSize: 24, color: "#1f2937", align: [left, middle], text: '${text}'}\n`;
writeFileSync(
  join(PROJECT, "pages", "1.page"),
  "pageType: content\nbackground: {type: solid, color: \"#ffffff\"}\nelements:\n" +
    textYaml("t1", 60, "第一页 A") +
    textYaml("t2", 180, "第一页 B")
);
writeFileSync(
  join(PROJECT, "pages", "2.page"),
  "pageType: content\nbackground: {type: solid, color: \"#ffffff\"}\nelements:\n" + textYaml("t3", 60, "第二页")
);

// ---------------------------------------------------------------------------
// Boot: local server + headless Chrome + CDP (port 9344, run serially)
// ---------------------------------------------------------------------------
const server = await startServer({ port: 0, projectRoot: PROJECT });
const PORT = server.address().port;
const URL = `http://127.0.0.1:${PORT}/editor/?deck=project/deck.pptd`;
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-first-run", "--remote-debugging-port=9344", URL], { stdio: "ignore" });
let cdp;
try {
  cdp = await connectCdp(9344, 15000);
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
  // Page-level shortcut helper: dispatch a Ctrl/Cmd keydown on document (or a given node)
  await evalJs(
    `window.__opsKey = (key, opts = {}, target = document) => target.dispatchEvent(` +
      `new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true, cancelable: true, ...opts })); true`
  );

  // -------------------------------------------------------------------------
  // 1) Multi-select → action bar visible (3 buttons) + positioning
  // -------------------------------------------------------------------------
  let s = await evalJs(`(() => {
    const api = window.__pptdEditor;
    const page = api.state.deck.pages[0];
    api.selectMany(page.elements.map((el) => el.elementId));
    const canUndoBeforeCopy = api.state.history.canUndo();
    api.copySelected();
    const canUndoAfterCopy = api.state.history.canUndo();
    const bar = document.querySelector('#sel-actions');
    const stage = document.querySelector('#stage').getBoundingClientRect();
    const box = document.querySelector('.sel-overlay .sel-box');
    const br = bar.getBoundingClientRect();
    const xb = box.getBoundingClientRect();
    return {
      pages: api.state.deck.pages.length,
      elements: page.elements.length,
      selected: api.getSelection().length,
      hidden: bar.hidden,
      buttons: bar.querySelectorAll('.sel-action').length,
      actions: [...bar.querySelectorAll('.sel-action')].map((b) => b.dataset.action),
      above: br.bottom <= xb.top + 1,
      insideStage: br.top >= stage.top - 1 && br.bottom <= stage.bottom + 1,
      canUndoBeforeCopy,
      canUndoAfterCopy,
    };
  })()`);
  log("加载 2 页（第 1 页 2 个元素）", s.pages === 2 && s.elements === 2, JSON.stringify({ pages: s.pages, elements: s.elements }));
  log(
    "多选 2 个元素时操作条可见（复制/重复/删除）",
    s.selected === 2 && !s.hidden && s.buttons === 3 && s.actions.join(",") === "copy,duplicate,delete",
    JSON.stringify({ selected: s.selected, hidden: s.hidden, actions: s.actions })
  );
  log("操作条定位在选区上方且在舞台内", s.above && s.insideStage, JSON.stringify({ above: s.above, insideStage: s.insideStage }));
  log(
    "复制不产生 undo 步",
    s.canUndoBeforeCopy === false && s.canUndoAfterCopy === false,
    JSON.stringify({ canUndoBeforeCopy: s.canUndoBeforeCopy, canUndoAfterCopy: s.canUndoAfterCopy })
  );

  s = await evalJs(`(() => {
    const api = window.__pptdEditor;
    const bar = document.querySelector('#sel-actions');
    const before = bar.getBoundingClientRect().top;
    const el = api.state.deck.pages[0].elements[0];
    const node = document.querySelector('[data-element-id="' + el.elementId + '"]');
    const r = node.getBoundingClientRect();
    const opts = { bubbles: true, pointerId: 1, isPrimary: true, buttons: 1, button: 0 };
    node.dispatchEvent(new PointerEvent('pointerdown', { ...opts, clientX: r.left + 10, clientY: r.top + 10 }));
    window.dispatchEvent(new PointerEvent('pointermove', { ...opts, clientX: r.left + 10, clientY: r.top + 70 }));
    window.dispatchEvent(new PointerEvent('pointerup', { ...opts, buttons: 0, clientX: r.left + 10, clientY: r.top + 70 }));
    const after = bar.getBoundingClientRect().top;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return { before, after, hidden: bar.hidden, selection: api.getSelection().length };
  })()`);
  log(
    "拖动后操作条跟随，取消选择后隐藏",
    s.after > s.before && s.hidden === true && s.selection === 0,
    JSON.stringify(s)
  );

  // -------------------------------------------------------------------------
  // 2) Ctrl+C → Ctrl+V: +2 elements, unique new ids, +16px, pasted selected, undo
  // -------------------------------------------------------------------------
  s = await evalJs(`(() => {
    const api = window.__pptdEditor;
    const page = api.state.deck.pages[0];
    const originals = page.elements.filter((el) => el.elementId === 't1' || el.elementId === 't2');
    const before = page.elements.length;
    const dirtyBefore = api.state.dirty;
    api.selectMany(['t1', 't2']);
    window.__opsKey('c');
    const dirtyAfterCopy = api.state.dirty;
    const clip = api.getClipboardCount();
    window.__opsKey('v');
    const after = page.elements.length;
    const ids = api.getSelection();
    const pasted = ids.map((id) => page.elements.find((el) => el.elementId === id));
    const offsets = pasted.map((el, i) => [el.bounds[0] - originals[i].bounds[0], el.bounds[1] - originals[i].bounds[1]]);
    return {
      before,
      after,
      clip,
      dirtySame: dirtyBefore === dirtyAfterCopy,
      selected: ids.length,
      newIds: ids.every((id) => id !== 't1' && id !== 't2'),
      uniqueIds: new Set(page.elements.map((el) => el.elementId)).size === page.elements.length,
      offsets,
    };
  })()`);
  log(
    "Ctrl+C/Ctrl+V：页元素 +2、新 id 唯一、偏移 +16、选中粘贴项",
    s.after === s.before + 2 && s.clip === 2 && s.selected === 2 && s.newIds && s.uniqueIds &&
      s.offsets.every((o) => o[0] === 16 && o[1] === 16),
    JSON.stringify(s)
  );
  log("复制不改变 dirty（不 snapshot）", s.dirtySame === true, JSON.stringify({ dirtySame: s.dirtySame }));

  s = await evalJs(`(() => {
    const api = window.__pptdEditor;
    api.undo();
    return { elements: api.state.deck.pages[0].elements.length, selection: api.getSelection().length };
  })()`);
  log("粘贴可撤销（元素数恢复、选择清空）", s.elements === 2 && s.selection === 0, JSON.stringify(s));

  // -------------------------------------------------------------------------
  // 3) Action bar copy + duplicate behave like the keyboard shortcuts
  // -------------------------------------------------------------------------
  s = await evalJs(`(() => {
    const api = window.__pptdEditor;
    const page = () => api.state.deck.pages[0];
    api.select('t1');
    const beforeEl = page().elements.find((el) => el.elementId === 't1');
    const before = page().elements.length;
    const bar = () => document.querySelector('#sel-actions');
    bar().querySelector('[data-action="copy"]').click();
    const clip = api.getClipboardCount();
    bar().querySelector('[data-action="duplicate"]').click();
    const after = page().elements.length;
    const ids = api.getSelection();
    const dup = page().elements.find((el) => el.elementId === ids[0]);
    return {
      before,
      after,
      clip,
      clipAfterDuplicate: api.getClipboardCount(),
      selected: ids.length,
      offset: [dup.bounds[0] - beforeEl.bounds[0], dup.bounds[1] - beforeEl.bounds[1]],
      duplicateIsNew: ids[0] !== 't1',
    };
  })()`);
  log(
    "操作条复制 + 重复：复制入剪贴板、重复 +1 且偏移 +16",
    s.after === s.before + 1 && s.clip === 1 && s.selected === 1 && s.duplicateIsNew &&
      s.offset[0] === 16 && s.offset[1] === 16,
    JSON.stringify(s)
  );
  log("重复不覆盖用户剪贴板", s.clipAfterDuplicate === 1, JSON.stringify({ clipAfterDuplicate: s.clipAfterDuplicate }));

  // -------------------------------------------------------------------------
  // 4) Cut → paste on page 2 → undo twice restores both pages
  // -------------------------------------------------------------------------
  s = await evalJs(`(() => {
    const api = window.__pptdEditor;
    const page1 = api.state.deck.pages[0];
    const before1 = page1.elements.length;
    const t2 = page1.elements.find((el) => el.elementId === 't2');
    const t2Bounds = t2.bounds.slice();
    const page2Before = api.state.deck.pages[1].elements.length;
    api.select('t2');
    window.__opsKey('x');
    const afterCut = api.state.deck.pages[0].elements.length;
    const clip = api.getClipboardCount();
    api.goToPage(1);
    window.__opsKey('v');
    const page2 = api.state.deck.pages[1];
    const ids = api.getSelection();
    const pasted = page2.elements.find((el) => el.elementId === ids[0]);
    return {
      before1,
      afterCut,
      clip,
      page2Before,
      page2After: page2.elements.length,
      pasted: !!pasted,
      offset: pasted ? [pasted.bounds[0] - t2Bounds[0], pasted.bounds[1] - t2Bounds[1]] : null,
      newId: ids[0] !== 't2',
    };
  })()`);
  log(
    "剪切减少元素并写入剪贴板",
    s.afterCut === s.before1 - 1 && s.clip === 1,
    JSON.stringify({ before: s.before1, afterCut: s.afterCut, clip: s.clip })
  );
  log(
    "切到第 2 页粘贴出现（+16，新 id）",
    s.page2After === s.page2Before + 1 && s.pasted && s.newId && s.offset[0] === 16 && s.offset[1] === 16,
    JSON.stringify({ page2Before: s.page2Before, page2After: s.page2After, offset: s.offset, newId: s.newId })
  );

  s = await evalJs(`(() => {
    const api = window.__pptdEditor;
    api.undo();
    const page2AfterUndo = api.state.deck.pages[1].elements.length;
    api.undo();
    const page1 = api.state.deck.pages[0];
    return {
      page2AfterUndo,
      page1AfterUndo: page1.elements.length,
      restoredT2: page1.elements.some((el) => el.elementId === 't2'),
      currentPage: api.state.currentPage,
    };
  })()`);
  log(
    "剪切+跨页粘贴 undo 两次完整恢复",
    s.page2AfterUndo === 1 && s.page1AfterUndo === 3 && s.restoredT2,
    JSON.stringify(s)
  );

  // -------------------------------------------------------------------------
  // 5) Consecutive pastes cascade +16 / +32
  // -------------------------------------------------------------------------
  s = await evalJs(`(() => {
    const api = window.__pptdEditor;
    const page = () => api.state.deck.pages[1];
    const t3 = page().elements.find((el) => el.elementId === 't3');
    const base = t3.bounds.slice();
    api.select('t3');
    window.__opsKey('c');
    window.__opsKey('v');
    const firstIds = api.getSelection();
    const first = page().elements.find((el) => el.elementId === firstIds[0]).bounds.slice();
    window.__opsKey('v');
    const secondIds = api.getSelection();
    const second = page().elements.find((el) => el.elementId === secondIds[0]).bounds.slice();
    return {
      first: [first[0] - base[0], first[1] - base[1]],
      second: [second[0] - base[0], second[1] - base[1]],
      idsUnique: new Set(page().elements.map((el) => el.elementId)).size === page().elements.length,
      bothKept: firstIds[0] !== secondIds[0],
    };
  })()`);
  log(
    "连续粘贴两次偏移级联 +16 / +32",
    s.first[0] === 16 && s.first[1] === 16 && s.second[0] === 32 && s.second[1] === 32 && s.idsUnique && s.bothKept,
    JSON.stringify(s)
  );

  // -------------------------------------------------------------------------
  // 6) Ctrl+Shift+V pastes in place (offset 0), cascade untouched
  // -------------------------------------------------------------------------
  s = await evalJs(`(() => {
    const api = window.__pptdEditor;
    const page = () => api.state.deck.pages[1];
    const t3 = page().elements.find((el) => el.elementId === 't3');
    const base = t3.bounds.slice();
    api.select('t3');
    window.__opsKey('c');
    window.__opsKey('v', { shiftKey: true });
    const inPlaceIds = api.getSelection();
    const inPlace = page().elements.find((el) => el.elementId === inPlaceIds[0]).bounds.slice();
    window.__opsKey('v');
    const afterIds = api.getSelection();
    const after = page().elements.find((el) => el.elementId === afterIds[0]).bounds.slice();
    return {
      inPlace: [inPlace[0] - base[0], inPlace[1] - base[1]],
      normalAfter: [after[0] - base[0], after[1] - base[1]],
      newIds: inPlaceIds[0] !== 't3' && afterIds[0] !== 't3',
    };
  })()`);
  log(
    "Ctrl+Shift+V 原位粘贴（偏移 0，不影响级联）",
    s.inPlace[0] === 0 && s.inPlace[1] === 0 && s.normalAfter[0] === 16 && s.normalAfter[1] === 16 && s.newIds,
    JSON.stringify(s)
  );

  // -------------------------------------------------------------------------
  // 7) Input / contenteditable focus: native clipboard, no editor action
  // -------------------------------------------------------------------------
  s = await evalJs(`(() => {
    const api = window.__pptdEditor;
    const page = () => api.state.deck.pages[api.state.currentPage];
    const before = page().elements.length;
    const clipBefore = api.getClipboardCount();
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    window.__opsKey('c', {}, input);
    window.__opsKey('v', {}, input);
    const div = document.createElement('div');
    div.contentEditable = 'true';
    document.body.appendChild(div);
    div.focus();
    window.__opsKey('v', {}, div);
    const after = page().elements.length;
    input.remove();
    div.remove();
    return {
      before,
      after,
      clipBefore,
      clipAfter: api.getClipboardCount(),
      focused: document.activeElement === document.body,
    };
  })()`);
  log(
    "输入框 / contenteditable 聚焦时不触发编辑器复制粘贴",
    s.after === s.before && s.clipAfter === s.clipBefore,
    JSON.stringify({ before: s.before, after: s.after, clipBefore: s.clipBefore, clipAfter: s.clipAfter })
  );

  // -------------------------------------------------------------------------
  // 8) Delete button removes the selection, undo restores it
  // -------------------------------------------------------------------------
  s = await evalJs(`(() => {
    const api = window.__pptdEditor;
    const page = () => api.state.deck.pages[1];
    api.select('t3');
    const before = page().elements.length;
    const bar = document.querySelector('#sel-actions');
    bar.querySelector('[data-action="delete"]').click();
    const after = page().elements.length;
    api.undo();
    return {
      before,
      after,
      restored: page().elements.length,
      t3: page().elements.some((el) => el.elementId === 't3'),
    };
  })()`);
  log(
    "删除按钮减少元素，undo 恢复",
    s.after === s.before - 1 && s.restored === s.before && s.t3,
    JSON.stringify(s)
  );

  // -------------------------------------------------------------------------
  // 9) Two instances: A's clipboard never leaks into B (and vice versa)
  // -------------------------------------------------------------------------
  s = await evalJs(`(async () => {
    const { createEditor } = await import('./editor.js');
    const { memorySource } = await import('./app/project/source.js');
    const host = document.createElement('div');
    host.id = 'ops-inst-b';
    host.style.cssText = 'position:fixed;left:0;top:0;width:420px;height:300px;z-index:5;';
    document.body.appendChild(host);
    const deckText = 'version: v2\\ntitle: B\\nsize: [640, 360]\\npages:\\n  - pages/a.page\\n';
    const pageText = 'pageType: content\\nbackground: {type: solid, color: "#ffffff"}\\nelements:\\n' +
      '  - elementId: b1\\n    elementType: text\\n    bounds: [40, 40, 300, 40]\\n' +
      '    content: {fontSize: 22, color: "#111111", align: [left, middle], text: "实例B"}\\n';
    const b = createEditor(host, {
      source: memorySource({ files: {} }),
      deck: { manifestText: deckText, pageFiles: new Map([['pages/a.page', pageText]]) },
      chrome: 'embedded',
    });
    await b.ready;
    const apiA = window.__pptdEditor;
    apiA.select('t3');
    apiA.copySelected();
    const aClip = apiA.getClipboardCount();
    const bBefore = b.state.deck.pages[0].elements.length;
    const bPaste = b.editor.pasteClipboard();
    const bAfterPaste = b.state.deck.pages[0].elements.length;
    const bHasClipboard = b.editor.hasClipboard();
    // B copies its own element; A's clipboard must stay untouched
    b.editor.select('b1');
    b.editor.copySelected();
    const bClip = b.editor.getClipboardCount();
    const aClipAfterBCopy = apiA.getClipboardCount();
    const aCountBefore = apiA.state.deck.pages[1].elements.length;
    const aPasted = apiA.pasteClipboard();
    const aCountAfter = apiA.state.deck.pages[1].elements.length;
    const bCountFinal = b.state.deck.pages[0].elements.length;
    b.destroy();
    b.destroy();
    const bEmpty = host.innerHTML === '';
    host.remove();
    return {
      aClip,
      bHasClipboard,
      bPaste: bPaste.length,
      bBefore,
      bAfterPaste,
      bClip,
      aClipAfterBCopy,
      aPasted: aPasted.length,
      aDelta: aCountAfter - aCountBefore,
      bCountFinal,
      bEmpty,
      aStillWorks: typeof apiA.getSelected() === 'string' || apiA.getSelected() === null,
    };
  })()`);
  log(
    "双实例剪贴板隔离（A 复制不影响 B）",
    s.aClip === 1 && s.bHasClipboard === false && s.bPaste === 0 && s.bAfterPaste === s.bBefore,
    JSON.stringify({ aClip: s.aClip, bHasClipboard: s.bHasClipboard, bPaste: s.bPaste, bBefore: s.bBefore, bAfterPaste: s.bAfterPaste })
  );
  log(
    "B 复制不影响 A，双方页面互不写入",
    s.bClip === 1 && s.aClipAfterBCopy === 1 && s.aPasted === 1 && s.aDelta === 1 && s.bCountFinal === s.bBefore,
    JSON.stringify({ bClip: s.bClip, aClipAfterBCopy: s.aClipAfterBCopy, aPasted: s.aPasted, aDelta: s.aDelta, bCountFinal: s.bCountFinal })
  );
  log("第二实例 destroy 清空自身 DOM，A 仍可用", s.bEmpty === true && s.aStillWorks === true, JSON.stringify({ bEmpty: s.bEmpty, aStillWorks: s.aStillWorks }));

  // -------------------------------------------------------------------------
  // 10) Loading a project clears the clipboard (no cross-project paste)
  // -------------------------------------------------------------------------
  s = await evalJs(`(async () => {
    const api = window.__pptdEditor;
    const page = api.state.deck.pages[api.state.currentPage];
    api.select(page.elements[0].elementId);
    api.copySelected();
    const before = api.getClipboardCount();
    await window.__pptdIo.loadDeck('/project/deck.pptd');
    return {
      before,
      after: api.getClipboardCount(),
      hasClipboard: api.hasClipboard(),
      pages: api.state.deck.pages.length,
    };
  })()`);
  log(
    "载入项目清空剪贴板",
    s.before === 1 && s.after === 0 && s.hasClipboard === false && s.pages === 2,
    JSON.stringify(s)
  );

  // -------------------------------------------------------------------------
  // 11) New blank project clears the clipboard too (io.newProject path)
  // -------------------------------------------------------------------------
  s = await evalJs(`(async () => {
    const api = window.__pptdEditor;
    const page = api.state.deck.pages[api.state.currentPage];
    api.select(page.elements[0].elementId);
    api.copySelected();
    const before = api.getClipboardCount();
    await window.__pptdIo.newProject({ toast: false });
    return {
      before,
      after: api.getClipboardCount(),
      hasClipboard: api.hasClipboard(),
      pasted: api.pasteClipboard().length,
      pages: api.state.deck.pages.length,
    };
  })()`);
  log(
    "新建空白项目清空剪贴板（paste 返回空）",
    s.before === 1 && s.after === 0 && s.hasClipboard === false && s.pasted === 0 && s.pages === 1,
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
