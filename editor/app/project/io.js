// ============================================================================
// app/project/io.js — 项目模式装配根（加载 / 保存 / 导出 / 图片 / 实时刷新）
// ----------------------------------------------------------------------------
// 项目来源经一个 ProjectSource 外观统一（由 createEditor / shot 装配注入）：
//   - 注入的 source（默认 httpSource；嵌入场景可为宿主实现）承担 URL 项目读写
//   - 本地文件夹项目（File System Access 句柄）由 directoryHandleSource 承担，
//     经 delegatingSource 在两者之间按 state.projectHandle 自动路由
// loader / saver / live-reload 只认这个外观，各自不再 fetch。
// 编辑器外壳（main/toolbar/keyboard/api/shot）零感知。
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
import { dialogs } from "../../dialogs.js";
import { showToast } from "../toast.js";
import { createDeck, createPage, normalizeTheme, syncElementId } from "../../../packages/model/index.js";

export function createIo({ state, view, source, onSaved, onDeckChange, onError }) {
  const fontManager = createFontManager(state);
  const images = createImageStore(state);
  bindIconMap(state.iconMap); // 图标预读缓存绑定（icons.js 模块单例，渲染/导出共用）

  // 传输接缝：注入的 source 为 URL 模式默认源；句柄项目自动路由到 directoryHandleSource
  const baseSource = source || memorySource({});
  const projectSource = delegatingSource({
    base: baseSource,
    handleSource: directoryHandleSource,
    currentHandle: () => state.projectHandle,
  });

  // 装配顺序：loader/saver 的回调闭包引用 live，直到首次加载/保存时才执行，
  // 彼时 live 已赋值（const live 会触发 TDZ，故用 let 声明）。
  let live;
  const loader = createLoader({
    state,
    view,
    images,
    fontManager,
    source: projectSource,
    connect: () => live.connectLiveReload(), // 项目就绪后订阅实时刷新（幂等）
    renderStatusBar: () => live.renderStatusBar(), // 加载后刷新状态栏
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
      live.suppressRefreshes(); // 保存后抑制刷新回环
      onSaved?.(); // 对外事件（createEditor options.on.saved）
    },
    onError,
  });
  live = createLiveReload({
    state,
    source: projectSource,
    reload: () => loader.loadDeck(state.manifestPath, { keepPage: true, silent: true }),
    reloadHandle: () => loader.loadDeckFromHandle(state.projectHandle, { keepPage: true, silent: true }),
    manualReload: loader.manualReload, // 顶栏「实时」标记点击
  });

  /**
   * 打开一个已持有的本地项目句柄（「打开本地项目」新选 / 最近列表共用）：
   * 授权 → 加载 → 记最近 + 会话恢复标记（刷新编辑器页可续开）。
   */
  async function openProjectHandle(handle) {
    if (!(await ensurePermission(handle))) {
      showToast("需要文件夹读写权限才能打开并保存项目", "danger");
      return false;
    }
    await loader.loadDeckFromHandle(handle);
    history.replaceState(null, "", location.pathname); // 清掉旧 ?deck=，刷新走会话恢复
    const entry = await addRecent(handle);
    if (entry) setPendingProject(entry.id);
    return true;
  }

  /** 打开本地项目：系统文件夹选择框（官方控件）→ openProjectHandle。 */
  async function openLocalProject() {
    const handle = await pickProjectFolder();
    if (!handle) return false; // 用户取消
    return openProjectHandle(handle);
  }

  /**
   * 新建空白演示（应用菜单「＋ 新建空白」与编辑器空白启动共用）：
   * dirty 确认后重置为空白项目，断开实时通道、清会话恢复标记（刷新页面回到
   * 空白而不是旧项目）。toast:false 供编辑器首次空白启动复用（不弹提示）。
   */
  async function newProject({ toast = true } = {}) {
    if (state.dirty && !(await dialogs.confirm("编辑器有未保存的修改，新建将放弃这些修改。确定继续？"))) return false;
    state.deck = createDeck({ title: "未命名演示文稿" });
    state.deck.pages.push(createPage({ pageType: "content" }));
    state.theme = normalizeTheme(null);
    state.manifestPath = null;
    state.projectHandle = null;
    state.projectName = "";
    loader.setBrandFile(""); // 顶栏回到「未命名」，清掉旧项目名残留
    state.currentPage = 0;
    state.selectedId = null;
    state.dirty = false;
    state.savedDeck = structuredClone(state.deck); // 空白项目基线（撤销/重做等值比较）
    state.history = createHistory();
    syncElementId(state.deck);
    images.rebuildImageMap();
    clearPendingProject();
    history.replaceState(null, "", location.pathname);
    view.render();
    live.connectLiveReload(); // 空白项目：断开旧实时通道（内部按无项目处理）
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
    preloadRemoteImages: images.preloadRemoteImages,
    renderStatusBar: live.renderStatusBar,
    fontManager,
    source: projectSource, // 传输接缝外观（宿主/测试可读；内部读写已全部经它）
    destroy: () => live.destroy(),
  };
}
