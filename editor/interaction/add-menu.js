// ============================================================================
// interaction/add-menu.js — add-element panel (PowerPoint-style media library)
// ----------------------------------------------------------------------------
// Structure:
//   Tab bar: basic | shape | icon | chart
//   basic: large cards for text/line/image/table + recent items (localStorage, cap 8)
//   shape: left category sidebar (all + 20 categories) + right compact grid (187 icons) + search
//   icon: FA icon browser (search + official categories, ~2000, lazily loaded like the picker)
//   chart: 13-type grid (icon + name)
// All data comes from the type registry / built-in libraries (SUPPORTED_SHAPES /
// FA registry / CHART_META) without re-declaring it; clicking an entry always
// goes through addElement (selects the new element; non-icons open data editing).
// ============================================================================

import { buildAddItems } from "../types/index.js";
import { iconElement } from "../types/icon.js";
import { getIconRegistry, ensureIcon, queryIconEntries } from "../app/project/icons.js";
import { SUPPORTED_SHAPES, shapeMenuIcon } from "../../packages/model/index.js";
import { iconThumb } from "../../packages/renderer/index.js";

const RECENT_KEY = "pptd-add-recent";
const RECENT_MAX = 8;

/** Chart entry ids (declared by the registry; id = type name). */
const CHART_IDS = new Set([
  "bar", "line", "area", "pie", "scatter", "bubble", "candlestick",
  "radar", "waterfall", "heatmap", "treemap", "sunburst", "sankey",
]);

/** Recent items (localStorage, newest first, deduplicated). */
function readRecent() {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(raw) ? raw.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function pushRecent(id) {
  const list = [id, ...readRecent().filter((x) => x !== id)].slice(0, RECENT_MAX);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* silently ignore (private mode etc.) */
  }
}

