// ============================================================================
// app/project/loader.js — 加载与状态应用（传输接缝的薄适配）
// ----------------------------------------------------------------------------
// 不再自行 fetch：一律经注入的 ProjectSource（app/project/source.js）读取——
//   loadDeck(url)        经 source.read(url)（HTTP / 自定义宿主实现）
//   loadDeckFromHandle(h) 经 source.readFromHandle(h)（File System Access 句柄）
// 状态应用逻辑集中在 source.js 的 applyDeck（导出，供 createEditor 复用）。
// 依赖注入：images（图片映射重建）、fontManager（资源表字体恢复）、
// source（运输）、connect（项目就绪后订阅实时刷新）、renderStatusBar（加载后刷新状态栏）。
// ============================================================================

import { resolveTheme, DEFAULT_THEME } from "../../../packages/model/theme.js";
import { applyDeck as applyDeckToState } from "./source.js";
import { showToast } from "../toast.js";
import { preloadIcons } from "./icons.js";

export function createLoader({ state, view, images, fontManager, source, connect, renderStatusBar }) {
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
    state.theme = resolveTheme(state.deck);
  }

  /** 把撤销/重做快照应用到当前状态。 */
  function applyHistory(deckSnapshot) {
    if (!deckSnapshot) return;
    state.deck = deckSnapshot;
    state.theme = resolveTheme(state.deck);
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
   * 应用一份已解析的 PPTD 项目到编辑器状态（loadDeck 与手动刷新共用）。
   * 实现已抽到 app/project/source.js 的 applyDeck（createEditor 复用同一份）。
   * handle：本地项目句柄模式（官方文件夹选择器打开），null = URL 模式。
   */
  function applyDeck(manifestText, pageFiles, { manifestPath = "", handle = null, projectName = "" } = {}) {
    applyDeckToState(
      { manifestText, pageFiles, manifestPath, handle, projectName },
      { state, images, renderStatusBar, setBrandFile, applyTheme }
    );
  }

  /**
   * 加载项目（URL 或挂载路径）。keepPage：保留当前页（自动刷新/手动刷新）；
   * silent：不弹加载 toast（自动刷新场景）。
   */
  async function loadDeck(manifestUrl, { keepPage = false, silent = false } = {}) {
    const prevPage = state.currentPage;
    // 跨会话缓存（project-cache.js）由 httpSource.read 内部沿用，行为不变
    const data = await source.read(manifestUrl);
    applyDeck(data.manifestText, data.pageFiles, { manifestPath: data.manifestPath || manifestUrl });
    await finishLoad(prevPage, { keepPage, silent, missing: data.missing || 0, viaHandle: false });
  }

  /** 本地项目句柄加载（官方文件夹选择器打开的项目，读文件不经 HTTP）。 */
  async function loadDeckFromHandle(handle, { keepPage = false, silent = false } = {}) {
    const prevPage = state.currentPage;
    const data = source.readFromHandle
      ? await source.readFromHandle(handle)
      : await source.read();
    applyDeck(data.manifestText, data.pageFiles, { handle, projectName: handle.name || "本地项目" });
    await finishLoad(prevPage, { keepPage, silent, missing: data.missing || 0, viaHandle: true });
  }

  /** 加载收尾（两种来源共用）：渐进加载——当前页资产先行首渲染，其余页后台
   *  逐页转正（缩略图骨架→实渲染），字体并行恢复（期间回退字体）后整体重渲染。
   *  渲染层对未就绪图片显示「加载失败」占位，故首渲染前只等当前页资产。 */
  async function finishLoad(prevPage, { keepPage, silent, missing, viaHandle }) {
    if (keepPage) state.currentPage = Math.min(prevPage, Math.max(0, state.deck.pages.length - 1));
    const preloadPage = (pg) =>
      viaHandle ? images.preloadHandleImages(state.projectHandle, [pg]) : images.preloadRemoteImages([pg]);

    // 字体先行启动（不阻塞渲染；期间文本以回退字体显示，全部到位后统一重渲染）
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
    view.render(); // 首屏：当前页完整 + 其余页缩略骨架

    // 其余页资产网络层全部并行启动；UI 按页序逐页转正（保留「一张张出现」节奏，
    // 当前页优先——加载中切到未就绪页时下一轮先补它）
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
      if (!pg) break; // 并发换 deck 后残留引用：本轮无对应页，收尾退出
      await jobs.get(pg);
      pending.delete(pg);
      view.refreshPage?.(pg); // 渐进定点刷新（空桩 view 如 shot 模式自动跳过）
    }

    await fontsDone;
    view.render(); // 字体注册完毕：回退字形换真字体，整体重渲染
    connect(); // 项目就绪后订阅实时刷新（幂等；部署模式自动不启用）
    if (!silent) {
      // 缺失页面提示：Agent 写入中的项目「有一页显示一页」，不阻断预览
      const suffix = missing > 0 ? ` · ${missing} 页缺失（写入中？）` : "";
      showToast(`已加载 · ${state.deck.pages.length} 页 · 主题已应用${suffix}`, "info");
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
