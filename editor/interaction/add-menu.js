// ============================================================================
// interaction/add-menu.js — 添加元素面板（仿 PPT 素材库）
// ----------------------------------------------------------------------------
// 结构：
//   Tab 栏：基础 | 形状 | 图标 | 图表
//   基础：文字/线条/图片/表格大卡片 + 最近使用（localStorage，上限 8）
//   形状：左分类侧栏（全部 + 20 分类）+ 右紧凑网格（187 种小图标）+ 搜索
//   图标：左分类侧栏（全部 + 分类）+ 右网格（192 个全量）+ 搜索
//   图表：13 种网格（图标 + 名称）
// 数据源全部来自类型注册表 / 内置库（SUPPORTED_SHAPES / ICONS / CHART_META），
// 不重复声明；点击条目统一走 addElement（新增后选中，非 icon 自动进数据编辑）。
// ============================================================================

import { buildAddItems } from "../types/index.js";
import { SUPPORTED_SHAPES } from "../core/model.js";
import { shapeMenuIcon } from "../core/preset-geometry.js";
import { ICONS } from "../core/icon-library.js";
import { iconThumb } from "../renderer/icon.js";

const RECENT_KEY = "pptd-add-recent";
const RECENT_MAX = 8;

/** 图表菜单条目 id 集合（注册表声明，id = 类型名）。 */
const CHART_IDS = new Set([
  "bar", "line", "area", "pie", "scatter", "bubble", "candlestick",
  "radar", "waterfall", "heatmap", "treemap", "sunburst", "sankey",
]);

/** 最近使用（localStorage，最新在前，去重）。 */
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
    /* 隐私模式等场景静默失败 */
  }
}

export function bindAddMenu({ fab, menu, addApi }) {
  const addItems = buildAddItems();
  const { addElement, rebuildImageMap } = addApi;

  // 最近使用项（addItems 里能找到的才显示）
  const recentItems = () =>
    readRecent()
      .map((id) => addItems[id])
      .filter(Boolean)
      .slice(0, 8);

  /** 点击条目：记录最近使用 + 添加。 */
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
  // 目录数据（形状/图标分类 + 条目）
  // --------------------------------------------------------------------------
  const shapeCats = [...new Set(Object.values(SUPPORTED_SHAPES).map((s) => s.category))];
  const shapeEntries = Object.entries(SUPPORTED_SHAPES).map(([key, def]) => ({
    key,
    label: def.label,
    cat: def.category,
    svg: shapeMenuIcon(key, { size: 20 }),
  }));
  shapeEntries.push({ key: "custom", label: "自定义路径", cat: "基本", svg: shapeMenuIcon("rect", { size: 20 }) });

  const iconCats = [...new Set(Object.values(ICONS).map((i) => i.cat))];
  const iconEntries = Object.entries(ICONS).map(([key, def]) => ({
    key,
    label: def.label,
    cat: def.cat,
    svg: iconThumb(key, { size: 18 }),
  }));

  // 图表项（复用注册表菜单声明）
  const chartEntries = Object.entries(addItems)
    .filter(([id]) => CHART_IDS.has(id))
    .map(([id, item]) => ({ id, label: item.label, svg: item.icon }));

  // --------------------------------------------------------------------------
  // Tab 容器构建
  // --------------------------------------------------------------------------
  let currentTab = "basic";

  function build() {
    menu.innerHTML = "";
    menu.classList.add("new");

    // Tab 栏
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

    // 内容区
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
    else if (currentTab === "icon") renderCatalog(body, iconCats, iconEntries, (e) => makeThumb(e.svg, e.label, () => pick(addItems[`icon-${e.key}`])));
    else renderChart(body);
  }

  // --------------------------------------------------------------------------
  // 基础 Tab：大卡片 + 最近使用
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
        rg.appendChild(makeThumb(item.icon || iconThumb("grid", { size: 18 }), item.label, () => pick(item)));
      }
      body.appendChild(rg);
    }
  }

  // --------------------------------------------------------------------------
  // 形状/图标 Tab：搜索 + 分类侧栏 + 紧凑网格
  // --------------------------------------------------------------------------
  function renderCatalog(body, cats, entries, nodeFn) {
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
        return e.label.toLowerCase().includes(ql) || e.key.toLowerCase().includes(ql);
      });
    };

    function renderGrid() {
      wrap.innerHTML = "";
      const list = filtered();
      if (!list.length) {
        const empty = document.createElement("div");
        empty.className = "add-empty";
        empty.textContent = "没有匹配的条目";
        wrap.appendChild(empty);
        return;
      }
      if (activeCat === "全部" && !q.trim()) {
        // 全部模式：按分类分组展示（每组一个矩阵网格 + 小标题）
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

  /** 紧凑缩略格（小图标 + 悬停名称）。 */
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
  // 图表 Tab
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
  // 开关
  // --------------------------------------------------------------------------
  fab.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = menu.classList.toggle("open");
    fab.classList.toggle("active", open);
    if (open && !menu.dataset.built) {
      build();
      menu.dataset.built = "1";
    }
  });
  document.addEventListener("click", (e) => {
    if (!menu.classList.contains("open")) return;
    if (menu.contains(e.target) || e.target === fab) return;
    close();
  });
}
