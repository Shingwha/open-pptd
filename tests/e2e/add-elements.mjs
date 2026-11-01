#!/usr/bin/env node
// tests/e2e/add-elements.mjs — shape / line / image add paths (W5).
// Covers: 6-entry add menu, searchable 187-preset shape grid → rect creation/select/undo,
// line variants → arrow creation/undo, image API creation + imageMap + menu entry,
// copy/duplicate/move/resize/delete of new elements, and save → media/*.png persistence.
// Depends on local Chrome (CDP 9346); a missing browser prints SKIP and exits 0.
// Usage: node tests/e2e/add-elements.mjs

import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, rmSync, mkdirSync, mkdtempSync } from "node:fs";
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

// Temporary project: 2 pages, one text element each.
const PROJECT = mkdtempSync(join(tmpdir(), "pptd-add-elements-"));
mkdirSync(join(PROJECT, "pages"), { recursive: true });
writeFileSync(
  join(PROJECT, "deck.pptd"),
  "version: v2\ntitle: 添加元素测试\nsize: [960, 540]\npages:\n  - pages/1.page\n  - pages/2.page\n"
);
const pageYaml = (n) =>
  "pageType: content\nbackground: {type: solid, color: \"#ffffff\"}\nelements:\n" +
  `  - elementId: t${n}\n    elementType: text\n    bounds: [80, 60, 360, 48]\n` +
  `    content: {fontSize: 24, color: "#1f2937", align: [left, middle], text: '第${n}页'}\n`;
writeFileSync(join(PROJECT, "pages", "1.page"), pageYaml(1));
writeFileSync(join(PROJECT, "pages", "2.page"), pageYaml(2));

// 1×1 PNG (valid signature/bytes for the media persistence check).
const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const PNG_BASE64 = PNG_DATA_URL.split(",")[1];

const server = await startServer({ port: 0, projectRoot: PROJECT });
const PORT = server.address().port;
const URL = `http://127.0.0.1:${PORT}/editor/?deck=project/deck.pptd`;
const chrome = spawn(
  CHROME,
  ["--headless=new", "--disable-gpu", "--no-first-run", "--remote-debugging-port=9346", URL],
  { stdio: "ignore" }
);
let cdp;
try {
  cdp = await connectCdp(9346, 15000);
} catch (err) {
  console.error(`SKIP  Chrome 未能启动（${err.message}）`);
  chrome.kill();
  server.close();
  process.exit(0);
}
const evalJs = (expr) => cdp.evalJs(expr);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const sleepUntil = async (fn, timeout = 8000, step = 120) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = fn();
    if (value) return value;
    await wait(step);
  }
  return null;
};
await cdp.send("Runtime.enable");

