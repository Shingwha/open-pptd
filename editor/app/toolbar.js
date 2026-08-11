// ============================================================================
// app/toolbar.js — 顶栏 / 添加菜单（＋）/ 缩略条按钮的绑定
// ----------------------------------------------------------------------------
// 添加菜单完全由类型注册表驱动（types/menu.js 聚合），新增元素类型后
// 菜单自动出现，无需在此改任何代码。
// ============================================================================

import { createPage } from "../core/model.js";
import { buildAddItems, buildAddMenu } from "../types/index.js";
import { bindThemePanel } from "../interaction/theme-panel.js";

export function bindToolbar({ state, page, api, view, io }) {
  const $ = (id) => document.getElementById(id);

  /** 添加元素到当前页并选中；图表/表格直接进数据编辑（图标刚选完，不再弹选择器）。 */
  function addElement(element) {
    api.beginChange();
    page().elements.push(element);
    state.selectedId = element.elementId;
    view.render();
    if (element.elementType !== "icon") api.openEditor(element);
  }

  // --------------------------------------------------------------------------
  // 添加菜单（右下角 ＋）
  // --------------------------------------------------------------------------
  function bindAddMenu() {
    const fab = $("btn-add");
    const menu = $("add-menu");
    const addItems = buildAddItems();
    const addApi = { addElement, rebuildImageMap: io.rebuildImageMap };

    menu.innerHTML = "";
    for (const { group, ids } of buildAddMenu()) {
      const title = document.createElement("div");
      title.className = "add-group-title";
      title.textContent = group;
      menu.appendChild(title);
      const grid = document.createElement("div");
      grid.className = "add-grid";
      for (const id of ids) {
        const item = addItems[id];
        if (!item) continue;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "add-item";
        btn.innerHTML =
          `${item.icon}<span class="add-item-name">${item.label}</span>` +
          (item.desc ? `<span class="add-item-desc">${item.desc}</span>` : "");
        btn.onclick = () => {
          menu.classList.remove("open");
          fab.classList.remove("active");
          if (item.onClick) item.onClick(addApi);
          else if (item.create) addApi.addElement(item.create());
        };
        grid.appendChild(btn);
      }
      menu.appendChild(grid);
    }

    fab.onclick = (e) => {
      e.stopPropagation();
      const open = menu.classList.toggle("open");
      fab.classList.toggle("active", open);
    };
    document.addEventListener("click", (e) => {
      if (!menu.contains(e.target) && e.target !== fab) {
        menu.classList.remove("open");
        fab.classList.remove("active");
      }
    });
  }

  // --------------------------------------------------------------------------
  // 顶栏按钮
  // --------------------------------------------------------------------------
  function bindTopbar() {
    $("btn-add-page").onclick = () => {
      api.beginChange();
      state.deck.pages.push(createPage({}));
      state.currentPage = state.deck.pages.length - 1;
      state.selectedId = null;
      view.render();
    };

    $("btn-undo").onclick = () => io.applyHistory(state.history.undo(state.deck));
    $("btn-redo").onclick = () => io.applyHistory(state.history.redo());

    $("btn-export").onclick = io.exportPptx;
    $("btn-save").onclick = io.saveProject;
    $("btn-fonts").onclick = () => io.fontManager.openManagerDialog();

    // 配色浮层（预设色卡 + 语义色编辑）
    bindThemePanel({ state, api, io, anchor: $("btn-theme") });

    // 属性抽屉收起 / 展开（双端统一逻辑，行为随断点不同）：
    //   桌面（>900px）：右侧常驻面板，收起 = body.inspector-collapsed
    //   窄屏（≤900px）：底部弹起 sheet，展开 = body.inspector-open
    //   画布右上角入口按钮 + 面板头按钮 + 桌面悬浮把手共用同一 toggle
    const isNarrow = () => window.matchMedia("(max-width: 900px)").matches;
    const toggleInspector = () => {
      if (isNarrow()) {
        document.body.classList.toggle("inspector-open");
      } else {
        document.body.classList.toggle("inspector-collapsed");
        // 桌面：宽度动画期间逐帧同步画布缩放，避免画布尺寸与舞台脱节（突变）
        view.followStageWidth();
      }
      view.renderCanvas();
    };
    $("btn-inspector-toggle").onclick = toggleInspector;
    $("btn-inspector-open").onclick = toggleInspector;
    // 窄屏：遮罩点击关闭底部 sheet
    $("inspector-mask").onclick = () => document.body.classList.remove("inspector-open");

    // 画布缩放控件（双端统一：按钮 + 百分比显示）
    $("btn-zoom-out").onclick = () => view.zoomOut();
    $("btn-zoom-in").onclick = () => view.zoomIn();
    $("btn-zoom-reset").onclick = () => view.zoomReset();
  }

  bindAddMenu();
  bindTopbar();
}
