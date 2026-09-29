// ============================================================================
// app/toolbar.js — binding for the topbar / add menu (+) / thumbnail-bar buttons
// ----------------------------------------------------------------------------
// The add menu is fully driven by the type registry (aggregated in types/menu.js):
// a new element type shows up in the menu automatically, no code change here.
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

export function bindToolbar({ state, page, api, view, io, present, themeMode = null }) {
  const disposers = []; // destroy set for child bindings (menus/popovers)
  let mainMenu = null;
  /** Add an element to the current page and select it; charts/tables go straight into the data editor (a just-picked icon does not reopen the picker). */
  function addElement(element) {
    api.beginChange();
    page().elements.push(element);
    state.selectedId = element.elementId;
    view.render();
    if (element.elementType !== "icon") api.openEditor(element);
  }

  // --------------------------------------------------------------------------
  // Add panel (interaction/add-menu.js: tabs + categories + search + recent)
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
  // File menu (shared shell app/file-menu.js; editor content: new/open/recent/save/export)
  // --------------------------------------------------------------------------
  function bindFileMenu() {
    /** Unsaved-changes confirmation before switching/opening a project (hosts can override dialogs). */
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

    /** Open a recent project; on a stale handle, drop it from the recent list. */
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
  // --------------------------------------------------------------------------
  // Topbar buttons
  // --------------------------------------------------------------------------
  function bindTopbar() {
    const clickEls = []; // elements given an onclick, cleared together on destroy
    const on = (el, fn) => {
      el.onclick = fn;
      clickEls.push(el);
    };

    on(dom.btnAddPage, () => api.addPage());

    on(dom.btnUndo, () => io.applyHistory(state.history.undo(state.deck)));
    on(dom.btnRedo, () => io.applyHistory(state.history.redo()));

    bindFileMenu();
    const fp = bindFontPanel({ state, io, anchor: dom.btnFonts });
    if (fp?.destroy) disposers.push(fp.destroy);
    on(dom.btnPresent, () => present.start());

    // Theme popover (preset swatches + semantic-color editing + appearance tri-state; the B3 mode entry lives in this panel)
    const tp = bindThemePanel({ state, api, io, anchor: dom.btnTheme, themeMode });
    if (tp?.destroy) disposers.push(tp.destroy);

    // Property drawer collapse / expand (one logic for desktop and narrow, behavior differs by breakpoint):
    //   desktop (>900px): persistent right panel, collapsed = body.inspector-collapsed
    //   narrow (≤900px): bottom sheet, open = body.inspector-open
    //   canvas top-right entry button + panel-head button + desktop floating handle share this toggle
    const toggleInspector = () => {
      if (isNarrow()) {
        document.body.classList.toggle("inspector-open");
      } else {
        document.body.classList.toggle("inspector-collapsed");
        // Desktop: sync canvas zoom every frame during the width animation so the canvas doesn't detach from the stage
        view.followStageWidth();
      }
      view.renderCanvas();
    };
    on(dom.btnInspectorToggle, toggleInspector);
    on(dom.btnInspectorOpen, toggleInspector);
    // Narrow: tapping the mask closes the bottom sheet
    on(dom.inspectorMask, () => document.body.classList.remove("inspector-open"));

    // Canvas zoom control (same on both ends: buttons + percentage display)
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
