// ============================================================================
// gallery.js — 作品画廊视图（只读渲染，复用 renderer/page.js）
// ----------------------------------------------------------------------------
// 画廊 = 示例作品封面卡片网格；点击卡片进入编辑器（editor/?deck=...）。
// 渲染链路：fetch examples/manifest.json → parseDeck → normalizeTheme/mergeFonts →
// renderPage（封面框固定比例：PPT 16:9 / 海报 3:4，作品 contain 缩放居中）。
// 纯静态可用（GitHub Pages 无服务器，全部相对路径 fetch；项目媒体图同样
// 以相对路径解析为绝对 URL 加载）。
// 性能：项目文件走 Cache API 跨会话缓存（app/project/project-cache.js），
// 缩略图懒加载（滚动到才拉）+ ResizeObserver 随卡片宽度重渲染。
// ============================================================================

import * as yaml from "../packages/model/vendor/js-yaml.mjs";
import { parseDeck } from "../packages/model/pptd-io.js";
import { resolveTheme } from "../packages/model/theme.js";
import { deckSize } from "../packages/model/model.js";
import { parseFontResources } from "../packages/model/font.js";
import { renderPage, disposeChartInstances } from "../packages/renderer/page.js";
import { fetchProjectTexts } from "./app/project/project-cache.js";
import { preloadIcons } from "./app/project/icons.js";
import { pickProjectFolder, hasDeck } from "./app/project/handle-io.js";
import { addRecent, setPendingProject } from "./app/project/handle-store.js";
import { registerRegistryFontFace } from "./app/project/font-manager.js";
import { createFileMenu } from "./app/file-menu.js";
import { showToast } from "./app/toast.js";
import { injectIcons } from "./icons.js";

injectIcons(); // 顶栏图标占位（data-icon）注入实际 SVG（图标单一来源 icons.js）

// 仓库根 URL（本文件位于 <root>/editor/，../ 即站点根——兼容本地与 GitHub Pages 子路径）
const ROOT = new URL("../", import.meta.url).href;

let manifestCache = null;
const projectCache = new Map();

const $ = (id) => document.getElementById(id);

async function loadManifest() {
  if (manifestCache) return manifestCache;
  const res = await fetch(new URL("examples/manifest.json", ROOT));
  if (!res.ok) {
    // 无 examples/（如发布仓库精简版）：降级为空画廊，不报错
    console.warn(`[gallery] 画廊清单不可用（${res.status}），按空画廊处理`);
    manifestCache = [];
    return manifestCache;
  }
  const data = await res.json();
  manifestCache = Array.isArray(data) ? data : data.entries || [];
  return manifestCache;
}

/** 注册项目声明字体（deck.fonts 资源表）：按条目的 family 注册名命中注册表，与编辑器
 *  restoreFromDeck 同管线。槽位 key 只是 deck 作者起的任意名，不保证等于注册表 key/family
 *  （如「刀隶体」vs 注册表「阿里妈妈刀隶体」），拿它查表会静默脱靶回退系统字体。 */
async function loadProjectFonts(deck) {
  const resources = parseFontResources(deck?.fonts);
  for (const [key, res] of Object.entries(resources)) {
    try {
      await registerRegistryFontFace(res.family || key);
    } catch {
      /* 单字体失败不影响整体 */
    }
  }
}

/** 加载项目（manifest + pages → 模型 + 主题 + 字体），带会话内缓存 + Cache API 跨会话缓存。 */
async function loadProject(entry) {
  if (projectCache.has(entry.id)) return projectCache.get(entry.id);
  const manifestUrl = new URL(entry.deck, ROOT).href;
  const { manifestText, pageTexts } = await fetchProjectTexts(manifestUrl, yaml.load);
  const deck = parseDeck(manifestText, pageTexts);
  const theme = resolveTheme(deck);
  await loadProjectFonts(deck);
  // 相对路径图片 → 以项目 manifest 为基准解析为绝对 URL（页面内 img.src 直接用）
  const imageMap = {};
  for (const page of deck.pages) {
    for (const el of page.elements || []) {
      if (el.elementType === "image" && el.src && !el.src.startsWith("data:") && !/^https?:/i.test(el.src)) {
        imageMap[el.src] = new URL(el.src, manifestUrl).href;
      }
    }
  }
  // 图标预读（封面页）：FA SVG 经本地/CDN + Cache API，渲染与图片同层缓存
  const iconMap = {};
  if (deck.pages[0]) await preloadIcons([deck.pages[0]], iconMap);
  const proj = { deck, theme, imageMap, iconMap };
  projectCache.set(entry.id, proj);
  return proj;
}

