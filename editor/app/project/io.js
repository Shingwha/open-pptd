// ============================================================================
// app/project/io.js — 项目模式装配根（加载 / 保存 / 导出 / 图片 / 实时刷新）
// ----------------------------------------------------------------------------
// 项目两种来源，统一经此装配（loader/saver/live 单向依赖注入，对外 API 稳定）：
//   - 本地项目句柄（官方文件夹选择器打开，handle-io）：读文件不经 HTTP，
//     保存直接写回所选文件夹，实时刷新走指纹轮询
//   - URL 模式（serve --project 挂载 / examples / 部署模式）：fetch 加载；
//     保存 POST /api/save 写回挂载目录，端点不存在（GitHub Pages）降级 zip；
//     实时刷新 EventSource("/events")，部署模式自动不启用
// 编辑器外壳（main/toolbar/keyboard/api/shot）零感知。
// ============================================================================

import { createFontManager } from "./font-manager.js";
import { createImageStore } from "./images.js";
import { createLoader } from "./loader.js";
import { createLiveReload } from "./live-reload.js";
import { createProjectSaver } from "./saver.js";
import { pickProjectFolder, ensurePermission } from "./handle-io.js";
import { addRecent, setPendingProject, clearPendingProject } from "./handle-store.js";
import { createDeck, createPage, syncElementId } from "../../core/model.js";
import { normalizeTheme } from "../../core/theme.js";
import { createHistory } from "../../interaction/history.js";
import { showToast } from "../toast.js";

export function createIo({ state, view }) {
  const fontManager = createFontManager(state);
  const images = createImageStore(state);

  // 装配顺序：loader/saver 的回调闭包引用 live，直到首次加载/保存时才执行，
  // 彼时 live 已赋值（const live 会触发 TDZ，故用 let 声明）。
  let live;
  const loader = createLoader({
    state,
    view,
    images,
    fontManager,
    connect: () => live.connectLiveReload(), // 项目就绪后订阅实时刷新（幂等）
    renderStatusBar: () => live.renderStatusBar(), // 加载后刷新状态栏
  });
  const saver = createProjectSaver({
    state,
    images,
    fontManager,
    renderStatusBar: () => live.renderStatusBar(),
    onSaved: () => live.suppressRefreshes(), // 保存后抑制刷新回环
  });
  live = createLiveReload({
    state,
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
   * 新建空白演示（应用菜单「＋ 新建空白」）：dirty 确认后重置为空白项目，
   * 断开实时通道、清会话恢复标记（刷新页面回到空白而不是旧项目）。
   */
  function newProject() {
    if (state.dirty && !window.confirm("编辑器有未保存的修改，新建将放弃这些修改。确定继续？")) return false;
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
    showToast("已新建空白演示", "info");
    return true;
  }

  return {
    applyTheme: loader.applyTheme,
    applyHistory: loader.applyHistory,
    loadDeck: loader.loadDeck,
    loadDeckFromHandle: loader.loadDeckFromHandle,
    newProject,
    setBrandFile: loader.setBrandFile,
    openLocalProject,
    openProjectHandle,
    manualReload: loader.manualReload,
    connectLiveReload: live.connectLiveReload,
    rebuildImageMap: images.rebuildImageMap,
    exportPptx: saver.exportPptx,
    exportProjectZip: saver.exportProjectZip,
    saveProject: saver.saveProject,
    preloadRemoteImages: images.preloadRemoteImages,
    renderStatusBar: live.renderStatusBar,
    fontManager,
  };
}
