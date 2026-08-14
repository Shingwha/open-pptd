// ============================================================================
// app/project/io.js — 项目模式装配根（加载 / 保存 / 导出 / 图片 / 实时刷新）
// ----------------------------------------------------------------------------
// 单一模型：项目文件在磁盘（serve --project 挂载目录），浏览器经 HTTP 读写。
//   - 加载：fetch 项目文件（/project/deck.pptd + pages/*.page）
//   - 保存：POST /api/save 写回磁盘（端点不存在 = 部署模式，降级为下载 zip）
//   - 实时刷新：EventSource("/events") 订阅文件变更（server 推送）
//   - 图片：统一由 images.js 预读为 dataURL
// 部署模式（GitHub Pages）：无 /events 与 /api/save，加载/导出照常，
// 保存 = 下载项目 zip（备份），实时刷新不启用。
//
// 本文件只做装配：loader（加载）/ saver（保存导出）/ images（图片）/
// live-reload（SSE + 状态栏）经依赖注入单向接线，对外 API 保持稳定，
// 编辑器外壳（main/toolbar/keyboard/api/shot）零感知。
// ============================================================================

import { createFontManager } from "./font-manager.js";
import { createImageStore } from "./images.js";
import { createLoader } from "./loader.js";
import { createLiveReload } from "./live-reload.js";
import { createProjectSaver } from "./saver.js";

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
    onSaved: () => live.suppressRefreshes(), // 保存后抑制 SSE 刷新回环
  });
  live = createLiveReload({
    state,
    reload: () => loader.loadDeck(state.manifestPath, { keepPage: true, silent: true }),
    manualReload: loader.manualReload,
  });

  return {
    applyTheme: loader.applyTheme,
    applyHistory: loader.applyHistory,
    loadDeck: loader.loadDeck,
    manualReload: loader.manualReload,
    connectLiveReload: live.connectLiveReload,
    rebuildImageMap: images.rebuildImageMap,
    exportPptx: saver.exportPptx,
    saveProject: saver.saveProject,
    preloadRemoteImages: images.preloadRemoteImages,
    renderStatusBar: live.renderStatusBar,
    fontManager,
  };
}
