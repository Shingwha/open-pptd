// editor/app/project/io.js — project-mode assembly root (load / save / export / images / live reload)
// The project source is one ProjectSource facade: the injected source owns URL
// projects, directoryHandleSource owns local folder handles, and delegatingSource
// routes between them from state.projectHandle. loader / saver / live-reload only
// know this facade; the editor shell is unaware of it.

import { createFontManager } from "./font-manager.js";
import { createImageStore } from "./images.js";
import { createLoader } from "./loader.js";
import { createLiveReload } from "./live-reload.js";
import { createProjectSaver } from "./saver.js";
import { memorySource, directoryHandleSource, delegatingSource } from "./source.js";
import { pickProjectFolder, ensurePermission } from "./handle-io.js";
import { addRecent, setPendingProject, clearPendingProject } from "./handle-store.js";
import { createHistory } from "../../interaction/history.js";
import { commitBaseline } from "../state.js";
import { createDeck, createPage, resolveTheme, syncElementId } from "../../../packages/model/index.js";

/** Drop the project-bearing query param, keeping shell params (base / chrome / blank / shot). */
function clearProjectUrl() {
  try {
    const params = new URLSearchParams(location.search);
    params.delete("deck");
    const search = params.toString();
    history.replaceState(null, "", location.pathname + (search ? `?${search}` : ""));
  } catch {
    /* non-browser (tests/embedding without history): nothing to rewrite */
  }
}

export function createIo({ state, view, ops, source, ui, live = true, onSaved, onDeckChange, onError }) {
  if (!ui) throw new Error("createIo: 需要实例上下文 ui");
  const fontManager = createFontManager(state, ui);
  const images = createImageStore(state);

  // Transport seam: the injected source is the URL-mode default; handle projects route to directoryHandleSource
  const baseSource = source || memorySource({});
  const projectSource = delegatingSource({
    base: baseSource,
    handleSource: directoryHandleSource,
    currentHandle: () => state.projectHandle,
  });

  // Assembly order: loader/saver callbacks close over the live-reload handle, but
  // only run on the first load/save, by which time it is assigned (a const would
  // hit the TDZ, hence `let`). `live:false` (gallery covers) keeps the channel off.
  let liveReload;
  const loader = createLoader({
    state,
    view,
    ops,
    images,
    fontManager,
    source: projectSource,
    ui,
    connect: () => (live ? liveReload.connectLiveReload() : undefined), // subscribe to live reload once the project is ready (idempotent)
    renderStatusBar: () => liveReload.renderStatusBar(), // refresh the statusbar after load
    onDeckChange,
    onError,
  });
  const saver = createProjectSaver({
    state,
    images,
    fontManager,
    source: projectSource,
    ui,
    renderStatusBar: () => liveReload.renderStatusBar(),
    /** Conflict → "重新加载": discard the in-memory edits and re-read the source (revision comes from applyDeck). */
    reload: async () => {
      if (state.projectHandle) await loader.loadDeckFromHandle(state.projectHandle, { keepPage: true, silent: true });
      else if (state.manifestPath) await loader.loadDeck(state.manifestPath, { keepPage: true, silent: true });
    },
    onSaved: () => {
      liveReload.suppressRefreshes(); // suppress the refresh loop after saving
      onSaved?.(); // public event (createEditor options.on.saved)
    },
    onError,
  });
  liveReload = createLiveReload({
    state,
    source: projectSource,
    ui,
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
      ui.toast.show("需要文件夹读写权限才能打开并保存项目", "danger");
      return false;
    }
    await loader.loadDeckFromHandle(handle);
    clearProjectUrl(); // drop the old ?deck=, keep shell params
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
    if (state.dirty && !(await ui.dialogs.confirm("编辑器有未保存的修改，新建将放弃这些修改。确定继续？"))) return false;
    const deck = createDeck({ title: "未命名演示文稿" });
    deck.pages.push(createPage({ pageType: "content" }));
    ops.replaceDeck(deck);
    ops.clearClipboard(); // a new blank document starts with an empty element clipboard
    state.theme = resolveTheme(deck);
    state.manifestPath = null;
    state.projectHandle = null;
    state.projectName = "";
    state.revision = null; // blank project: nothing on disk to conflict with
    loader.setBrandFile(""); // topbar back to "unnamed", clearing the old project name
    state.currentPage = 0;
    ops.clearSelection();
    commitBaseline(state); // blank-project baseline (undo/redo equality compare)
    state.history = createHistory();
    syncElementId(state.deck);
    images.rebuildImageMap();
    clearPendingProject();
    clearProjectUrl();
    view.render({ thumbs: "all" }); // new document: every card is new
    if (live) liveReload.connectLiveReload(); // blank project: disconnect the old live channel (internally treated as no project)
    try {
      onDeckChange?.(state.deck);
    } catch (err) {
      console.warn("[io] deckChange 回调异常:", err?.message || err);
    }
    if (toast) ui.toast.show("已新建空白演示", "info");
    return true;
  }

  return {
    applyColors: loader.applyColors,
    applyHistory: loader.applyHistory,
    loadDeck: loader.loadDeck,
    loadDeckFromHandle: loader.loadDeckFromHandle,
    loadDeckData: loader.loadDeckData,
    newProject,
    setBrandFile: loader.setBrandFile,
    openLocalProject,
    openProjectHandle,
    manualReload: loader.manualReload,
    connectLiveReload: () => {
      if (live) liveReload.connectLiveReload();
    },
    rebuildImageMap: images.rebuildImageMap,
    exportPptx: saver.exportPptx,
    exportProjectZip: saver.exportProjectZip,
    exportImages: saver.exportImages,
    saveProject: saver.saveProject,
    preloadImages: images.preloadImages,
    renderStatusBar: liveReload.renderStatusBar,
    fontManager,
    source: projectSource, // transport facade (hosts/tests can read it; all internal IO goes through it)
    destroy: () => liveReload.destroy(),
  };
}
