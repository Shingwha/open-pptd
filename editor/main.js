// ============================================================================
// main.js — standalone entry (thin composition root)
// ----------------------------------------------------------------------------
// Only decides "where to open from, what to mount on, which test hooks to expose";
// editor assembly all lives in editor.js:
//   - ?shot=1        → headless screenshot mode (app/shot.js, skips the editor UI)
//   - ?deck=<project> → createEditor + httpSource({ deckUrl })
//   - session-restore marker present → reopen the last local project (open directly
//     while the grant holds, otherwise show the restore card)
//   - otherwise      → blank editor
//
// Host boot seam (contract 1 embedding): a same-origin host may inject the boot
// parameters through the query string (highest priority) or window.__PPTD_BOOT__
// (an inline script before this module runs); with none of them set, the boot path
// is byte-for-byte the standalone behavior:
//   ?base=   / __PPTD_BOOT__.base     site prefix for httpSource (default "")
//   ?chrome= / __PPTD_BOOT__.chrome   "full" | "embedded" (other values ignored + warning)
//   __PPTD_BOOT__.theme               { tokens?, mode? } → createEditor options.theme
//
// Public contract (zero behavior change; consumers: tests/e2e/incremental-load.mjs,
// packages/renderer/headless/shoot.js):
//   window.__pptdEditor = ed.api   editor operation facade
//   window.__pptdIo     = ed.io    project IO (e2e calls saveProject() to verify write-back)
//   window.__pptdShot              shot-mode only (set by app/shot.js)
//   window.__pptdTheme  = { apply(opts), reset() }   host theme injection (contract 3)
// ============================================================================

import { createEditor } from "./editor.js";
import { dom } from "./dom.js";
import { applyThemeTokens } from "./theme.js";
import { httpSource } from "./app/project/source.js";
import { showToast } from "./app/toast.js";
import { ensurePermission } from "./app/project/handle-io.js";
import {
  getRecent,
  getPendingProjectId,
  clearPendingProject,
  addRecent,
  setPendingProject,
} from "./app/project/handle-store.js";
import { showDialog } from "./interaction/dialogs/base.js";
import { SHOT_ERROR_TITLE } from "../packages/model/index.js";

// Repo root URL (this file lives in <root>/editor/, so ../ is the site root)
const ROOT = new URL("../", import.meta.url).href;

// ----------------------------------------------------------------------------
// Host boot seam: query string > window.__PPTD_BOOT__ (both optional; see the
// file header for the parameter table)
// ----------------------------------------------------------------------------
/** chrome presets a host may select through the boot seam (?shot=1 keeps its own path). */
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
  // instead of being forwarded to createEditor (which would treat it as an object spec).
  const chromeRaw = params.get("chrome") ?? boot.chrome;
  let chrome = null;
  if (BOOT_CHROME_VALUES.includes(chromeRaw)) chrome = chromeRaw;
  else if (chromeRaw) console.warn(`[main] 忽略无效的 chrome 启动参数: ${chromeRaw}`);

  // theme: host token/mode override (contract 3); there is no query-string form.
  const theme = boot.theme && typeof boot.theme === "object" ? boot.theme : null;

  return { base, chrome, theme };
}

/**
 * Local project session restore: the last opened local project (gallery jump /
 * editor refresh) — reopen directly while the grant still holds, otherwise show
 * the restore card and let the "Open" click re-grant inside a user gesture (a
 * browser requirement).
 * @param {object} io editor io facade
 * @param {string|null} pendingId the pending entry id captured before boot (blank init clears the marker)
 */
async function restorePendingProject(io, pendingId) {
  if (!pendingId) return false;
  const entry = await getRecent(pendingId);
  if (!entry?.handle) {
    clearPendingProject();
    return false;
  }
  let granted = false;
  try {
    granted = (await entry.handle.queryPermission({ mode: "readwrite" })) === "granted";
  } catch {
    /* handle invalid → route through the card so the user confirms */
  }
  if (granted) {
    try {
      await io.loadDeckFromHandle(entry.handle);
      return true;
    } catch (err) {
      showToast(`恢复项目失败: ${err.message}`, "danger");
    }
  }
  showRestoreCard(io, entry);
  return true;
}

/** Restore card: project name + [new blank / open project] (open requests the grant inside the click gesture).
 * Goes through the showDialog infrastructure; no ✕ / overlay close — the user must pick explicitly (an accidental close would lose the session entry). */