try {
  await wait(3500);

  // 1) Six top-level entries in the fixed order.
  let s = await evalJs(`(() => {
    document.querySelector('#btn-add').click();
    const items = [...document.querySelectorAll('#add-list .add-item')];
    return {
      items: items.map((b) => b.dataset.addType),
      labels: items.map((b) => b.querySelector('.add-item-label')?.textContent),
      expanded: document.querySelector('#btn-add').getAttribute('aria-expanded'),
    };
  })()`);
  log(
    "添加菜单六类且顺序固定",
    JSON.stringify(s.items) === JSON.stringify(["text", "table", "chart", "shape", "line", "image"]) &&
      s.expanded === "true",
    JSON.stringify(s.items)
  );
  await evalJs(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true`);
  const closed = await evalJs(`document.querySelector('#add-list').hidden`);
  log("Esc 关闭添加菜单", closed === true, String(closed));

  // 2) Shape panel: 187 presets, grouped, searchable (empty state + match).
  s = await evalJs(`(() => {
    document.querySelector('#btn-add').click();
    document.querySelector('#add-list .add-item[data-add-type="shape"]').click();
    const panelType = document.querySelector('#add-list .add-panel')?.dataset.type;
    const grid = [...document.querySelectorAll('#add-list .add-variant[data-variant]')];
    const groupCount = document.querySelectorAll('#add-list .add-variant-group').length;
    const scrollEl = document.querySelector('#add-list .add-variant-scroll');
    const scrollable = scrollEl.scrollHeight > scrollEl.clientHeight;
    const search = document.querySelector('#add-list .add-search');
    search.value = '不存在形状zzz';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    const noneVisible = [...document.querySelectorAll('#add-list .add-variant')].filter((b) => !b.hidden).length;
    const emptyShown = !document.querySelector('#add-list .add-empty').hidden;
    search.value = '矩形';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    const visible = [...document.querySelectorAll('#add-list .add-variant')].filter((b) => !b.hidden).length;
    const rectVisible = !document.querySelector('#add-list .add-variant[data-variant="rect"]').hidden;
    return { panelType, variants: grid.length, groupCount, noneVisible, emptyShown, visible, rectVisible, scrollable };
  })()`);
  log(
    "形状面板 187 预设 / 分组 / 搜索",
    s.panelType === "shape" &&
      s.variants === 187 &&
      s.groupCount >= 10 &&
      s.noneVisible === 0 &&
      s.emptyShown === true &&
      s.visible > 0 &&
      s.rectVisible === true &&
      s.scrollable === true,
    JSON.stringify(s)
  );

  // 3) Pick rect: shape created with preset defaults and selected; undo removes it.
  s = await evalJs(`(() => {
    const api = window.__pptdEditor;
    const els = () => api.state.deck.pages[api.state.currentPage].elements;
    const before = els().length;
    document.querySelector('#add-list .add-variant[data-variant="rect"]').click();
    const el = els().at(-1);
    const after = els().length;
    const selected = api.getSelected();
    const menuHidden = document.querySelector('#add-list').hidden;
    api.undo();
    return {
      before, after, menuHidden, selected,
      id: el.elementId, type: el.elementType, shapeName: el.shapeName,
      bounds: el.bounds, fill: el.fill, adjustments: el.adjustments,
      afterUndo: els().length,
      shapesLeft: els().filter((e) => e.elementType === 'shape').length,
      selectionAfterUndo: api.getSelection().length,
    };
  })()`);
  log(
    "形状 rect：默认值 / 选中 / 关闭菜单",
    s.after === s.before + 1 &&
      s.type === "shape" &&
      s.shapeName === "rect" &&
      JSON.stringify(s.bounds) === JSON.stringify([380, 200, 160, 110]) &&
      s.fill?.type === "solid" &&
      s.fill?.color === "$primary" &&
      s.adjustments === null &&
      s.selected === s.id &&
      s.menuHidden === true,
    JSON.stringify({ type: s.type, shapeName: s.shapeName, bounds: s.bounds, fill: s.fill, selected: s.selected === s.id })
  );
  log(
    "形状 undo 移除",
    s.afterUndo === s.before && s.shapesLeft === 0 && s.selectionAfterUndo === 0,
    JSON.stringify({ after: s.after, afterUndo: s.afterUndo, shapesLeft: s.shapesLeft })
  );

  // 4) Line panel: three variants; arrow line gets viewBox/points/border/arrow; undo removes.
  s = await evalJs(`(() => {
    const api = window.__pptdEditor;
    const els = () => api.state.deck.pages[api.state.currentPage].elements;
    const before = els().length;
    document.querySelector('#btn-add').click();
    document.querySelector('#add-list .add-item[data-add-type="line"]').click();
    const variants = [...document.querySelectorAll('#add-list .add-variant-row')].map((b) => b.dataset.variant);
    document.querySelector('#add-list .add-variant[data-variant="arrow"]').click();
    const el = els().at(-1);
    const selected = api.getSelected();
    api.undo();
    return {
      before, variants, selected, afterUndo: els().length,
      id: el.elementId, type: el.elementType, bounds: el.bounds,
      viewBox: el.viewBox, points: el.points, border: el.border, arrow: el.arrow,
    };
  })()`);
  log(
    "线条变体三项 + arrow 默认值",
    JSON.stringify(s.variants) === JSON.stringify(["line", "arrow", "dash"]) &&
      s.type === "line" &&
      JSON.stringify(s.bounds) === JSON.stringify([180, 300, 560, 40]) &&
      JSON.stringify(s.viewBox) === JSON.stringify([560, 40]) &&
      s.points === "10,20 550,20" &&
      s.border?.style === "solid" &&
      s.border?.width === 2 &&
      s.border?.color === "$primary" &&
      JSON.stringify(s.arrow) === JSON.stringify([null, "arrow"]) &&
      s.selected === s.id,
    JSON.stringify({ variants: s.variants, type: s.type, border: s.border, arrow: s.arrow })
  );
  log("线条 undo 移除", s.afterUndo === s.before, JSON.stringify({ before: s.before, afterUndo: s.afterUndo }));

  // 5) Image: menu entry exists; API creation has contain/320×200, selection and imageMap.
  s = await evalJs(`(() => {
    const api = window.__pptdEditor;
    const els = () => api.state.deck.pages[api.state.currentPage].elements;
    document.querySelector('#btn-add').click();
    const entry = !!document.querySelector('#add-list .add-item[data-add-type="image"]');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    const before = els().length;
    const id = api.addImage(${JSON.stringify(PNG_DATA_URL)});
    const el = els().at(-1);
    return {
      entry, before, after: els().length, id, selected: api.getSelected(),
      type: el.elementType, bounds: el.bounds, fit: el.fit, srcOk: el.src === ${JSON.stringify(PNG_DATA_URL)},
      mapOk: api.state.imageMap[${JSON.stringify(PNG_DATA_URL)}] === ${JSON.stringify(PNG_DATA_URL)},
      menuHidden: document.querySelector('#add-list').hidden,
    };
  })()`);
  log(
    "图片菜单项 + api.addImage 创建/imageMap/选中",
    s.entry === true &&
      s.after === s.before + 1 &&
      s.type === "image" &&
      s.srcOk === true &&
      s.mapOk === true &&
      s.selected === s.id &&
      JSON.stringify(s.bounds) === JSON.stringify([330, 160, 320, 200]) &&
      s.fit?.mode === "contain" &&
      s.menuHidden === true,
    JSON.stringify({ entry: s.entry, bounds: s.bounds, fit: s.fit, selected: s.selected === s.id })
  );

  // 6) New element transforms + clipboard copy/paste + duplicate + delete (all undoable).
  s = await evalJs(`(() => {
    const api = window.__pptdEditor;
    const els = () => api.state.deck.pages[api.state.currentPage].elements;
    api.moveSelected(20, 10);
    api.resizeSelected({ w: 300, h: 180 });
    const moved = [...els().at(-1).bounds];
    const base = els().length;
    const copyCount = api.copySelected();
    const pasted = api.pasteClipboard();
    const countAfterPaste = els().length;
    const dup = api.duplicateSelected();
    const countAfterDup = els().length;
    api.deleteSelected();
    const countAfterDelete = els().length;
    api.undo();
    api.undo();
    api.undo();
    return {
      moved, base, copyCount, pasted: pasted.length, dup: dup.length,
      countAfterPaste, countAfterDup, countAfterDelete, countAfterUndo3: els().length,
      types: els().map((e) => e.elementType),
    };
  })()`);
  log(
    "新元素移动 / 缩放",
    JSON.stringify(s.moved) === JSON.stringify([350, 170, 300, 180]),
    JSON.stringify(s.moved)
  );
  log(
    "新元素复制 / 粘贴 / 重复 / 删除",
    s.copyCount === 1 &&
      s.pasted === 1 &&
      s.dup === 1 &&
      s.countAfterPaste === s.base + 1 &&
      s.countAfterDup === s.base + 2 &&
      s.countAfterDelete === s.base + 1 &&
      s.countAfterUndo3 === s.base &&
      JSON.stringify(s.types) === JSON.stringify(["text", "image"]),
    JSON.stringify(s)
  );

  // 7) Save: the inline dataURL becomes media/<elementId>.png on disk (single media seam).
  await evalJs(`window.__pptdEditor.save()`);
  const saved = await evalJs(`(() => {
    const api = window.__pptdEditor;
    const els = api.state.deck.pages[api.state.currentPage].elements;
    const img = els.find((e) => e.elementType === 'image');
    return {
      images: els.filter((e) => e.elementType === 'image').length,
      id: img?.elementId,
      src: img?.src,
      map: img?.src ? api.state.imageMap[img.src] : null,
      dirty: api.state.dirty,
    };
  })()`);
  const mediaPath = saved?.src && /^media\/[^/]+\.png$/.test(saved.src) ? join(PROJECT, ...saved.src.split("/")) : null;
  const bytes = mediaPath
    ? await sleepUntil(() => {
        try {
          const buf = readFileSync(mediaPath);
          return buf.length > 0 ? buf : null;
        } catch {
          return null;
        }
      }, 10000)
    : null;
  const pageText = readFileSync(join(PROJECT, "pages", "1.page"), "utf8");
  log(
    "保存后图片落盘 media/*.png",
    saved?.images === 1 &&
      /^media\//.test(saved.src || "") &&
      bytes != null &&
      bytes.length > 0 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      pageText.includes("src: media/") &&
      String(saved.map || "").startsWith("data:image/png"),
    JSON.stringify({
      src: saved?.src,
      bytes: bytes?.length ?? 0,
      pageHasMedia: pageText.includes("src: media/"),
      mapOk: String(saved?.map || "").startsWith("data:image/png"),
    })
  );

  // 8) Image picker: WebP is rejected with a notice (no element); PNG is read and added.
  s = await evalJs(`(async () => {
    const api = window.__pptdEditor;
    const els = () => api.state.deck.pages[api.state.currentPage].elements;
    const before = els().length;
    const originalClick = HTMLInputElement.prototype.click;
    const openPicker = () => {
      try {
        HTMLInputElement.prototype.click = function () {};
        document.querySelector('#btn-add').click();
        document.querySelector('#add-list .add-item[data-add-type="image"]').click();
      } finally {
        HTMLInputElement.prototype.click = originalClick;
      }
      return document.querySelector('input[type=file][accept*=".png"]');
    };
    const input = openPicker();
    if (!input) return { input: false, before };
    const reject = new DataTransfer();
    reject.items.add(new File([new Uint8Array([1, 2, 3])], 'bad.webp', { type: 'image/webp' }));
    input.files = reject.files;
    input.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 400));
    const afterReject = els().length;
    const toast = [...document.querySelectorAll('.toast')].map((t) => t.textContent).join(' | ');
    const rejectedInputGone = !document.body.contains(input);

    const input2 = openPicker();
    if (!input2) return { input: true, input2: false, before, afterReject, toast, rejectedInputGone };
    const accept = new DataTransfer();
    const bytes = Uint8Array.from(atob(${JSON.stringify(PNG_BASE64)}), (c) => c.charCodeAt(0));
    accept.items.add(new File([bytes], 'ok.png', { type: 'image/png' }));
    input2.files = accept.files;
    input2.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 800));
    const el = els().at(-1);
    const afterAccept = els().length;
    const selected = api.getSelected();
    api.undo();
    return {
      input: true, input2: true, before, afterReject, toast, rejectedInputGone,
      afterAccept, id: el.elementId, type: el.elementType,
      srcOk: String(el.src).startsWith('data:image/png'), selected,
      afterUndo: els().length, acceptValue: input2.accept,
    };
  })()`);
  log(
    "图片选择器：拒绝 WebP / 接受 PNG",
    s.input === true &&
      s.input2 === true &&
      s.afterReject === s.before &&
      s.rejectedInputGone === true &&
      String(s.toast).includes("仅支持") &&
      s.afterAccept === s.before + 1 &&
      s.type === "image" &&
      s.srcOk === true &&
      s.selected === s.id &&
      s.afterUndo === s.before,
    JSON.stringify({ before: s.before, afterReject: s.afterReject, toast: s.toast, afterAccept: s.afterAccept, afterUndo: s.afterUndo })
  );
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
console.log(`\n${results.length - failed.length}/${results.length} 通过${failed.length ? " ❌" : " ✅"}`);
process.exit(failed.length ? 1 : 0);
