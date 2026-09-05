// ============================================================================
// interaction/dialogs/icon-editor.js — 图标选择器（搜索 + FA 官方分类 + 懒加载网格）
// ----------------------------------------------------------------------------
// 数据源 assets/icons/registry.json（Font Awesome Free，约 2000 图标）；
// 缩略图经 ensureIcon 按需取 SVG（本地/CDN + Cache API，同编辑器预读链）。
// ============================================================================

import { showDialog } from "./base.js";
import { iconThumb } from "../../../packages/renderer/icon.js";
import { getIconRegistry, ensureIcon, queryIconEntries } from "../../app/project/icons.js";

/** 首屏渲染上限（全量 2000+ 网格会卡；输入关键词/选分类后缩小范围全渲染）。 */
const RENDER_CAP = 96;

/**
 * 渲染图标浏览器（搜索框 + 分类侧栏 + 结果网格）。
 * @param {HTMLElement} mount 挂载容器
 * @param {object} opts { current 当前 iconName, onPick(rawIconName) }
 */
export async function renderIconBrowser(mount, { current = null, onPick } = {}) {
  mount.innerHTML = "";
  const registry = await getIconRegistry();

  const root = document.createElement("div");
  root.className = "icon-picker";
  const search = document.createElement("input");
  search.type = "text";
  search.className = "icon-search";
  search.placeholder = "搜索 Font Awesome 图标（如 rocket / chart / github）…";
  root.appendChild(search);

  const browser = document.createElement("div");
  browser.className = "icon-browser";
  const sidebar = document.createElement("div");
  sidebar.className = "icon-cats";
  const gridWrap = document.createElement("div");
  gridWrap.className = "icon-grid-wrap";
  browser.append(sidebar, gridWrap);
  root.appendChild(browser);
  mount.appendChild(root);

  // 分类侧栏：全部 + FA 官方分类（label 排序，计数）
  const catIds = Object.keys(registry.cats).sort((a, b) =>
    String(registry.cats[a]).localeCompare(String(registry.cats[b]))
  );
  let activeCat = null; // null = 全部

  function renderSidebar() {
    sidebar.innerHTML = "";
    const mk = (id, label, count) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "icon-cat" + (activeCat === id ? " active" : "");
      b.textContent = `${label}${count != null ? ` (${count})` : ""}`;
      b.onclick = () => {
        activeCat = id;
        renderSidebar();
        renderGrid();
      };
      sidebar.appendChild(b);
    };
    mk(null, "全部", registry.icons.length);
    for (const id of catIds) {
      const count = registry.icons.filter((i) => i.cat === id).length;
      if (count) mk(id, registry.cats[id], count);
    }
  }

  function renderGrid() {
    const { entries, total } = queryIconEntries(registry, { q: search.value, cat: activeCat, cap: RENDER_CAP });
    gridWrap.innerHTML = "";
    const note = document.createElement("div");
    note.className = "icon-count";
    note.textContent = total > entries.length
      ? `${total} 个匹配，显示前 ${entries.length} 个——输入更精确的关键词缩小范围`
      : `${total} 个图标`;
    gridWrap.appendChild(note);

    const grid = document.createElement("div");
    grid.className = "icon-grid";
    for (const item of entries) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "icon-cell" + (item.raw === current ? " active" : "");
      btn.title = item.raw;
      btn.onclick = () => {
        onPick?.(item.raw);
        btn.closest(".dialog-overlay")?.remove();
      };
      grid.appendChild(btn);
      // 懒加载缩略图（命中编辑器 iconMap 缓存则同步渲染）
      ensureIcon(item.raw).then((def) => {
        if (def && btn.isConnected) btn.innerHTML = iconThumb(def);
      });
    }
    gridWrap.appendChild(grid);
    if (!total) {
      const empty = document.createElement("div");
      empty.className = "icon-empty";
      empty.textContent = "没有匹配的图标（命名以 fontawesome.com/search?ic=free 为准）";
      gridWrap.appendChild(empty);
    }
  }

  search.addEventListener("input", () => renderGrid());
  renderSidebar();
  renderGrid();
  search.focus();
}

/**
 * 打开图标选择器对话框。
 * @param {object} opts { current 当前 iconName, onPick(rawIconName) }
 */
export function openIconPicker(opts = {}) {
  const root = document.createElement("div");
  showDialog("选择图标", root, { onDone: () => {} });
  renderIconBrowser(root, opts);
}