/** 按卡片封面框 contain 渲染一页封面：框比例固定（PPT 16:9 / 海报 3:4，见 gallery.css），
 *  作品按 min(cw/pw, ch/ph) 缩放居中，空隙由封面框中性衬底留白（装裱感，网格成行齐整）。 */
function renderPageFit(container, page, deck, theme, imageMap, iconMap = {}) {
  disposeChartInstances(container);
  container.innerHTML = "";
  const cw = container.clientWidth;
  const ch = container.clientHeight;
  if (!cw || !ch) {
    // 容器尚未布局（宽高 0）：下一帧再试一次，避免 0.1 下限把封面缩成残影
    requestAnimationFrame(() => {
      if (document.contains(container) && container.clientWidth && container.clientHeight) {
        renderPageFit(container, page, deck, theme, imageMap, iconMap);
      }
    });
    return;
  }
  const [pw, ph] = deckSize(deck);
  const scale = Math.max(0.1, Math.min(2, Math.min(cw / pw, ch / ph)));
  const stage = document.createElement("div");
  stage.className = "gallery-page";
  stage.style.width = `${pw}px`;
  stage.style.height = `${ph}px`;
  stage.style.left = `${(cw - pw * scale) / 2}px`;
  stage.style.top = `${(ch - ph * scale) / 2}px`;
  stage.style.transform = `scale(${scale})`;
  stage.style.transformOrigin = "top left";
  renderPage(stage, page, deck, theme, { imageMap, iconMap });
  container.appendChild(stage);
}

// 封面尺寸跟随：窗口缩放 / 移动端地址栏伸缩 / 横竖屏切换导致卡片宽度变化时，
// 按最新宽度重渲染封面（亚像素级抖动 <1px 忽略）。
const thumbSizes = new WeakMap();
const sizeObserver = new ResizeObserver((entries) => {
  for (const ent of entries) {
    const canvas = ent.target;
    const entry = thumbEntries.get(canvas);
    if (!entry || canvas.parentElement.classList.contains("loading")) continue;
    const proj = projectCache.get(entry.id);
    if (!proj) continue;
    const cw = ent.contentRect.width;
    const prev = thumbSizes.get(canvas);
    thumbSizes.set(canvas, cw);
    if (prev !== undefined && Math.abs(cw - prev) <= 1) continue;
    renderPageFit(canvas, proj.deck.pages[0], proj.deck, proj.theme, proj.imageMap, proj.iconMap);
  }
});

// ----------------------------------------------------------------------------
// 缩略图懒加载：卡片先入网格（骨架屏占位），滚动到可视区（提前 400px 预热）
// 才拉取项目并渲染。首屏打开页面时零项目请求，画廊秒开。
// ----------------------------------------------------------------------------
const thumbEntries = new WeakMap();
const thumbObserver = new IntersectionObserver(
  (entries) => {
    for (const ent of entries) {
      if (!ent.isIntersecting) continue;
      thumbObserver.unobserve(ent.target);
      const canvas = ent.target;
      const entry = thumbEntries.get(canvas);
      if (!entry) return;
      const cover = canvas.parentElement;
      loadProject(entry)
        .then((proj) => {
          if (!document.contains(canvas)) return; // 加载完成前已离开页面
          cover.classList.remove("loading");
          renderPageFit(canvas, proj.deck.pages[0], proj.deck, proj.theme, proj.imageMap, proj.iconMap);
        })
        .catch((err) => {
          if (!document.contains(canvas)) return;
          cover.classList.remove("loading");
          canvas.innerHTML = `<div class="gallery-card-err">加载失败</div>`;
          console.error(`[gallery] ${entry.id} 加载失败:`, err);
        });
    }
  },
  { rootMargin: "400px" }
);

