// ============================================================================
// interaction/dialogs/icon-editor.js — icon picker (search + FA official categories + lazy grid)
// ----------------------------------------------------------------------------
// Data source: assets/icons/registry.json (Font Awesome Free, ~2000 icons).
// Thumbnails are fetched on demand via ensureIcon (local/CDN + Cache API, the
// same preload chain as the editor).
// ============================================================================

import { showDialog } from "./base.js";
import { getIconRegistry, ensureIcon, queryIconEntries } from "../../app/project/icons.js";
import { iconThumb } from "../../../packages/renderer/index.js";

/** First-render cap (a full 2000+ grid would jank; typing a keyword or picking a category widens the range). */
const RENDER_CAP = 96;

/**
 * Render the icon browser (search box + category sidebar + result grid).
 * @param {HTMLElement} mount mount container
 * @param {object} opts { current current iconName, onPick(rawIconName) }
 */
async function renderIconBrowser(mount, { current = null, onPick } = {}) {
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

  // Category sidebar: all + FA official categories (label-sorted, with counts)
  const catIds = Object.keys(registry.cats).sort((a, b) =>
    String(registry.cats[a]).localeCompare(String(registry.cats[b]))
  );
  let activeCat = null; // null = all

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
      // Lazy thumbnail (renders synchronously when the editor's iconMap cache hits)
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
 * Open the icon picker dialog.
 * @param {object} opts { current current iconName, onPick(rawIconName) }
 */
export function openIconPicker(opts = {}) {
  const root = document.createElement("div");
  showDialog("选择图标", root, { onDone: () => {} });
  renderIconBrowser(root, opts);
}
