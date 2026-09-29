// ============================================================================
// app/project/io.js — project-mode assembly root (load / save / export / images / live reload)
// ----------------------------------------------------------------------------
// The project source is unified behind one ProjectSource facade (injected by the
// createEditor / shot assembly):
//   - the injected source (httpSource by default; a host impl when embedded) owns
//     URL project reads/writes
//   - local folder projects (File System Access handles) are owned by
//     directoryHandleSource, and delegatingSource routes between the two
//     automatically based on state.projectHandle
// loader / saver / live-reload only know this facade and no longer fetch
// themselves. The editor shell (main/toolbar/keyboard/api/shot) is unaware of it.
// ============================================================================

import { createFontManager } from "./font-manager.js";
import { createImageStore } from "./images.js";
import { bindIconMap } from "./icons.js";
import { createLoader } from "./loader.js";
import { createLiveReload } from "./live-reload.js";
import { createProjectSaver } from "./saver.js";
import { memorySource, directoryHandleSource, delegatingSource } from "./source.js";
import { pickProjectFolder, ensurePermission } from "./handle-io.js";
import { addRecent, setPendingProject, clearPendingProject } from "./handle-store.js";
import { createHistory } from "../../interaction/history.js";
import { commitBaseline } from "../state.js";
import { dialogs } from "../../dialogs.js";
import { showToast } from "../toast.js";
import { createDeck, createPage, normalizeTheme, syncElementId } from "../../../packages/model/index.js";

export function createIo({ state, view, ops, source, onSaved, onDeckChange, onError }) {
  const fontManager = createFontManager(state);
  const images = createImageStore(state);
  bindIconMap(state.iconMap); // bind the icon preload cache (icons.js module singleton, shared by render/export)

  // Transport seam: the injected source is the URL-mode default; handle projects route to directoryHandleSource
  const baseSource = source || memorySource({});
  const projectSource = delegatingSource({
    base: baseSource,
    handleSource: directoryHandleSource,
    currentHandle: () => state.projectHandle,
  });

  // Assembly order: loader/saver callbacks close over `live`, but only run on the
  // first load/save, by which time `live` is assigned (a const would hit the TDZ,
  // hence `let`).
  let live;
  const loader = createLoader({
    state,
    view,
    ops,
    images,
    fontManager,
    source: projectSource,
    connect: () => live.connectLiveReload(), // subscribe to live reload once the project is ready (idempotent)
    renderStatusBar: () => live.renderStatusBar(), // refresh the statusbar after load
    onDeckChange,
    onError,
  });
  const saver = createProjectSaver({
    state,
    images,
    fontManager,
    source: projectSource,
    renderStatusBar: () => live.renderStatusBar(),
    onSaved: () => {
      live.suppressRefreshes(); // suppress the refresh loop after saving
      onSaved?.(); // public event (createEditor options.on.saved)
    },
    onError,
  });
  live = createLiveReload({
    state,
    source: projectSource,
    reload: () => loader.loadDeck(state.manifestPath, { keepPage: true, silent: true }),
    reloadHandle: () => loader.loadDeckFromHandle(state.projectHandle, { keepPage: true, silent: true }),
    manualReload: loader.manualReload, // topbar "live" marker click
  });

  /**
   * Open a local project handle we already hold (used by both "open local
   * project" and the recent list): grant → load → record recent + session-restore
   * marker (an editor refresh can reopen it).
   */
  async function openProjectHandle(handle) {
    if (!(await ensurePermission(handle))) {
      showToast("需要文件夹读写权限才能打开并保存项目", "danger");
      return false;
    }
    await loader.loadDeckFromHandle(handle);
    history.replaceState(null, "", location.pathname); // drop the old ?deck=, refresh goes through session restore
    const entry = await addRecent(handle);
    if (entry) setPendingProject(entry.id);
    return true;
  }

  /** Open a local project: OS folder picker (official control) → openProjectHandle. */
  async function openLocalProject() {
    const handle = await pickProjectFolder();
    if (!handle) return false; // user cancelled
    return openProjectHandle(handle);
  }

  /**
   * New blank deck (the "＋ new blank" app menu and blank editor startup share
   * it): after a dirty confirmation, reset to a blank project, disconnect the
   * live channel and clear the session-restore marker (a page refresh returns to
   * blank instead of the old project). toast:false is reused by the editor's
   * first blank startup (no toast).
   */
  async function newProject({ toast = true } = {}) {
    if (state.dirty && !(await dialogs.confirm("编辑器有未保存的修改，新建将放弃这些修改。确定继续？"))) return false;
    const deck = createDeck({ title: "未命名演示文稿" });
    deck.pages.push(createPage({ pageType: "content" }));
    ops.replaceDeck(deck);
    state.theme = normalizeTheme(null);
    state.manifestPath = null;
    state.projectHandle = null;
    state.projectName = "";
    loader.setBrandFile(""); // topbar back to "unnamed", clearing the old project name
    state.currentPage = 0;
    ops.clearSelection();
    commitBaseline(state); // blank-project baseline (undo/redo equality compare)
    state.history = createHistory();
    syncElementId(state.deck);
    images.rebuildImageMap();
    clearPendingProject();
    history.replaceState(null, "", location.pathname);
    view.render();
    live.connectLiveReload(); // blank project: disconnect the old live channel (internally treated as no project)
    try {
      onDeckChange?.(state.deck);
    } catch (err) {
      console.warn("[io] deckChange 回调异常:", err?.message || err);
    }
    if (toast) showToast("已新建空白演示", "info");
    return true;
  }

  return {
    applyTheme: loader.applyTheme,
    applyHistory: loader.applyHistory,
    loadDeck: loader.loadDeck,
    loadDeckFromHandle: loader.loadDeckFromHandle,
    loadDeckData: loader.loadDeckData,
    newProject,
    setBrandFile: loader.setBrandFile,
    openLocalProject,
    openProjectHandle,
    manualReload: loader.manualReload,
    connectLiveReload: live.connectLiveReload,
    rebuildImageMap: images.rebuildImageMap,
    exportPptx: saver.exportPptx,
    exportProjectZip: saver.exportProjectZip,
    exportImages: saver.exportImages,
    saveProject: saver.saveProject,
    preloadImages: images.preloadImages,
    renderStatusBar: live.renderStatusBar,
    fontManager,
    source: projectSource, // transport facade (hosts/tests can read it; all internal IO goes through it)
    destroy: () => live.destroy(),
  };
}
