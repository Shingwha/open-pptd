// ============================================================================
// app/project/loader.js — loading and state application (thin adapter over the transport seam)
// ----------------------------------------------------------------------------
// No longer fetches on its own: everything is read through the injected
// ProjectSource (app/project/source.js) —
//   loadDeck(url)          via source.read(url) (HTTP / a custom host impl)
//   loadDeckFromHandle(h)  via source.readFromHandle(h) (File System Access handle)
// State application is centralized in source.js applyDeck (exported, reused by createEditor).
// Dependency injection: images (image map rebuild), fontManager (resource-table
// font restore), source (transport), connect (subscribe live reload once ready),
// renderStatusBar (refresh the statusbar after load).
// ============================================================================

import { applyDeck as applyDeckToState } from "./source.js";
import { dialogs } from "../../dialogs.js";
import { showToast } from "../toast.js";
import { preloadIcons } from "./icons.js";
import { dom } from "../../dom.js";
import { DEFAULT_THEME, resolveTheme, syncElementId } from "../../../packages/model/index.js";

export function createLoader({ state, view, ops, images, fontManager, source, connect, renderStatusBar, onDeckChange, onError }) {
  // --------------------------------------------------------------------------
  // Theme and state application
  // --------------------------------------------------------------------------
  function applyTheme(themeInput) {
    // The official theme is always an object (v1 string-key compatibility is gone); deep-copy isolates the default theme reference
    state.deck.theme = themeInput && typeof themeInput === "object"
      ? JSON.parse(JSON.stringify(themeInput))
      : JSON.parse(JSON.stringify(DEFAULT_THEME));
    // A deck-level font declaration overrides the theme font (otherwise the theme default, e.g. Microsoft YaHei)
    state.theme = resolveTheme(state.deck);
  }

  /** Apply an undo/redo snapshot to the current state. */
  function applyHistory(deckSnapshot) {
    if (!deckSnapshot) return;
    ops.replaceDeck(deckSnapshot);
    state.theme = resolveTheme(state.deck);
    if (state.currentPage >= state.deck.pages.length) state.currentPage = state.deck.pages.length - 1;
    ops.clearSelection();
    // Undo/redo lands: mark dirty first, then the render hook equality-compares against the saved baseline
    // (undoing back to the save point marks it clean; redoing past it marks it dirty again)
    state.dirty = true;
    syncElementId(state.deck);
    images.rebuildImageMap();
    view.render();
  }

  // --------------------------------------------------------------------------
  // Loading
  // --------------------------------------------------------------------------
  /**
   * Project file label for the topbar (D4): the last path segment — the project
   * FILE name such as "deck.pptd" — with any query/hash dropped, so a "?deck="
   * URL and a Windows path both reduce to the file name.
   */
  function brandLabel(text) {
    const path = String(text).split(/[?#]/)[0];
    const seg = path.split(/[\\/]/).filter(Boolean).pop() || path;
    try {
      return decodeURIComponent(seg);
    } catch {
      return seg; // malformed percent-encoding: show the raw segment
    }
  }

  /** Topbar project name: shows the project file name; the full path/URL goes into the title. A blank project shows a dim "unnamed" (hover explains). */
  function setBrandFile(text) {
    const el = dom.brandFile;
    if (text) {
      el.textContent = brandLabel(text);
      el.title = text; // full path/URL of the project (D4)
      el.classList.remove("unnamed");
    } else {
      el.textContent = "未命名";
      el.classList.add("unnamed");
      el.title = "空白演示 · 尚未关联项目文件";
    }
  }

  /**
   * Apply an already-parsed PPTD project to editor state (shared by loadDeck and
   * manual reload). The implementation lives in app/project/source.js applyDeck
   * (createEditor reuses the same). handle: local project handle mode (opened via
   * the OS folder picker), null = URL mode.
   */
  function applyDeck(manifestText, pageFiles, { manifestPath = "", handle = null, projectName = "" } = {}) {
    applyDeckToState(
      { manifestText, pageFiles, manifestPath, handle, projectName },
      { state, ops, images, renderStatusBar, setBrandFile, applyTheme }
    );
    try {
      onDeckChange?.(state.deck);
    } catch (err) {
      console.warn("[io] deckChange 回调异常:", err?.message || err);
    }
  }

  /**
   * Load a project (URL or mounted path). keepPage: keep the current page
   * (auto/manual refresh); silent: no load toast (auto-refresh case).
   */
  async function loadDeck(manifestUrl, { keepPage = false, silent = false } = {}) {
    const prevPage = state.currentPage;
    // Cross-session caching (project-cache.js) is reused inside httpSource.read, behavior unchanged
    const data = await source.read(manifestUrl);
    applyDeck(data.manifestText, data.pageFiles, { manifestPath: data.manifestPath || manifestUrl });
    await finishLoad(prevPage, { keepPage, silent, missing: data.missing || 0 });
  }

  /** Load a local project handle (opened via the OS folder picker; file reads bypass HTTP). */
  async function loadDeckFromHandle(handle, { keepPage = false, silent = false } = {}) {
    const prevPage = state.currentPage;
    const data = source.readFromHandle
      ? await source.readFromHandle(handle)
      : await source.read();
    applyDeck(data.manifestText, data.pageFiles, { handle, projectName: handle.name || "本地项目" });
    await finishLoad(prevPage, { keepPage, silent, missing: data.missing || 0 });
  }

  /** Apply an already-read/given project directly (createEditor options.deck and the source.read path). */
  async function loadDeckData(data, { keepPage = false, silent = false } = {}) {
    const prevPage = state.currentPage;
    applyDeck(data.manifestText, data.pageFiles, {
      manifestPath: data.manifestPath || "",
      handle: null,
      projectName: "",
    });
    await finishLoad(prevPage, { keepPage, silent, missing: data.missing || 0 });
  }

  /** Load finishing (shared by both sources): progressive loading — the current
   *  page's assets render first, the rest are promoted page by page in the
   *  background (thumbnail skeleton → real render), fonts restore in parallel
   *  (fallback fonts meanwhile) then everything re-renders. The render layer shows
   *  a "load failed" placeholder for not-yet-ready images, so only the current
   *  page's assets are awaited before the first render.
   *  Media always goes through the one images gate (images.preloadImages): the
   *  injected source decides handle vs URL, so the loader keeps no mode branch. */
  async function finishLoad(prevPage, { keepPage, silent, missing }) {
    if (keepPage) state.currentPage = Math.min(prevPage, Math.max(0, state.deck.pages.length - 1));
    const preloadPage = (pg) => images.preloadImages(source, [pg]);

    // Start fonts first (do not block rendering; text uses fallback fonts meanwhile and re-renders once all are in)
    const fontsDone = fontManager.restoreFromDeck().catch((err) => {
      console.warn("[io] 字体恢复失败:", err?.message || err);
    });

    const cur = state.deck.pages[state.currentPage];
    const pending = new Set(cur ? state.deck.pages.filter((pg) => pg !== cur) : []);
    state.pagesPending = pending;
    if (cur) {
      await preloadPage(cur);
      await preloadIcons([cur]);
    }
    view.render(); // first paint: the current page complete + the other pages as thumbnail skeletons

    // Kick off all remaining page assets at the network layer in parallel; the UI
    // promotes them page by page (keeping the "appearing one by one" cadence, the
    // current page first — switching to a not-yet-ready page preloads it first next round)
    const rest = [...pending];
    const jobs = new Map(
      rest.map((pg) => [
        pg,
        (async () => {
          try {
            await preloadPage(pg);
            await preloadIcons([pg]);
          } catch (err) {
            console.warn("[io] 页面资产预载失败:", err?.message || err);
          }
        })(),
      ])
    );
    while (pending.size) {
      const curPg = state.deck.pages[state.currentPage];
      const pg = curPg && pending.has(curPg) ? curPg : rest.find((p) => pending.has(p));
      if (!pg) break; // leftover refs after a concurrent deck switch: no matching page this round, finish and exit
      await jobs.get(pg);
      pending.delete(pg);
      view.refreshPage?.(pg); // progressive targeted refresh (a stub view such as shot mode skips it)
    }

    await fontsDone;
    view.render(); // fonts registered: fallback glyphs swap to the real font, full re-render
    connect(); // subscribe to live reload once the project is ready (idempotent; deploy mode auto-disabled)
    if (!silent) {
      // Missing-page hint: an Agent-mid-write project shows one page as it lands, without blocking the preview
      const suffix = missing > 0 ? ` · ${missing} 页缺失（写入中？）` : "";
      showToast(`已加载 · ${state.deck.pages.length} 页 · 主题已应用${suffix}`, "info");
    }
  }

  /** Manually reload the current project from disk (file menu): confirm when dirty. */
  async function manualReload() {
    if (state.dirty && !(await dialogs.confirm("编辑器有未保存的修改，重新加载将放弃这些修改。确定继续？"))) return;
    const done = () => showToast("已从磁盘重新加载", "success");
    const fail = (err) => {
      showToast(`重新加载失败: ${err.message}`, "danger");
      onError?.(err);
    };
    if (state.projectHandle) {
      loadDeckFromHandle(state.projectHandle, { keepPage: true, silent: true }).then(done).catch(fail);
      return;
    }
    if (!state.manifestPath) return;
    loadDeck(state.manifestPath, { keepPage: true, silent: true }).then(done).catch(fail);
  }

  return { applyTheme, applyHistory, loadDeck, loadDeckFromHandle, loadDeckData, manualReload, setBrandFile };
}