export function bindAddMenu({ fab, menu, addApi }) {
  const addItems = buildAddItems();
  const { addElement, rebuildImageMap } = addApi;
  const ac = new AbortController(); // lifecycle: fab/document listeners detached via this

  // Recent items (shown only when present in addItems)
  const recentItems = () =>
    readRecent()
      .map((id) => addItems[id])
      .filter(Boolean)
      .slice(0, 8);

  /** Click an entry: record it as recent + add it. */
  function pick(item) {
    close();
    if (item.id) pushRecent(item.id);
    if (item.onClick) item.onClick({ addElement, rebuildImageMap });
    else if (item.create) addElement(item.create());
  }

  function close() {
    menu.classList.remove("open");
    fab.classList.remove("active");
  }

  // --------------------------------------------------------------------------
  // Catalog data (shape categories + entries; the icon catalog is in
  // renderIconCatalog — registry-derived and lazily loaded)
  // --------------------------------------------------------------------------
  const shapeCats = [...new Set(Object.values(SUPPORTED_SHAPES).map((s) => s.category))];
  const shapeEntries = Object.entries(SUPPORTED_SHAPES).map(([key, def]) => ({
    key,
    label: def.label,
    cat: def.category,
    svg: shapeMenuIcon(key, { size: 20 }),
  }));
  shapeEntries.push({ key: "custom", label: "自定义路径", cat: "基本", svg: shapeMenuIcon("rect", { size: 20 }) });

  // Chart entries (reuse the registry menu declarations)
  const chartEntries = Object.entries(addItems)
    .filter(([id]) => CHART_IDS.has(id))
    .map(([id, item]) => ({ id, label: item.label, svg: item.icon }));

  // --------------------------------------------------------------------------
  // Tab container construction
  // --------------------------------------------------------------------------
  let currentTab = "basic";

  function build() {
    menu.innerHTML = "";
    menu.classList.add("new");

    // Tab bar
    const tabs = document.createElement("div");
    tabs.className = "add-tabs";
    const TAB_LIST = [
      ["basic", "基础"],
      ["shape", "形状"],
      ["icon", "图标"],
      ["chart", "图表"],
    ];
    for (const [id, label] of TAB_LIST) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "add-tab" + (id === currentTab ? " active" : "");
      b.textContent = label;
      b.addEventListener("click", () => switchTab(id));
      tabs.appendChild(b);
    }
    menu.appendChild(tabs);

    // Content area
    const body = document.createElement("div");
    body.className = "add-body";
    menu.appendChild(body);
    renderTab(body);
  }

  function switchTab(id) {
    currentTab = id;
    for (const b of menu.querySelectorAll(".add-tab")) {
      b.classList.toggle("active", b.textContent === TAB_LABEL[id]);
    }
    const body = menu.querySelector(".add-body");
    body.innerHTML = "";
    renderTab(body);
  }

  const TAB_LABEL = { basic: "基础", shape: "形状", icon: "图标", chart: "图表" };

  function renderTab(body) {
    if (currentTab === "basic") renderBasic(body);
    else if (currentTab === "shape") renderCatalog(body, shapeCats, shapeEntries, (e) => makeThumb(e.svg, e.label, () => pick(addItems[`shape-${e.key}`])));
    else if (currentTab === "icon") renderIconCatalog(body);
    else renderChart(body);
  }

  // --------------------------------------------------------------------------
  // Icon catalog: Font Awesome registry (lightweight entries, lazy thumbnails,
  // search across aliases/keywords)
  // --------------------------------------------------------------------------
  let iconCatalogReady = null; // { cats, entries } singleton
  let iconCatalogSeq = 0; // race guard: switching tab while loading discards the stale render
  function iconCatalog() {
    if (!iconCatalogReady) {
      iconCatalogReady = getIconRegistry().then((registry) => {
        const byName = new Map(registry.icons.map((i) => [i.name, i]));
        const cats = [...new Set(Object.values(registry.cats))].sort((a, b) => a.localeCompare(b));
        const { entries } = queryIconEntries(registry, {});
        const list = entries.map((e) => {
          const meta = byName.get(e.name);
          const cat = (meta && meta.cat && registry.cats[meta.cat]) || "其他";
          return {
            key: e.raw,
            raw: e.raw,
            cat,
            label: e.label,
            // Search domain: official name + display name + aliases + official search terms (e.g. home → house)
            haystack: [e.name, e.label, (meta?.aliases || []).join(" "), (meta?.terms || []).join(" ")].join(" ").toLowerCase(),
          };
        });
        return { cats, entries: list };
      });
    }
    return iconCatalogReady;
  }

  function renderIconCatalog(body) {
    const seq = ++iconCatalogSeq;
    body.classList.add("catalog");
    const loading = document.createElement("div");
    loading.className = "add-sub-title";
    loading.textContent = "正在加载图标目录…";
    body.appendChild(loading);
    iconCatalog().then(({ cats, entries }) => {
      if (seq !== iconCatalogSeq) return; // tab switched meanwhile
      body.innerHTML = "";
      renderCatalog(
        body,
        cats,
        entries,
        (e) => {
          const cell = document.createElement("button");
          cell.type = "button";
          cell.className = "add-thumb";
          cell.title = e.raw;
          cell.addEventListener("click", () => pick({ id: `icon-fa:${e.raw}`, create: () => iconElement(e.raw) }));
          ensureIcon(e.raw).then((def) => {
            if (def && cell.isConnected) cell.innerHTML = iconThumb(def, { size: 20 });
          });
          return cell;
        },
        { limit: 240 }
      );
    });
  }

  // --------------------------------------------------------------------------
  // Basic tab: large cards + recent items
  // --------------------------------------------------------------------------
  function renderBasic(body) {
    body.classList.remove("catalog");
    const grid = document.createElement("div");
    grid.className = "add-basic-grid";
    const BASIC_IDS = ["text", "line", "image", "table"];
    for (const id of BASIC_IDS) {
      const item = addItems[id];
      if (!item) continue;
      const card = document.createElement("button");
      card.type = "button";
      card.className = "add-card";
      card.innerHTML = `${item.icon}<span class="add-card-name">${item.label}</span>` +
        (item.desc ? `<span class="add-card-desc">${item.desc}</span>` : "");
      card.addEventListener("click", () => pick(item));
      grid.appendChild(card);
    }
    body.appendChild(grid);

    const recents = recentItems();
    if (recents.length) {
      const sec = document.createElement("div");
      sec.className = "add-sec";
      sec.textContent = "最近使用";
      body.appendChild(sec);
      const rg = document.createElement("div");
      rg.className = "add-thumb-grid";
      for (const item of recents) {
        rg.appendChild(makeThumb(item.icon, item.label, () => pick(item)));
      }
      body.appendChild(rg);
    }
  }

  // --------------------------------------------------------------------------
  // Shape/icon tabs: search + category sidebar + compact grid (one component;
  // icons use lazy thumbnails)
  // --------------------------------------------------------------------------
  function renderCatalog(body, cats, entries, nodeFn, opts = {}) {
    const limit = opts.limit || Infinity;
    let q = "";
    let activeCat = "全部";

    const search = document.createElement("input");
    search.type = "text";
    search.className = "add-search";
    search.placeholder = currentTab === "shape" ? "搜索形状…" : "搜索图标…";

    const catBar = document.createElement("div");
    catBar.className = "add-cats";
    const catBtns = new Map();
    const mkCat = (name) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "add-cat" + (name === activeCat ? " active" : "");
      b.textContent = name;
      b.addEventListener("click", () => {
        activeCat = name;
        for (const [n, btn] of catBtns) btn.classList.toggle("active", n === name);
        renderGrid();
      });
      catBtns.set(name, b);
      catBar.appendChild(b);
    };
    mkCat("全部");
    for (const c of cats) mkCat(c);

    const wrap = document.createElement("div");
    wrap.className = "add-grid-wrap";

    const catalog = document.createElement("div");
    catalog.className = "add-catalog";
    catalog.append(catBar, wrap);
    body.classList.add("catalog");

    const filtered = () => {
      const ql = q.trim().toLowerCase();
      return entries.filter((e) => {
        if (activeCat !== "全部" && e.cat !== activeCat) return false;
        if (!ql) return true;
        return e.label.toLowerCase().includes(ql) || e.key.toLowerCase().includes(ql) || (e.haystack && e.haystack.includes(ql));
      });
    };

    function renderGrid() {
      wrap.innerHTML = "";
      const full = filtered();
      const list = full.slice(0, limit);
      if (full.length > limit) {
        const hint = document.createElement("div");
        hint.className = "add-sub-title";
        hint.textContent = `共 ${full.length} 个匹配，显示前 ${limit} 个——输入关键词缩小范围`;
        wrap.appendChild(hint);
      }
      if (!list.length) {
        const empty = document.createElement("div");
        empty.className = "add-empty";
        empty.textContent = "没有匹配的条目";
        wrap.appendChild(empty);
        return;
      }
      if (activeCat === "全部" && !q.trim()) {
        // All mode: group by category (one matrix grid + small title per group)
        let lastCat = null;
        let grid = null;
        for (const e of list) {
          if (e.cat !== lastCat) {
            lastCat = e.cat;
            const t = document.createElement("div");
            t.className = "add-sub-title";
            t.textContent = e.cat;
            wrap.appendChild(t);
            grid = document.createElement("div");
            grid.className = "add-thumb-grid";
            wrap.appendChild(grid);
          }
          grid.appendChild(nodeFn(e));
        }
      } else {
        const grid = document.createElement("div");
        grid.className = "add-thumb-grid";
        for (const e of list) grid.appendChild(nodeFn(e));
        wrap.appendChild(grid);
      }
    }

    search.addEventListener("input", () => {
      q = search.value;
      renderGrid();
    });

    body.append(search, catalog);
    renderGrid();
  }

  /** Compact thumbnail cell (small icon + hover name). */
  function makeThumb(svg, label, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "add-thumb";
    b.title = label;
    b.innerHTML = svg;
    b.addEventListener("click", onClick);
    return b;
  }

  // --------------------------------------------------------------------------
  // Chart tab
  // --------------------------------------------------------------------------
  function renderChart(body) {
    body.classList.remove("catalog");
    const grid = document.createElement("div");
    grid.className = "add-chart-grid";
    for (const e of chartEntries) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "add-chart-item";
      b.innerHTML = `${e.svg}<span>${e.label}</span>`;
      b.addEventListener("click", () => pick(addItems[e.id]));
      grid.appendChild(b);
    }
    body.appendChild(grid);
  }

  // --------------------------------------------------------------------------
  // Toggle
  // --------------------------------------------------------------------------
  fab.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = menu.classList.toggle("open");
    fab.classList.toggle("active", open);
    if (open && !menu.dataset.built) {
      build();
      menu.dataset.built = "1";
    }
  }, { signal: ac.signal });
  document.addEventListener("click", (e) => {
    if (!menu.classList.contains("open")) return;
    if (menu.contains(e.target) || e.target === fab) return;
    close();
  }, { signal: ac.signal });

  return {
    /** Release: detach listeners, collapse and clear the menu (reset dataset.built too). */
    destroy() {
      ac.abort();
      close();
      menu.innerHTML = "";
      delete menu.dataset.built;
    },
  };
}
