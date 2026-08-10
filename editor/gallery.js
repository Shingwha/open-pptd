// ============================================================================
// gallery.js — 主题画廊视图（只读渲染，复用 renderer/page.js）
// ----------------------------------------------------------------------------
// 画廊 = 主题封面卡片网格；点击卡片直接进入编辑器（#edit?deck=...）。
// 渲染链路：fetch manifest → parseDeck → normalizeTheme/mergeFonts →
// renderPage（960×540 逻辑尺寸，按容器宽度自适应缩放）。
// 纯静态可用（GitHub Pages 无服务器，全部相对路径 fetch）。
// 性能：manifest 走浏览器 HTTP 缓存（本地 serve 自带 no-store，开发不受影响）；
// 项目文件走 Cache API 跨会话缓存（见 app/project-cache.js），缩略图懒加载（滚动到才拉）。
// ============================================================================

import * as yaml from "./vendor/js-yaml.mjs";
import { parseDeck } from "./core/pptd-io.js";
import { normalizeTheme, mergeFonts } from "./core/theme.js";
import { renderPage, disposeChartInstances } from "./renderer/page.js";
import { fetchProjectTexts } from "./app/project-cache.js";

const PAGE_W = 960;
const PAGE_H = 540;

// 仓库根 URL（本文件位于 <root>/editor/，../ 即站点根——兼容本地与 GitHub Pages 子路径）
const ROOT = new URL("../", import.meta.url).href;

let manifestCache = null;
const projectCache = new Map();

const $ = (id) => document.getElementById(id);

export async function loadManifest() {
  if (manifestCache) return manifestCache;
  // 不再强制 no-store：本地 serve 对静态文件自带 no-store（开发永远新鲜），
  // GitHub Pages 则交给浏览器 HTTP 缓存（默认 max-age=600），重复访问不再重拉。
  const res = await fetch(new URL("themes/manifest.json", ROOT));
  if (!res.ok) throw new Error(`主题清单加载失败: ${res.status}`);
  manifestCache = await res.json();
  return manifestCache;
}

/** 加载主题项目（manifest + pages → 模型 + 主题），带会话内缓存 + Cache API 跨会话缓存。 */
export async function loadProject(entry) {
  if (projectCache.has(entry.key)) return projectCache.get(entry.key);
  const manifestUrl = new URL(entry.deck, ROOT).href;
  const { manifestText, pageTexts } = await fetchProjectTexts(manifestUrl, yaml.load);
  const deck = parseDeck(manifestText, pageTexts);
  const theme = mergeFonts(normalizeTheme(deck.theme), deck.fonts);
  const proj = { deck, theme };
  projectCache.set(entry.key, proj);
  return proj;
}

/** 按容器实际宽度渲染一页封面（容器需已布局，16:9）。 */
export function renderPageFit(container, page, deck, theme) {
  disposeChartInstances(container);
  container.innerHTML = "";
  const cw = container.clientWidth;
  if (!cw) {
    // 容器尚未布局（宽度 0）：下一帧再试一次，避免 0.1 下限把封面缩成 96px 残影
    requestAnimationFrame(() => {
      if (document.contains(container) && container.clientWidth) {
        renderPageFit(container, page, deck, theme);
      }
    });
    return;
  }
  const scale = Math.max(0.1, Math.min(2, cw / PAGE_W));
  const stage = document.createElement("div");
  stage.className = "gallery-page";
  stage.style.width = `${PAGE_W}px`;
  stage.style.height = `${PAGE_H}px`;
  stage.style.transform = `scale(${scale})`;
  stage.style.transformOrigin = "top left";
  renderPage(stage, page, deck, theme);
  container.appendChild(stage);
}

// 封面尺寸跟随：窗口缩放 / 移动端地址栏伸缩 / 横竖屏切换导致卡片宽度变化时，
// 按最新宽度重渲染封面（不再停留在首次渲染的旧尺寸，避免封面与卡片宽度不一致）。
// 亚像素级抖动（<1px）忽略；尚未加载完的卡片等懒加载按最新宽度画。
const thumbSizes = new WeakMap();
const sizeObserver = new ResizeObserver((entries) => {
  for (const ent of entries) {
    const thumb = ent.target;
    const entry = thumbEntries.get(thumb);
    if (!entry || thumb.classList.contains("loading")) continue;
    const proj = projectCache.get(entry.key);
    if (!proj) continue;
    const cw = ent.contentRect.width;
    const prev = thumbSizes.get(thumb);
    thumbSizes.set(thumb, cw);
    if (prev !== undefined && Math.abs(cw - prev) <= 1) continue;
    renderPageFit(thumb, proj.deck.pages[0], proj.deck, proj.theme);
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
      const thumb = ent.target;
      const entry = thumbEntries.get(thumb);
      if (!entry) return;
      loadProject(entry)
        .then((proj) => {
          if (!document.contains(thumb)) return; // 加载完成前已离开页面
          thumb.classList.remove("loading");
          renderPageFit(thumb, proj.deck.pages[0], proj.deck, proj.theme);
        })
        .catch((err) => {
          if (!document.contains(thumb)) return;
          thumb.classList.remove("loading");
          thumb.innerHTML = `<div class="theme-card-err">加载失败</div>`;
          console.error(`[gallery] ${entry.key} 加载失败:`, err);
        });
    }
  },
  { rootMargin: "400px" }
);

/** 画廊：主题封面卡片网格（点击 → 编辑器）。 */
export async function showGallery() {
  const grid = $("gallery-grid");
  grid.hidden = false;
  grid.innerHTML = "";

  const entries = await loadManifest();
  for (const entry of entries) {
    const card = document.createElement("div");
    card.className = "theme-card";
    const thumb = document.createElement("div");
    thumb.className = "theme-card-thumb loading";
    const info = document.createElement("div");
    info.className = "theme-card-info";
    info.innerHTML =
      `<div class="theme-card-name">${entry.name}` +
      `<span class="page-badge">${entry.pages} 页</span></div>` +
      `<div class="theme-card-scene">${entry.scene}</div>`;
    card.appendChild(thumb);
    card.appendChild(info);
    card.addEventListener("click", () => {
      // 跳转到编辑器端口并加载该主题
      location.href = new URL("editor/?deck=" + encodeURIComponent(entry.deck), ROOT).href;
    });
    grid.appendChild(card);
    thumbEntries.set(thumb, entry);
    thumbObserver.observe(thumb);
    sizeObserver.observe(thumb);
  }
}
