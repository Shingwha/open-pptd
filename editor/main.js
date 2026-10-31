// ============================================================================
// main.js — single application shell (Home ⇄ Editor) + host boot seam
// ----------------------------------------------------------------------------
// /editor/ is the ONE app shell (3.0 single shell, decisions.md D1):
//   ?shot=1            headless screenshot driver (app/shot.js; no shell)
//   ?deck=<project>    Editor view for that project
//   ?blank=1           Editor view, blank deck (shell navigation: new blank)
//   otherwise          Home view (gallery grid)
// Routing is in-page: history.pushState + popstate, so Home ↔ Editor keeps the
// same page and the same file menu / theme mode. The root index.html redirects
// here (query/hash preserved), so the old second gallery page is gone.
//
// Host boot seam (unchanged contract): a same-origin host may inject boot
// parameters through the query string (highest priority) or window.__PPTD_BOOT__
// (an inline script before this module runs):
//   ?base=   / __PPTD_BOOT__.base     site prefix for httpSource (default "")
//   ?chrome= / __PPTD_BOOT__.chrome   "full" | "embedded" (other values ignored + warning)
//   __PPTD_BOOT__.theme               { tokens?, mode? } → editor theme injection
//
// Public contract (zero behavior change; consumers: tests/e2e/*, headless shoot):
//   window.__pptdEditor = editor.editor   editor operation facade (editor view only)
//   window.__pptdIo     = editor.io      project IO (e2e calls saveProject())
//   window.__pptdShot                    shot mode only (set by app/shot.js)
//   window.__pptdTheme  = { apply(opts), reset() }   host theme injection
// ============================================================================

import { createEditor } from "./editor.js";
import { createHomeView } from "./gallery.js";
import { applyThemeTokens, bindThemeMode } from "./theme.js";
import { httpSource } from "./app/project/source.js";
import { createToast } from "./app/toast.js";
import { createDialogs } from "./dialogs.js";
import { pickProjectFolder, hasDeck } from "./app/project/handle-io.js";
import {
  getRecent,
  getPendingProjectId,
  clearPendingProject,
  addRecent,
  setPendingProject,
} from "./app/project/handle-store.js";
import { SHOT_ERROR_TITLE } from "../packages/model/index.js";

// Repo root URL (this file lives in <root>/editor/, so ../ is the site root)
const ROOT = new URL("../", import.meta.url).href;

// Shell-level services (the mounted views own their own instance services)
const shellToast = createToast(document.body);
const shellDialogs = createDialogs();
// Tri-state theme of the shell: same storage key + root as the editor's binding, so
// Home's appearance menu and the Design panel are two views of one choice.
const themeMode = bindThemeMode();

// Shell mount point (editor/index.html provides only this container)
const root = document.getElementById("pptd-root") || document.body;

// ----------------------------------------------------------------------------
// Host boot seam: query string > window.__PPTD_BOOT__ (both optional; see the
// file header for the parameter table)
// ----------------------------------------------------------------------------
/** chrome presets a host may select through the boot seam. */
const BOOT_CHROME_VALUES = ["full", "embedded"];

/**
 * Resolve the boot parameters a host may inject.
 * @param {URLSearchParams} params current location.search
 * @returns {{ base: string|null, chrome: string|null, theme: object|null }}
 */
function readBootParams(params) {
  const boot = window.__PPTD_BOOT__ && typeof window.__PPTD_BOOT__ === "object" ? window.__PPTD_BOOT__ : {};

  // base: any string ("" = explicitly the root prefix, same as the default). The
  // query string wins; an empty base stays falsy so the call shape below is the
  // standalone one.
  const baseRaw = params.get("base") ?? boot.base;
  const base = typeof baseRaw === "string" ? baseRaw : null;

  // chrome: only the two interactive presets are accepted; anything else is ignored
  // instead of being forwarded to createEditor (which would throw on it).
  const chromeRaw = params.get("chrome") ?? boot.chrome;
  let chrome = null;
  if (BOOT_CHROME_VALUES.includes(chromeRaw)) chrome = chromeRaw;
  else if (chromeRaw) console.warn(`[main] 忽略无效的 chrome 启动参数: ${chromeRaw}`);

  // theme: host token/mode override; there is no query-string form.
  const theme = boot.theme && typeof boot.theme === "object" ? boot.theme : null;

  return { base, chrome, theme };
}

