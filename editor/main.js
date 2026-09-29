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
// Public contract (zero behavior change; consumers: tests/e2e/incremental-load.mjs,
// packages/renderer/headless/shoot.js):
//   window.__pptdEditor = ed.api   editor operation facade
//   window.__pptdIo     = ed.io    project IO (e2e calls saveProject() to verify write-back)
//   window.__pptdShot              shot-mode only (set by app/shot.js)
// ============================================================================

import { createEditor } from "./editor.js";
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
  const root = document.getElementById("pptd-root") || document.body;
  const ed = createEditor(root, {
    source: httpSource({ deckUrl }),
    deckUrl: deckUrl || null, // load it when ?deck= is present; otherwise createEditor starts blank silently
    chrome: "full",
  });

  // Public test hooks (depended on by ui-shots.mjs / incremental-load.mjs / shoot.js)
  window.__pptdEditor = ed.api;
  window.__pptdIo = ed.io;

  if (deckUrl) {
    clearPendingProject(); // URL project wins; clear the local-project session marker
    return;
  }
  if (await restorePendingProject(ed.io, pendingId)) return;
  showToast("已新建空白演示", "info");
}

boot();
