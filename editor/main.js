// ============================================================================
// main.js — 入口（组合根）
// ----------------------------------------------------------------------------
// 编辑器装配：把 state / api / controller / props / view / io /
// toolbar / keyboard 组装起来并启动。业务逻辑都在对应模块里：
//   app/state.js    状态 + 纯模型操作
//   app/view/view.js     渲染编排（画布/缩略条/面板/快速条）
//   app/project/io.js       加载/保存/导出/图片
//   app/toolbar.js  顶栏 + 添加菜单
//   app/keyboard.js 全局快捷键
//   types/          元素类型注册表（新增元素类型入口）
// ============================================================================

import { createEditorState } from "./app/state.js";
import { createEditorApi } from "./app/api.js";
import { createView } from "./app/view/view.js";
import { createIo } from "./app/project/io.js";
import { bindToolbar } from "./app/toolbar.js";
import { bindKeyboard } from "./app/keyboard.js";
import { createPresent } from "./app/present.js";
import { showToast } from "./app/toast.js";
import { createCanvasController } from "./interaction/canvas.js";
import { createStageController } from "./interaction/stage.js";
import { makeZoomCtlDraggable } from "./app/view/zoom-ctl.js";
import { bindProperties } from "./interaction/properties.js";
import { createDeck, createPage } from "./core/model.js";
import { normalizeTheme } from "./core/theme.js";

const $ = (id) => document.getElementById(id);

// 仓库根 URL（本文件位于 <root>/editor/，../ 即站点根）
const ROOT = new URL("../", import.meta.url).href;

// ----------------------------------------------------------------------------
// 编辑器装配（懒初始化：进入 #edit 才执行，画廊模式零开销）
// ----------------------------------------------------------------------------
let editorReady = false;
let io = null;

function initEditor(deckUrl) {
  if (editorReady) {
    // 已装配：仅切换项目
    if (deckUrl) {
      io.loadDeck(deckUrl).catch((err) => {
        showToast(`加载失败: ${err.message}`, "danger");
        console.error(err);
      });
    }
    return;
  }
  editorReady = true;

  const { state, page, selected, ops } = createEditorState();

  const api = createEditorApi({ state, page, selected, ops });

  // 元素手势执行器（拖动/缩放/旋转；不含视口手势，见下方 stage 路由器）
  const controller = createCanvasController($("canvas"), { ...api });

  const props = bindProperties($("props"), api);
  const view = createView({ state, page, selected, api, controller, props });
  api.bind({ controller, view });

  // 舞台手势路由器：视口平移/缩放（空白拖动、空格/中键、滚轮、捏合）
  // + 元素手势分发 + 点击空白取消选中 + 双击（元素进编辑 / 空白还原视图）
  createStageController($("stage"), {
    element: controller,
    select: api.select,
    getSelected: api.getSelected,
    deselect: () => api.select(null),
    onActivate: (id) => {
      // 双击：图表/表格进入数据编辑
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
  // 缩放控件：拖拽换位（位置持久化，双击百分比归位）
  makeZoomCtlDraggable($("stage"), $("zoom-ctl"));

  io = createIo({ state, view }); // 模块级 io：二次进入时复用（loadDeck）
  api.fontOptions = () => io.fontManager.fontOptions(); // 元素字体下拉选项（延迟绑定，运行时取）

  // 放映模式（顶栏「放映」按钮 + F5 进入；present 暴露在 api 上供测试）
  const present = createPresent({ state, view });
  api.present = present;
  view.afterRender = () => {
    io.renderStatusBar(); // 状态栏（dirty 圆点等）随每次渲染刷新
    present.sync(); // 放映中：实时刷新/窗口缩放时同步当前放映页
  };
  bindToolbar({ state, page, api, view, io, present });
  bindKeyboard({ state, api, io, present });

  // 实时刷新（统一项目模式）：本地挂载时订阅 server 推送；部署模式自动不启用
  io.connectLiveReload();

  // 调试/测试钩子（冒烟测试与浏览器控制台排查用）
  window.__pptdEditor = api;
  window.__pptdIo = io;
  // resize：rAF 防抖 + 全量渲染（跨断点拖动窗口时缩略图尺寸 / 快速条定位同步）
  let resizeRaf = 0;
  window.addEventListener("resize", () => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => view.render());
  });

  if (deckUrl) {
    io.loadDeck(deckUrl).catch((err) => {
      showToast(`加载失败: ${err.message}`, "danger");
      console.error(err);
    });
  } else {
    // 空白编辑器：新建空白项目（一页空白 content），用户从零开始
    state.deck = createDeck({ title: "未命名演示文稿" });
    state.deck.pages.push(createPage({ pageType: "content" }));
    state.theme = normalizeTheme(null);
    view.render();
    showToast("已新建空白演示", "info");
  }
}

// ----------------------------------------------------------------------------
// 启动：?deck= 加载指定项目；否则空白编辑器（新建空演示）
// ----------------------------------------------------------------------------
function boot() {
  // 兼容旧分享链接 #edit?deck=xxx → 转为 query 参数
  if (location.hash.startsWith("#edit")) {
    const q = new URLSearchParams(location.hash.slice(5)).get("deck");
    if (q) {
      location.replace("?deck=" + encodeURIComponent(q));
      return;
    }
  }
  const params = new URLSearchParams(location.search);
  const deckParam = params.get("deck");
  const deckUrl = deckParam ? (/^https?:/.test(deckParam) ? deckParam : new URL(deckParam, ROOT).href) : null;
  if (params.get("shot") === "1") {
    // 无头截图模式（open-pptd render 使用）：跳过编辑器 UI，只渲染页面
    import("./app/shot.js")
      .then((m) => m.initShot(deckUrl))
      .catch((err) => {
        console.error("[shot] 初始化失败:", err);
        document.title = "PPTD_ERROR";
      });
    return;
  }
  initEditor(deckUrl);
}

boot();