/** 探测运行模式：本地 serve 有 /api/ping；GitHub Pages 纯静态 → 线上模式。 */
async function detectMode() {
  try {
    const res = await fetch(new URL("api/ping", ROOT), { cache: "no-store" });
    if (res.ok) return "local";
  } catch {
    /* 网络错误 → 线上 */
  }
  return "remote";
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/** 画廊：示例作品封面卡片网格（点击 → 编辑器）。 */
export async function showGallery() {
  const grid = $("gallery-grid");
  grid.hidden = false;
  grid.innerHTML = "";

  // 模式徽标
  const mode = await detectMode();
  const modeEl = $("gallery-mode");
  if (modeEl) {
    modeEl.hidden = false;
    modeEl.className = "gallery-mode " + mode;
    modeEl.innerHTML =
      mode === "local" ? `<span class="mode-dot"></span>本地模式` : `<span class="mode-dot"></span>线上模式`;
    modeEl.title =
      mode === "local" ? "作品可编辑并写回项目目录" : "可编辑预览，保存将下载项目包（zip）";
  }

  // 「文件」菜单（与编辑器同一外壳）：画廊=开始页角色，放 打开编辑器 / 打开 / 最近
  const fileBtn = $("btn-file");
  if (fileBtn) {
    const supported = "showDirectoryPicker" in window; // 句柄读写不经服务器，本地/线上均可用
    createFileMenu(fileBtn, async ({ menu, item, appendRecents }) => {
      menu.appendChild(item("打开编辑器", { onClick: () => (location.href = new URL("editor/", ROOT).href) }));
      const openItem = item("打开本地项目", { onClick: openLocalFromPicker });
      if (!supported) openItem.hidden = true; // 不支持的浏览器不显示
      menu.appendChild(openItem);
      if (supported) {
        await appendRecents(menu, (entry) => {
          setPendingProject(entry.id); // 编辑器据此续开（授权仍有效则免确认）
          location.href = new URL("editor/", ROOT).href;
        });
      }
    });
  }

  const entries = await loadManifest();
  if (!entries.length) {
    grid.innerHTML =
      `<div class="gallery-empty">examples/ 下暂无作品。<br>` +
      `把做好的 PPTD 项目文件夹（deck.pptd + pages/ + media/）放进 examples/ 即出现在这里。</div>`;
    return;
  }

  // 双 tab：PPT / 海报（条目由 meta.yaml 的 kind 显式指定，缺省 ppt）
  const TABS = [
    { kind: "ppt", label: "PPT" },
    { kind: "poster", label: "海报" },
  ];
  const tabsEl = $("gallery-tabs");

  function fillGrid(list) {
    grid.innerHTML = "";
    if (!list.length) {
      grid.innerHTML =
        `<div class="gallery-empty">此分类下暂无作品。<br>` +
        `把项目放进 examples/ 并在 meta.yaml 写 kind: poster 即出现在这里。</div>`;
      return;
    }
    for (const [i, entry] of list.entries()) {
      const card = document.createElement("div");
      card.className = "gallery-card";
      card.style.setProperty("--card-i", i); // 【试验项】错落浮入的序号（配 gallery.css 的 gallery-card-in）
      const thumb = document.createElement("div");
      thumb.className = "gallery-card-cover loading";
      // 渲染目标 canvas 与页数角标平级：重渲染清空 canvas 不带走角标
      const canvas = document.createElement("div");
      canvas.className = "gallery-card-canvas";
      const badge = document.createElement("span");
      badge.className = "gallery-page-badge";
      badge.textContent = `${entry.pages} 页`;
      thumb.appendChild(canvas);
      thumb.appendChild(badge);
      const info = document.createElement("div");
      info.className = "gallery-card-info";
      const tags = (entry.tags || [])
        .map((t) => `<span class="gallery-tag">${escapeHtml(t)}</span>`)
        .join("");
      // 标题/描述/标签三个槽位恒在（无内容留空），卡片信息区高度一致、网格成行齐整
      info.innerHTML =
        `<div class="gallery-card-title">${escapeHtml(entry.title)}</div>` +
        `<div class="gallery-card-desc">${escapeHtml(entry.description || "")}</div>` +
        `<div class="gallery-card-tags">${tags}</div>`;
      card.appendChild(thumb);
      card.appendChild(info);
      card.addEventListener("click", () => {
        // 跳转到编辑器并加载该作品（本地可编辑写回；线上可编辑、保存下载 zip）
        location.href = new URL("editor/?deck=" + encodeURIComponent(entry.deck), ROOT).href;
      });
      grid.appendChild(card);
      thumbEntries.set(canvas, entry);
      thumbObserver.observe(canvas);
      sizeObserver.observe(canvas);
    }
  }

  /** 把滑块指示器对齐到激活 tab。FLIP：left/width 瞬时设为目标值，
      视觉位移用 transform 补偿——起点与终点都用视口坐标（getBoundingClientRect）
      测量且包含进行中的动画，快速连点时从"看起来所在的位置"续滑不瞬移。
      instant=true（resize/字体就绪）直接归位。 */
  function moveTabIndicator(instant = false) {
    const active = tabsEl?.querySelector(".gallery-tab.active");
    const bar = $("gallery-tab-indicator");
    if (!active || !bar) return;
    const startLeft = bar.getBoundingClientRect().left; // 当前视觉位置（视口坐标）
    bar.style.transition = "none";
    bar.style.transform = "";
    bar.style.left = `${active.offsetLeft}px`;
    bar.style.width = `${active.offsetWidth}px`;
    const dx = instant ? 0 : startLeft - bar.getBoundingClientRect().left; // 同坐标系求差
    if (!dx) {
      bar.style.transition = "";
      return;
    }
    bar.style.transform = `translateX(${dx}px)`;
    bar.getBoundingClientRect(); // 强制回流，让起始位移先生效
    bar.style.transition = "";
    bar.style.transform = ""; // 从 dx 过渡回 0，滑到目标位
  }

  function setTab(kind) {
    tabsEl?.querySelectorAll(".gallery-tab").forEach((b) => b.classList.toggle("active", b.dataset.kind === kind));
    moveTabIndicator();
    grid.classList.toggle("poster-grid", kind === "poster");
    // 网格重建推迟一帧：滑块动画先在干净的主线程上起步
    requestAnimationFrame(() => fillGrid(entries.filter((e) => (e.kind || "ppt") === kind)));
  }

  if (tabsEl) {
    tabsEl.hidden = false;
    tabsEl.innerHTML =
      `<span class="gallery-tab-indicator" id="gallery-tab-indicator"></span>` +
      TABS.map((t) => {
        const n = entries.filter((e) => (e.kind || "ppt") === t.kind).length;
        return `<button class="gallery-tab" data-kind="${t.kind}">${t.label}<span class="cnt">${n}</span></button>`;
      }).join("");
    tabsEl.addEventListener("click", (ev) => {
      const btn = ev.target.closest(".gallery-tab");
      if (btn && !btn.classList.contains("active")) {
        setTab(btn.dataset.kind);
        // 平滑回顶：配合滑块与浮入动画，并避免停留在页面下方时 scrollTop 超出新内容高度被强拉的纵跳
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
    window.addEventListener("resize", () => moveTabIndicator(true));
    document.fonts?.ready.then(() => moveTabIndicator(true)); // 字体加载完成后 tab 宽度可能变化，直接归位
  }
  setTab("ppt");
}

/** 「打开本地项目」：原生选择器 → 校验 deck.pptd → 记最近 → 跳编辑器续开。 */
async function openLocalFromPicker() {
  try {
    const handle = await pickProjectFolder();
    if (!handle) return; // 用户取消
    if (!(await hasDeck(handle))) {
      showToast("所选文件夹里没有 deck.pptd，请选择 PPTD 项目文件夹", "danger", 5000);
      return;
    }
    const entry = await addRecent(handle);
    if (entry) setPendingProject(entry.id); // 编辑器据此续开（同会话授权仍有效，免确认）
    location.href = new URL("editor/", ROOT).href;
  } catch (err) {
    showToast(`打开失败: ${err.message}`, "danger");
  }
}