let bootParams = { base: null, chrome: null, theme: null };

// ----------------------------------------------------------------------------
// Host theme hook (postMessage protocol): the embedding host sends
// { type: "pptd:theme", tokens, mode } from window.parent at the same origin.
// window.__pptdTheme exposes the same implementation for direct same-origin calls
// and tests. Every application undoes the previous one first (last host wins).
// ----------------------------------------------------------------------------
let restoreHostTheme = null;

/** Apply a host theme payload on the document root. */
function applyHostTheme(opts) {
  restoreHostTheme?.();
  restoreHostTheme = applyThemeTokens(document.documentElement, opts || {});
  return restoreHostTheme;
}

/** Drop the current host theme injection (idempotent; no-op when none was applied). */
function resetHostTheme() {
  restoreHostTheme?.();
  restoreHostTheme = null;
}

function bindHostThemeChannel() {
  window.__pptdTheme = { apply: applyHostTheme, reset: resetHostTheme };
  window.addEventListener("message", (e) => {
    if (e.source !== window.parent) return; // only the embedding parent may theme us
    if (e.origin !== location.origin) return; // same-origin embedding only
    const data = e.data;
    if (!data || data.type !== "pptd:theme") return;
    applyHostTheme({ tokens: data.tokens, mode: data.mode });
  });
}

/** One ready message once a view is mounted (host boot handshake). */
function notifyHostReady() {
  if (window.parent !== window) window.parent.postMessage({ type: "pptd:ready" }, location.origin);
}

// ----------------------------------------------------------------------------
// Shell routing: Home (gallery) ⇄ Editor, in-page via History API
// ----------------------------------------------------------------------------
let current = null; // { kind: "home"|"editor", destroy() }

function deckUrlOf(params) {
  const deckParam = params.get("deck");
  if (!deckParam) return null;
  return /^https?:/.test(deckParam) ? deckParam : new URL(deckParam, ROOT).href;
}

function navigate(next, { replace = false } = {}) {
  const params = new URLSearchParams(location.search);
  params.delete("deck");
  params.delete("blank");
  params.delete("shot");
  for (const [key, value] of Object.entries(next)) {
    if (value != null) params.set(key, value);
  }
  const search = params.toString();
  const url = location.pathname + (search ? `?${search}` : "") + location.hash;
  if (replace) history.replaceState(null, "", url);
  else history.pushState(null, "", url);
  route();
}

/** Leave the current view (dirty-confirmed when it is an editor with unsaved edits). */
async function leaveCurrent() {
  if (current?.kind === "editor" && current.editor?.state?.dirty) {
    const ok = await shellDialogs.confirm("编辑器有未保存的修改，离开将放弃这些修改。确定继续？");
    if (!ok) return false;
  }
  current?.destroy?.();
  current = null;
  return true;
}

async function route() {
  const params = new URLSearchParams(location.search);
  if (params.get("shot") === "1") return; // handled before the shell boots
  const deckUrl = deckUrlOf(params);
  if (deckUrl || params.get("blank") === "1") return mountEditor(deckUrl);
  return mountHome();
}