function showRestoreCard(io, entry) {
  const hint = document.createElement("div");
  hint.className = "prop-hint";
  hint.textContent = `上次打开的「${entry.name}」。浏览器要求重新授权后才能访问该文件夹。`;

  const blankBtn = document.createElement("button");
  blankBtn.type = "button";
  blankBtn.className = "btn btn-sm";
  blankBtn.textContent = "新建空白演示";
  const openBtn = document.createElement("button");
  openBtn.type = "button";
  openBtn.className = "btn btn-primary btn-sm";
  openBtn.textContent = "打开项目";

  const { close } = showDialog("恢复本地项目", hint, {
    panelClass: "restore-card",
    closeBtn: false,
    overlayClose: false,
    buttons: [blankBtn, openBtn],
  });

  blankBtn.onclick = () => {
    clearPendingProject();
    close();
    showToast("已新建空白演示", "info");
  };
  openBtn.onclick = async () => {
    openBtn.disabled = true;
    try {
      if (!(await ensurePermission(entry.handle))) {
        openBtn.disabled = false;
        showToast("未获得文件夹访问授权", "danger");
        return;
      }
      await io.loadDeckFromHandle(entry.handle);
      const fresh = await addRecent(entry.handle);
      if (fresh) setPendingProject(fresh.id);
      close();
    } catch (err) {
      openBtn.disabled = false;
      showToast(`打开失败: ${err.message}`, "danger");
    }
  };
}

// ----------------------------------------------------------------------------
// Host theme hook (contract 3, postMessage protocol): the embedding host sends
// { type: "pptd:theme", tokens, mode } from window.parent at the same origin.
// window.__pptdTheme exposes the same implementation for direct same-origin calls
// and tests. Every application undoes the previous one first (last host wins);
// boot-injected theme stays owned by createEditor and is untouched by reset().
// ----------------------------------------------------------------------------
let restoreHostTheme = null;

/**
 * Apply a host theme payload on the document root.
 * @param {{ tokens?: Record<string,string>, mode?: "light"|"dark" }} [opts]
 * @returns {() => void} restore function of this application (idempotent)
 */
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

window.__pptdTheme = { apply: applyHostTheme, reset: resetHostTheme };
window.addEventListener("message", (e) => {
  if (e.source !== window.parent) return; // only the embedding parent may theme us
  if (e.origin !== location.origin) return; // same-origin embedding only
  const data = e.data;
  if (!data || data.type !== "pptd:theme") return;
  applyHostTheme({ tokens: data.tokens, mode: data.mode });
});

// ----------------------------------------------------------------------------
// Boot: ?shot=1 screenshot; ?deck= loads the given project; with a session-restore
// marker reopen it; otherwise blank
// ----------------------------------------------------------------------------
async function boot() {
  const params = new URLSearchParams(location.search);
  const deckParam = params.get("deck");
  const deckUrl = deckParam ? (/^https?:/.test(deckParam) ? deckParam : new URL(deckParam, ROOT).href) : null;
  if (params.get("shot") === "1") {
    // Headless screenshot mode (used by `open-pptd render`): skip the editor UI, render the page only
    import("./app/shot.js")
      .then((m) => m.initShot(deckUrl))
      .catch((err) => {
        console.error("[shot] 初始化失败:", err);
        document.title = SHOT_ERROR_TITLE;
      });
    return;
  }

  // Blank init clears the session marker, so capture the pending id first
  const pendingId = deckUrl ? null : getPendingProjectId();
  const bootParams = readBootParams(params);
  const root = dom.pptdRoot || document.body;
  const options = {
    // no injected base → the standalone httpSource({ deckUrl }) call shape (base defaults to "")
    source: httpSource(bootParams.base ? { base: bootParams.base, deckUrl } : { deckUrl }),
    deckUrl: deckUrl || null, // load it when ?deck= is present; otherwise createEditor starts blank silently
    chrome: bootParams.chrome || "full",
  };
  if (bootParams.theme) options.theme = bootParams.theme;
  const ed = createEditor(root, options);

  // Public test hooks (depended on by ui-shots.mjs / incremental-load.mjs / shoot.js)
  window.__pptdEditor = ed.api;
  window.__pptdIo = ed.io;

  // Embedded host ping: one ready message once the editor is mounted (before the
  // async initial load, so the host can inject the theme without a palette flash).
  if (window.parent !== window) window.parent.postMessage({ type: "pptd:ready" }, location.origin);

  if (deckUrl) {
    clearPendingProject(); // URL project wins; clear the local-project session marker
    return;
  }
  if (await restorePendingProject(ed.io, pendingId)) return;
  showToast("已新建空白演示", "info");
}

boot();
