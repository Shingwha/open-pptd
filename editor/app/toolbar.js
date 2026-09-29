// ============================================================================
// app/toolbar.js — 顶栏 / 添加菜单（＋）/ 缩略条按钮的绑定
// ----------------------------------------------------------------------------
// 添加菜单完全由类型注册表驱动（types/menu.js 聚合），新增元素类型后
// 菜单自动出现，无需在此改任何代码。
// ============================================================================

import { bindAddMenu } from "../interaction/add-menu.js";
import { bindThemePanel } from "../interaction/theme-panel.js";
import { bindFontPanel } from "../interaction/font-panel.js";
import { createFileMenu } from "./file-menu.js";
import { removeRecent } from "./project/handle-store.js";
import { showToast } from "./toast.js";
import { isNarrow } from "../ui.js";
import { dom } from "../dom.js";
import { dialogs } from "../dialogs.js";
import { createPage } from "../../packages/model/index.js";

export function bindToolbar({ state, page, api, view, io, present }) {
  const disposers = []; // 子绑定（菜单/浮层）的 destroy 集合
  let mainMenu = null;
  /** 添加元素到当前页并选中；图表/表格直接进数据编辑（图标刚选完，不再弹选择器）。 */
  function addElement(element) {
    api.beginChange();
    page().elements.push(element);
    state.selectedId = element.elementId;
    view.render();
    if (element.elementType !== "icon") api.openEditor(element);
  }

  // --------------------------------------------------------------------------
  // 添加面板（interaction/add-menu.js：Tab + 分类 + 搜索 + 最近使用）
  // --------------------------------------------------------------------------
  function bindAddMenuUI() {
    const h = bindAddMenu({
      fab: dom.btnAdd,
      menu: dom.addMenu,
      addApi: { addElement, rebuildImageMap: io.rebuildImageMap },
    });
    if (h?.destroy) disposers.push(h.destroy);
  }

  // --------------------------------------------------------------------------
  // 文件菜单（共用外壳 app/file-menu.js；编辑器内容：新建/打开/最近/保存/导出）
  // --------------------------------------------------------------------------
  function bindFileMenu() {
    /** 切换/打开项目前的未保存确认（宿主可覆盖 dialogs）。 */
    const confirmDiscard = async () =>
      !state.dirty || (await dialogs.confirm("编辑器有未保存的修改，切换项目将放弃这些修改。确定继续？"));

    async function openLocal() {
      if (!(await confirmDiscard())) return;
      try {
        await io.openLocalProject();
      } catch (err) {
        showToast(`打开失败: ${err.message}`, "danger");
      }
    }

    /** 打开最近项目；句柄失效时移出最近列表。 */
    async function openRecent(entry) {
      if (!(await confirmDiscard())) return;
      try {
        await io.openProjectHandle(entry.handle);
      } catch (err) {
        showToast(`打开失败: ${err.message}`, "danger");
        await removeRecent(entry.id);
      }
    }

    mainMenu = createFileMenu(dom.btnFile, async ({ menu, item, sep, appendRecents }) => {
      // 新建空白演示自带 dirty 确认，不走 confirmDiscard
      menu.appendChild(item("新建空白演示", { onClick: () => io.newProject() }));
      const openItem = item("打开本地项目", { onClick: openLocal });
      if (!window.showDirectoryPicker) openItem.hidden = true; // 不支持的浏览器不显示
      menu.appendChild(openItem);
      await appendRecents(menu, openRecent);
      menu.append(
        sep(),
        item("保存项目", { hint: "Ctrl+S", onClick: () => io.saveProject() }),
        sep(),
        item("导出幻灯片（pptx）", { onClick: () => io.exportPptx() }),
        item("导出项目文件（zip）", { onClick: () => io.exportProjectZip() }),
        item("导出图片（png）", { onClick: () => io.exportImages() })
      );
    });
  }
  // --------------------------------------------------------------------------
  // 顶栏按钮
  // --------------------------------------------------------------------------
  function bindTopbar() {
    const clickEls = []; // 记录挂过 onclick 的元素，destroy 时统一置空
    const on = (el, fn) => {
      el.onclick = fn;
      clickEls.push(el);
    };

    on(dom.btnAddPage, () => {
      api.beginChange();
      state.deck.pages.push(createPage({}));
      state.currentPage = state.deck.pages.length - 1;
      state.selectedId = null;
      view.render();
    });

    on(dom.btnUndo, () => io.applyHistory(state.history.undo(state.deck)));
    on(dom.btnRedo, () => io.applyHistory(state.history.redo()));

    bindFileMenu();
    const fp = bindFontPanel({ state, io, anchor: dom.btnFonts });
    if (fp?.destroy) disposers.push(fp.destroy);
    on(dom.btnPresent, () => present.start());

    // 配色浮层（预设色卡 + 语义色编辑）
    const tp = bindThemePanel({ state, api, io, anchor: dom.btnTheme });
    if (tp?.destroy) disposers.push(tp.destroy);

    // 属性抽屉收起 / 展开（双端统一逻辑，行为随断点不同）：
    //   桌面（>900px）：右侧常驻面板，收起 = body.inspector-collapsed
    //   窄屏（≤900px）：底部弹起 sheet，展开 = body.inspector-open
    //   画布右上角入口按钮 + 面板头按钮 + 桌面悬浮把手共用同一 toggle
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
    on(dom.btnInspectorToggle, toggleInspector);
    on(dom.btnInspectorOpen, toggleInspector);
    // 窄屏：遮罩点击关闭底部 sheet
    on(dom.inspectorMask, () => document.body.classList.remove("inspector-open"));

    // 画布缩放控件（双端统一：按钮 + 百分比显示）
    on(dom.btnZoomOut, () => view.zoomOut());
    on(dom.btnZoomIn, () => view.zoomIn());
    on(dom.btnZoomReset, () => view.zoomReset());

    return () => {
      for (const el of clickEls) if (el) el.onclick = null;
    };
  }

  const unbindTopbar = bindTopbar();
  bindAddMenuUI();

  return {
    /** 释放：解绑全部子绑定（菜单/浮层/顶栏按钮）。 */
    destroy() {
      for (const d of disposers.splice(0)) {
        try {
          d();
        } catch {
          /* 单个子绑定释放失败不阻断其余 */
        }
      }
      mainMenu?.destroy?.();
      mainMenu = null;
      unbindTopbar?.();
    },
  };
}
