// editor/app/toolbar.js — binding for the topbar / add control / thumbnail-bar buttons
// Covers file menu, design, present, undo/redo, add, page menu and zoom. The add menu
// itself lives in interaction/add-menu.js (six types; shape/line expand variants).

import { createFileMenu } from "./file-menu.js";
import { bindPageMenu } from "./page-menu.js";
import { bindAddMenu } from "../interaction/add-menu.js";
import { pickLocalImage } from "../types/image.js";
import { createDesignPanelService } from "../interaction/design-panel-lazy.js";
import { removeRecent } from "./project/handle-store.js";

export function bindToolbar({ state, api, view, io, present, themeMode = null, ui }) {
  const { dom, toast, dialogs } = ui;
  const designPanel = createDesignPanelService(ui);
  const disposers = []; // destroy set for child bindings (menus/popovers)
  let mainMenu = null;

  // File menu (shared shell app/file-menu.js; editor content: new/open/recent/save/export)
  function bindFileMenu() {
    /** Unsaved-changes confirmation before switching/opening a project (hosts can override dialogs). */
    const confirmDiscard = async () =>
      !state.dirty || (await dialogs.confirm("编辑器有未保存的修改，切换项目将放弃这些修改。确定继续？"));

    async function openLocal() {
      if (!(await confirmDiscard())) return;
      try {
        await io.openLocalProject();
      } catch (err) {
        toast.show(`打开失败: ${err.message}`, "danger");
      }
    }

    /** Open a recent project; on a stale handle, drop it from the recent list. */
    async function openRecent(entry) {
      if (!(await confirmDiscard())) return;
      try {
        await io.openProjectHandle(entry.handle);
      } catch (err) {
        toast.show(`打开失败: ${err.message}`, "danger");
        await removeRecent(entry.id);
      }
    }

    mainMenu = createFileMenu(dom.btnFile, async ({ menu, item, sep, appendRecents }) => {
      // "New blank deck" carries its own dirty confirmation, so it skips confirmDiscard
      menu.appendChild(item("新建空白演示", { onClick: () => io.newProject() }));
      const openItem = item("打开本地项目", { onClick: openLocal });
      if (!window.showDirectoryPicker) openItem.hidden = true; // not shown in unsupported browsers
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

  // Topbar buttons
  function bindTopbar() {
    const clickEls = []; // elements given an onclick, cleared together on destroy
    const dblEls = []; // elements given an ondblclick, cleared together on destroy
    const on = (el, fn) => {
      if (!el) return;
      el.onclick = fn;
      clickEls.push(el);
    };
    const onDbl = (el, fn) => {
      if (!el) return;
      el.ondblclick = fn;
      dblEls.push(el);
    };

    on(dom.btnUndo, () => io.applyHistory(state.history.undo(state.deck)));
    on(dom.btnRedo, () => io.applyHistory(state.history.redo()));
    bindFileMenu();
    on(dom.btnPresent, () => present.start());

    // Thumbnail bar: ＋ inserts after the current page; the page menu owns the rest
    on(dom.btnAddPage, () => api.insertPage(state.currentPage + 1));

    // Canvas zoom control (inline group at the right end of the thumb bar)
    on(dom.btnZoomOut, () => view.zoomOut());
    on(dom.btnZoomIn, () => view.zoomIn());
    on(dom.btnZoomReset, () => view.zoomReset());
    // Percentage label: double-click restores the fit view
    onDbl(dom.zoomLabel, () => view.zoomReset());

    return () => {
      for (const el of clickEls) if (el) el.onclick = null;
      for (const el of dblEls) if (el) el.ondblclick = null;
    };
  }

  // Add control (six add-menu types) + page menu + Design panel (lazy)
  function bindAddMenuUI() {
    const h = bindAddMenu({
      fab: dom.btnAdd,
      menu: dom.addList,
      onAdd: (type, variant) => {
        if (type === "image") pickLocalImage({ api, ui });
        else api.addElementOfType(type, variant);
      },
    });
    if (h?.destroy) disposers.push(h.destroy);
  }

  function bindPageMenuUI() {
    const h = bindPageMenu({ api, state, anchor: dom.btnPageMenu });
    if (h?.destroy) disposers.push(h.destroy);
  }

  function bindDesignButton() {
    if (!dom.btnDesign) return;
    const ac = new AbortController();
    const open = (tab = "colors") => {
      designPanel.open({ state, api, io, themeMode, tab }).catch((err) =>
        toast.show(`打开设计面板失败: ${err.message}`, "danger")
      );
    };
    dom.btnDesign.onclick = () => open("colors");
    // Cross-module entry: the PPTX export dialog's "字体管理…" jumps to Design > 字体
    window.addEventListener("pptd:open-design", (e) => open(e.detail?.tab || "colors"), { signal: ac.signal });
    disposers.push(() => {
      ac.abort();
      if (dom.btnDesign) dom.btnDesign.onclick = null;
      designPanel.destroy();
    });
  }

  const unbindTopbar = bindTopbar();
  bindAddMenuUI();
  bindPageMenuUI();
  bindDesignButton();

  return {
    /** Release: unbind every child binding (menus/popovers/topbar buttons). */
    destroy() {
      for (const d of disposers.splice(0)) {
        try {
          d();
        } catch {
          /* a failed child teardown must not block the rest */
        }
      }
      mainMenu?.destroy?.();
      mainMenu = null;
      unbindTopbar?.();
    },
  };
}
