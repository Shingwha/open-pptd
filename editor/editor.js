// ============================================================================
// editor/editor.js — createEditor：可挂载、可销毁的编辑器实例（契约 1）
// ----------------------------------------------------------------------------
// 把原 main.js 顶层 boot()/initEditor() 的装配逻辑整体搬入并闭包化：
//   createEditor(rootEl, { source, deck?, deckUrl?, theme?, chrome?, dialogs?, locale?, on? })
//     → { ready, destroy, api, io, state, view }
//
// rootEl 是挂载点：dom 引用优先落在它的子树内，未命中的 id 回退 document
// （静态骨架仍在 index.html；嵌入式可传空容器）。destroy() 幂等：移除本实例
// 创建/接管的 DOM、解绑全部 window/document 监听、关闭推送通道、释放图表实例、
// 清空 dom 缓存并还原主题与对话框默认实现。
//
// 对外行为零变化：standalone 的 main.js 仍以 ?deck= 打开、?shot=1 截图、
// window.__pptdEditor/__pptdIo 由 main.js 继续暴露。
// ============================================================================

import { createEditorState } from "./app/state.js";
import { createEditorApi } from "./app/api.js";
import { createView } from "./app/view/view.js";
import { createIo } from "./app/project/io.js";
import { bindToolbar } from "./app/toolbar.js";
import { bindKeyboard } from "./app/keyboard.js";
import { createPresent } from "./app/present.js";
import { clearToasts } from "./app/toast.js";
import { createCanvasController } from "./interaction/canvas.js";
import { createStageController } from "./interaction/stage.js";
import { bindContextMenu } from "./interaction/contextmenu.js";
import { makeZoomCtlDraggable } from "./app/view/zoom-ctl.js";
import { bindProperties } from "./interaction/properties.js";
import { injectIcons } from "./icons.js";
import { dom } from "./dom.js";
import { applyThemeTokens, bindThemeMode } from "./theme.js";
import { configureDialogs, resetDialogs } from "./dialogs.js";
import { closeAllDialogs } from "./interaction/dialogs/base.js";
import { disposeChartInstances } from "../packages/renderer/index.js";

// chrome 预设：embedded = 裁剪宿主敌意的外链导航（品牌回画廊 / GitHub 新窗口）
const CHROME_PRESETS = {
  full: null,
  embedded: { topbar: true, brand: false, github: false, thumbbar: true, quickbar: true, zoom: true, inspector: true },
};

/**
 * 在 rootEl 上装配一个编辑器实例。
 * @param {HTMLElement} rootEl 挂载点
 * @param {object} options
 *   source*    ProjectSource（必填）
 *   deck?      { manifestText, pageFiles, manifestPath? } 初始文档（省略则读 source）
 *   deckUrl?   经 source.read(deckUrl) 加载的项目 URL（standalone 的 ?deck= 用）
 *   theme?     { tokens?: Record<string,string>, mode?: "light"|"dark" }
 *   chrome?    "full" | "embedded" | { topbar?, brand?, github?, thumbbar?, quickbar?, zoom?, inspector? }
 *   dialogs?   宿主实现 { alert, confirm }（覆盖原生弹窗，见 editor/dialogs.js）
 *   locale?    "zh-CN"（默认；当前无 i18n 资源，仅记录）
 *   on?        { ready?, dirty?, saved?, error?, deckChange?, selectionChange? }
 * @returns {{ ready: Promise<void>, destroy(): void, api: object, io: object, state: object, view: object }}
 */
