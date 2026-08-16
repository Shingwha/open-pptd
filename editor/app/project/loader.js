// ============================================================================
// app/project/loader.js — 加载与状态应用
// ----------------------------------------------------------------------------
// 单一模型：项目文件在磁盘（serve --project 挂载目录），浏览器经 HTTP 读取
// （fetch /project/deck.pptd + pages/*.page，跨会话缓存见 project-cache.js）。
// 依赖注入：images（图片映射重建）、fontManager（资源表字体恢复）、
// connect（项目就绪后订阅实时刷新）、renderStatusBar（加载后刷新状态栏）。
// ============================================================================

import * as yaml from "../../vendor/js-yaml.mjs";
import { parseDeck } from "../../core/pptd-io.js";
import { normalizeTheme, mergeFonts, DEFAULT_THEME } from "../../core/theme.js";
import { syncElementId } from "../../core/model.js";
import { createHistory } from "../../interaction/history.js";
import { showToast } from "../toast.js";
import { fetchProjectTexts } from "./project-cache.js";
import { readProject } from "./handle-io.js";

export function createLoader({ state, view, images, fontManager, connect, renderStatusBar }) {
  const $ = (id) => document.getElementById(id);

  // --------------------------------------------------------------------------
  // 主题与状态应用
  // --------------------------------------------------------------------------
  function applyTheme(themeInput) {
    // 官方 theme 永远是对象（v1 字符串 key 兼容已删）；深拷贝隔离默认主题引用
    state.deck.theme = themeInput && typeof themeInput === "object"
      ? JSON.parse(JSON.stringify(themeInput))
      : JSON.parse(JSON.stringify(DEFAULT_THEME));
    // deck 级字体声明覆盖主题字体（无声明则用主题默认，如微软雅黑）
    state.theme = mergeFonts(normalizeTheme(state.deck.theme), state.deck.fonts);
  }

  /** 把撤销/重做快照应用到当前状态。 */
  function applyHistory(deckSnapshot) {
    if (!deckSnapshot) return;
    state.deck = deckSnapshot;
    state.theme = mergeFonts(normalizeTheme(state.deck.theme), state.deck.fonts);
    if (state.currentPage >= state.deck.pages.length) state.currentPage = state.deck.pages.length - 1;
    state.selectedId = null;
    // 撤销/重做落地：先视为修改，渲染钩子再按保存基线等值比较精确化
    // （撤销回保存点恢复干净，重做越过重新标脏）
    state.dirty = true;
    syncElementId(state.deck);
    images.rebuildImageMap();
    view.render();
  }

  // --------------------------------------------------------------------------
  // 加载
  // --------------------------------------------------------------------------
  /** 顶栏项目名：有项目显示名字；空项目显示「未命名」淡显（hover 说明）。 */
  function setBrandFile(text) {
    const el = $("brand-file");
    if (text) {
      el.textContent = text;
      el.classList.remove("unnamed");
      el.removeAttribute("title");
    } else {
      el.textContent = "未命名";
      el.classList.add("unnamed");
      el.title = "空白演示 · 尚未关联项目文件";
    }
  }

  /**
   * 应用一份已解析的 PPTD 项目到编辑器状态：
   * 重置历史/选中/页面/图片映射/id 计数器并渲染（loadDeck 与手动刷新共用）。
   */
  /**
   * 应用一份已解析的 PPTD 项目到编辑器状态：
   * 重置历史/选中/页面/图片映射/id 计数器并渲染（loadDeck 与手动刷新共用）。
   * handle：本地项目句柄模式（官方文件夹选择器打开），None = URL 模式。
   */
  function applyDeck(manifestText, pageFiles, { manifestPath = "", handle = null, projectName = "" } = {}) {
    state.deck = parseDeck(manifestText, pageFiles);
    state.manifestPath = manifestPath;
    state.projectHandle = handle;
    state.projectName = projectName;
    setBrandFile(handle ? projectName : manifestPath);
    applyTheme(state.deck.theme || DEFAULT_THEME);
    state.currentPage = 0;
    state.selectedId = null;
    state.history = createHistory();
    state.savedDeck = structuredClone(state.deck); // 保存基线：撤销/重做回它即视为无未保存修改
    state.dirty = false; // 刚从磁盘/服务器加载，无未保存修改
    syncElementId(state.deck);
    images.rebuildImageMap();
    renderStatusBar();
  }

  /**
   * 加载项目（URL 或挂载路径）。keepPage：保留当前页（自动刷新/手动刷新）；
   * silent：不弹加载 toast（自动刷新场景）。
   */
  async function loadDeck(manifestUrl, { keepPage = false, silent = false } = {}) {
    const prevPage = state.currentPage;
    // 跨会话缓存：二次打开同一项目直接命中（画廊与编辑器共用，见 project-cache.js）
    const { manifestText, pageTexts, missing = 0 } = await fetchProjectTexts(manifestUrl, yaml.load);
    applyDeck(manifestText, pageTexts, { manifestPath: manifestUrl });
    await finishLoad(prevPage, { keepPage, silent, missing, viaHandle: false });
  }

  /** 本地项目句柄加载（官方文件夹选择器打开的项目，读文件不经 HTTP）。 */
  async function loadDeckFromHandle(handle, { keepPage = false, silent = false } = {}) {
    const prevPage = state.currentPage;
    const { manifestText, pageTexts, missing = 0 } = await readProject(handle);
    applyDeck(manifestText, pageTexts, { handle, projectName: handle.name || "本地项目" });
    await finishLoad(prevPage, { keepPage, silent, missing, viaHandle: true });
  }

  /** 加载收尾（两种来源共用）：保留页码/图片预载/字体恢复/渲染/实时刷新。 */
  async function finishLoad(prevPage, { keepPage, silent, missing, viaHandle }) {
    if (keepPage) state.currentPage = Math.min(prevPage, Math.max(0, state.deck.pages.length - 1));
    if (viaHandle) await images.preloadHandleImages(state.projectHandle);
    else await images.preloadRemoteImages();
    await fontManager.restoreFromDeck(); // 资源表 url 字体自动拉取注册（file 字体待用户重选）
    view.render();
    connect(); // 项目就绪后订阅实时刷新（幂等；部署模式自动不启用）
    if (!silent) {
      // 缺失页面提示：Agent 写入中的项目「有一页显示一页」，不阻断预览
      const suffix = missing > 0 ? ` · ${missing} 页缺失（写入中？）` : "";
      showToast(`已加载 · ${state.deck.pages.length} 页 · 主题已应用${suffix}`, missing > 0 ? "info" : "info");
    }
  }

  /** 手动从磁盘重新加载当前项目（文件菜单）：dirty 时需确认放弃未保存修改。 */
  function manualReload() {
    if (state.dirty && !window.confirm("编辑器有未保存的修改，重新加载将放弃这些修改。确定继续？")) return;
    const done = () => showToast("已从磁盘重新加载", "success");
    const fail = (err) => showToast(`重新加载失败: ${err.message}`, "danger");
    if (state.projectHandle) {
      loadDeckFromHandle(state.projectHandle, { keepPage: true, silent: true }).then(done).catch(fail);
      return;
    }
    if (!state.manifestPath) return;
    loadDeck(state.manifestPath, { keepPage: true, silent: true }).then(done).catch(fail);
  }

  return { applyTheme, applyHistory, loadDeck, loadDeckFromHandle, manualReload, setBrandFile };
}