// ----------------------------------------------------------------------------
// Editor view
// ----------------------------------------------------------------------------
async function mountEditor(deckUrl) {
  if (!(await leaveCurrent())) return; // dirty cancel: keep the current editor
  const ed = createEditor(root, {
    // no injected base → the standalone httpSource({ deckUrl }) call shape (base defaults to "")
    source: httpSource(bootParams.base ? { base: bootParams.base, deckUrl } : { deckUrl }),
    deckUrl: deckUrl || null,
    chrome: bootParams.chrome || "full",
    ...(bootParams.theme ? { theme: bootParams.theme } : {}),
  });
  current = { kind: "editor", editor: ed, destroy: () => ed.destroy() };

  // Public test hooks (depended on by e2e / ui-shots / headless drivers)
  window.__pptdEditor = ed.editor;
  window.__pptdIo = ed.io;
  notifyHostReady();

  if (deckUrl) {
    clearPendingProject(); // URL project wins; clear the local-project session marker
    return;
  }
  // Local project opened from Home (picker / recent): reopen it while the grant holds.
  // No session-restore card in 3.0: an expired grant asks the user to reopen from File.
  if (await consumePendingProject(ed)) return;
  shellToast.show("已新建空白演示", "info");
}

/** Open the pending local project (set by Home's open/recent flow). */
async function consumePendingProject(ed) {
  const id = getPendingProjectId();
  if (!id) return false;
  const entry = await getRecent(id);
  clearPendingProject();
  if (!entry?.handle) return false;
  let granted = false;
  try {
    granted = (await entry.handle.queryPermission({ mode: "readwrite" })) === "granted";
  } catch {
    /* invalid handle → route the user through File → open */
  }
  if (!granted) {
    shellToast.show("本地项目需要重新授权，请用「文件 → 打开本地项目」重新打开", "danger", 6000);
    return false;
  }
  try {
    await ed.io.loadDeckFromHandle(entry.handle);
    return true;
  } catch (err) {
    shellToast.show(`恢复项目失败: ${err.message}`, "danger");
    return false;
  }
}

// ----------------------------------------------------------------------------
// Home view
// ----------------------------------------------------------------------------
async function mountHome() {
  if (!(await leaveCurrent())) return;
  const view = createHomeView({
    root,
    themeMode,
    toast: shellToast,
    onOpenDeck: (deck) => navigate({ deck }),
    onNewBlank: () => navigate({ blank: "1" }),
    onOpenLocal: openLocalProject,
    onOpenRecent: openRecent,
  });
  current = { kind: "home", destroy: () => view.destroy() };
  // Editor hooks belong to the editor view only
  delete window.__pptdEditor;
  delete window.__pptdIo;
  notifyHostReady();
}

/** "Open local project": native picker → validate deck.pptd → record recent → open in the editor. */
async function openLocalProject() {
  try {
    const handle = await pickProjectFolder();
    if (!handle) return; // user cancelled
    if (!(await hasDeck(handle))) {
      shellToast.show("所选文件夹里没有 deck.pptd，请选择 PPTD 项目文件夹", "danger", 5000);
      return;
    }
    const entry = await addRecent(handle);
    if (entry) setPendingProject(entry.id); // the editor opens it while the grant holds
    navigate({ blank: "1" });
  } catch (err) {
    shellToast.show(`打开失败: ${err.message}`, "danger");
  }
}

/** Reopen a recent local project (the marker is consumed by the editor mount). */
function openRecent(entry) {
  setPendingProject(entry.id);
  navigate({ blank: "1" });
}

// ----------------------------------------------------------------------------
// Boot
// ----------------------------------------------------------------------------
async function boot() {
  const params = new URLSearchParams(location.search);
  if (params.get("shot") === "1") {
    // Headless screenshot mode (used by `open-pptd render`): skip the shell, render pages only
    import("./app/shot.js")
      .then((m) => m.initShot(deckUrlOf(params)))
      .catch((err) => {
        console.error("[shot] 初始化失败:", err);
        document.title = SHOT_ERROR_TITLE;
      });
    return;
  }

  bootParams = readBootParams(params);
  bindHostThemeChannel();

  // Home theme = the shell's theme; the host theme injection applies to the document root.
  if (bootParams.theme) applyThemeTokens(document.documentElement, bootParams.theme);

  // Editor → Home: the brand link is the single back entry of the shell
  root.addEventListener("click", (e) => {
    const brand = e.target.closest?.(".brand-home");
    if (!brand || current?.kind !== "editor") return;
    e.preventDefault();
    navigate({}, { replace: false });
  });
  window.addEventListener("popstate", () => route());

  await route();
}

boot();