export function createEditor(rootEl, options = {}) {
  const {
    source,
    deck = null,
    deckUrl = null,
    theme = null,
    chrome = "full",
    dialogs: dialogsImpl = null,
    locale = "zh-CN",
    on = {},
  } = options;

  if (!source) throw new Error("createEditor: options.source（ProjectSource）为必填");
  const mount = rootEl || (typeof document !== "undefined" ? document.body : null);
  if (!mount) throw new Error("createEditor: 需要可用的 rootEl");

  // 挂载点作用域（未命中 id 回退 document，见 dom.js）
  dom.rebind(mount);
  injectIcons(mount);
  if (dialogsImpl) configureDialogs(dialogsImpl);

  const disposers = [];
  let destroyed = false;

  // --------------------------------------------------------------------------
  // 主题注入（契约 3）：mode/tokens 落到共同祖先（骨架在 body，挂载点可为空容器）
  // --------------------------------------------------------------------------
  const themeHost =
    mount.contains && mount.contains(document.getElementById("editor-app"))
      ? mount
      : document.documentElement;
  const restoreTheme = theme ? applyThemeTokens(themeHost, theme) : null;

  // 三态主题（B3：浅 / 深 / 跟随系统）：宿主注入 mode 时交给宿主（注入优先于内置板），
  // 否则编辑器自管（localStorage 持久化 + prefers-color-scheme 跟随，落在 data-pptd-theme）
  const themeMode = theme?.mode ? null : bindThemeMode();
  disposers.push(() => themeMode?.destroy());

  // --------------------------------------------------------------------------
  // 装配（原 main.js initEditor 的闭包化）
  // --------------------------------------------------------------------------
  const { state, page, selected, selectedElements, groupOf, ops } = createEditorState();
  const api = createEditorApi({ state, page, selected, selectedElements, ops });

  // 对外事件：dirty/selectionChange 在每次渲染后按状态变化派发
  let lastDirty = null;
  let lastSelected = null;
  const emitEvents = () => {
    if (state.dirty !== lastDirty) {
      lastDirty = state.dirty;
      try {
        on.dirty?.(state.dirty);
      } catch (err) {
        console.warn("[editor] on.dirty 回调异常:", err?.message || err);
      }
    }
    if (state.selectedId !== lastSelected) {
      lastSelected = state.selectedId;
      try {
        on.selectionChange?.(state.selectedId);
      } catch (err) {
        console.warn("[editor] on.selectionChange 回调异常:", err?.message || err);
      }
    }
  };

  // 元素手势执行器（拖动/缩放/旋转；不含视口手势，见 stage 路由器）
  const controller = createCanvasController(dom.canvas, { ...api });

  const props = bindProperties(dom.props, api);
  const view = createView({ state, page, selected, api, controller, props });
  api.bind({ controller, view });
  disposers.push(() => view.destroy?.());

  // 舞台手势路由器：视口平移/缩放 + 元素手势分发 + 点击空白取消选中 + 双击
  const stage = createStageController(dom.stage, {
    element: controller,
    select: api.select,
    getSelected: api.getSelected,
    isSelected: api.isSelected,
    deselect: () => api.select(null),
    onActivate: (id) => {
      const el = page().elements.find((e) => e.elementId === id);
      if (!el) return;
      ops.beginChange();
      api.openEditor(el);
    },
    panBy: (dx, dy) => view.panBy(dx, dy),
    setZoom: (z, anchor) => view.setZoom(z, anchor),
    getZoom: () => view.getZoom(),
    zoomReset: () => view.zoomReset(),
  });
  disposers.push(() => stage.destroy?.());

  // 画布右键上下文菜单（三态：单选 / 多选 / 空白页级）
  const contextMenu = bindContextMenu({ stage: dom.stage, api, state, page, groupOf, view });
  disposers.push(() => contextMenu.destroy?.());

  // 缩放控件：拖拽换位（位置持久化，双击百分比归位）
  const zoomCtl = makeZoomCtlDraggable(dom.stage, dom.zoomCtl);
  disposers.push(() => zoomCtl.destroy?.());

  const io = createIo({
    state,
    view,
    source,
    onSaved: () => {
      try {
        on.saved?.();
      } catch (err) {
        console.warn("[editor] on.saved 回调异常:", err?.message || err);
      }
    },
    onDeckChange: (d) => {
      try {
        on.deckChange?.(d);
      } catch (err) {
        console.warn("[editor] on.deckChange 回调异常:", err?.message || err);
      }
    },
    onError: (err) => {
      try {
        on.error?.(err);
      } catch (e) {
        console.warn("[editor] on.error 回调异常:", e?.message || e);
      }
    },
  });
  api.fontOptions = () => io.fontManager.fontOptions(); // 元素字体下拉选项（延迟绑定）

  // 放映模式（顶栏「放映」按钮 + F5 进入）
  const present = createPresent({ state, view });
  api.present = present;
  disposers.push(() => present.destroy?.());

  view.afterRender = () => {
    ops.syncDirty(); // 撤销/重做、内容改回保存值后重算 dirty
    io.renderStatusBar(); // 状态栏（dirty 圆点等）随每次渲染刷新
    present.sync(); // 放映中：实时刷新/窗口缩放时同步当前放映页
    emitEvents();
  };

  const toolbar = bindToolbar({ state, page, api, view, io, present, themeMode });
  disposers.push(() => toolbar.destroy?.());
  const keyboard = bindKeyboard({ state, api, io, present });
  disposers.push(() => keyboard.destroy?.());
  disposers.push(() => props.destroy?.());
  disposers.push(() => controller.destroy?.());

  // 实时刷新（统一项目模式）：项目就绪后订阅推送/轮询
  io.connectLiveReload();

  // resize：rAF 防抖 + 全量渲染（跨断点拖动窗口时缩略图尺寸 / 快速条定位同步）
  const resizeAc = new AbortController();
  let resizeRaf = 0;
  window.addEventListener(
    "resize",
    () => {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => view.render());
    },
    { signal: resizeAc.signal }
  );

  // chrome 裁剪（embedded/对象态）：隐藏宿主敌意的外链导航与指定区域
  const chromeHidden = applyChrome(mount, chrome);

  // --------------------------------------------------------------------------
  // 初始加载：deck → 直接用；deckUrl → read(url)；都省略 → 按契约走 source.read()
  // （source.read 失败 = 无既定项目 → 静默空白，与既有 initEditor(null) 一致）
  // --------------------------------------------------------------------------
  const ready = bootstrap().then(() => {
    if (destroyed) return;
    try {
      on.ready?.(instance);
    } catch (err) {
      console.warn("[editor] on.ready 回调异常:", err?.message || err);
    }
  });

  async function bootstrap() {
    if (deck) {
      await io.loadDeckData(deck, { silent: true });
      return;
    }
    if (deckUrl) {
      try {
        await io.loadDeck(deckUrl);
      } catch (err) {
        console.error(err);
        showLoadError(err);
      }
      return;
    }
    try {
      const data = await source.read();
      await io.loadDeckData(data, { silent: true });
    } catch {
      // 无既定项目：空白编辑器（与「文件 → 新建空白」同一路径）
      await io.newProject({ toast: false });
    }
  }

  function showLoadError(err) {
    on.error?.(err);
    if (dom.canvasLoading) dom.canvasLoading.hidden = true; // 撤掉启动遮罩，露出错误态
  }

  // --------------------------------------------------------------------------
  // chrome 裁剪
  // --------------------------------------------------------------------------
  function applyChrome(hostEl, spec) {
    const obj = spec === "embedded" ? CHROME_PRESETS.embedded : spec === "full" || !spec ? null : spec;
    if (!obj) return [];
    const q = (sel) => hostEl.querySelector?.(sel) || document.querySelector(sel);
    const map = {
      topbar: () => q(".topbar"),
      brand: () => q(".brand-home"),
      github: () => q(".topbar-actions a[href^='http']"),
      thumbbar: () => q("footer.thumbbar"),
      quickbar: () => q("#quickbar"),
      zoom: () => q("#zoom-ctl"),
      inspector: () => q("aside.inspector"),
    };
    const hidden = [];
    for (const [key, pick] of Object.entries(map)) {
      if (obj[key] === false) {
        const el = pick();
        if (el) {
          hidden.push([el, el.style.display]);
          el.style.display = "none";
        }
      }
    }
    return hidden;
  }

  // --------------------------------------------------------------------------
  // destroy（幂等）
  // --------------------------------------------------------------------------
  function destroy() {
    if (destroyed) return;
    destroyed = true;

    // 1) 子绑定（键盘/舞台/工具栏/浮层/子控制器）逐项释放
    for (const d of disposers.splice(0)) {
      try {
        d();
      } catch (err) {
        console.warn("[editor] destroy 子项异常:", err?.message || err);
      }
    }
    // 2) 实时通道 + 状态栏按钮监听
    try {
      io.destroy?.();
    } catch (err) {
      console.warn("[editor] destroy io 异常:", err?.message || err);
    }
    // 3) window 级监听与 rAF
    resizeAc.abort();
    cancelAnimationFrame(resizeRaf);
    // 4) 图表实例（画布）+ 动态 DOM 清理
    try {
      disposeChartInstances(dom.canvas);
    } catch {
      /* 画布已不在文档中 */
    }
    closeAllDialogs();
    clearToasts();
    if (dom.quickbar) dom.quickbar.innerHTML = "";
    // 5) chrome 隐藏还原
    for (const [el, prev] of chromeHidden) el.style.display = prev || "";
    // 6) 主题还原
    restoreTheme?.();
    resetDialogs();
    // 7) 挂载点是独立容器（非 body/html）时清空其内容
    if (mount && mount !== document.body && mount !== document.documentElement) {
      try {
        if (mount.contains(document.getElementById("editor-app"))) mount.innerHTML = "";
      } catch {
        /* 忽略 */
      }
    }
    // 8) dom 缓存还原到 document 级默认实例
    dom.clear();
    dom.rebind(document);
  }

  const instance = { ready, destroy, api, io, state, view };
  return instance;
}
