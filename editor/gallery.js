// ============================================================================
// gallery.js — 作品画廊视图（只读渲染，复用 renderer/page.js）
// ----------------------------------------------------------------------------
// 画廊 = 示例作品封面卡片网格；点击卡片进入编辑器（editor/?deck=...）。
// 渲染链路：fetch examples/manifest.json → parseDeck → normalizeTheme/mergeFonts →
// renderPage（960×540 逻辑尺寸，按容器宽度自适应缩放）。
// 纯静态可用（GitHub Pages 无服务器，全部相对路径 fetch；项目媒体图同样
// 以相对路径解析为绝对 URL 加载）。
// 性能：项目文件走 Cache API 跨会话缓存（app/project-cache.js），
// 缩略图懒加载（滚动到才拉）+ ResizeObserver 随卡片宽度重渲染。
// ============================================================================

import * as yaml from "./vendor/js-yaml.mjs";
import { parseDeck } from "./core/pptd-io.js";
import { normalizeTheme, mergeFonts } from "./core/theme.js";
import { renderPage, disposeChartInstances } from "./renderer/page.js";
import { fetchProjectTexts } from "./app/project-cache.js";
import { loadFontRegistry, findFont, fetchFontBytes } from "./core/font-registry.js";

const PAGE_W = 960;
const PAGE_H = 540;

// 仓库根 URL（本文件位于 <root>/editor/，../ 即站点根——兼容本地与 GitHub Pages 子路径）
const ROOT = new URL("../", import.meta.url).href;

let manifestCache = null;
const projectCache = new Map();

const $ = (id) => document.getElementById(id);

export async function loadManifest() {
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

/** 注册项目声明字体（deck.fonts 的 key）：本地库文件优先，线上源回退；失败回退系统字体。 */
async function loadProjectFonts(entry) {
  if (!entry.fonts?.length) return;
  let registry = null;
  try {
    registry = await loadFontRegistry();
  } catch {
    return;
  }
  for (const key of entry.fonts) {
    const hit = findFont(registry, key);
    if (!hit) continue;
    try {
      const bytes = await fetchFontBytes(hit);
      if (!bytes) continue;
      const face = new FontFace(hit.family, bytes);
      await face.load();
      document.fonts.add(face);
    } catch {
      /* 单字体失败不影响整体 */
    }
  }
}

/** 加载项目（manifest + pages → 模型 + 主题 + 字体），带会话内缓存 + Cache API 跨会话缓存。 */
export async function loadProject(entry) {
  if (projectCache.has(entry.id)) return projectCache.get(entry.id);
  const manifestUrl = new URL(entry.deck, ROOT).href;
  const { manifestText, pageTexts } = await fetchProjectTexts(manifestUrl, yaml.load);
  const deck = parseDeck(manifestText, pageTexts);
  const theme = mergeFonts(normalizeTheme(deck.theme), deck.fonts);
  await loadProjectFonts(entry);
  // 相对路径图片 → 以项目 manifest 为基准解析为绝对 URL（页面内 img.src 直接用）
  const imageMap = {};
  for (const page of deck.pages) {
    for (const el of page.elements || []) {
      if (el.elementType === "image" && el.src && !el.src.startsWith("data:") && !/^https?:/i.test(el.src)) {
        imageMap[el.src] = new URL(el.src, manifestUrl).href;
      }
    }
  }
  const proj = { deck, theme, imageMap };
  projectCache.set(entry.id, proj);
  return proj;
}

/** 按容器实际宽度渲染一页封面（容器需已布局，16:9）。 */
export function renderPageFit(container, page, deck, theme, imageMap) {
  disposeChartInstances(container);
  container.innerHTML = "";
  const cw = container.clientWidth;
  if (!cw) {
    // 容器尚未布局（宽度 0）：下一帧再试一次，避免 0.1 下限把封面缩成 96px 残影
    requestAnimationFrame(() => {
      if (document.contains(container) && container.clientWidth) {
        renderPageFit(container, page, deck, theme, imageMap);
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
  renderPage(stage, page, deck, theme, { imageMap });
  container.appendChild(stage);
}

// 封面尺寸跟随：窗口缩放 / 移动端地址栏伸缩 / 横竖屏切换导致卡片宽度变化时，
// 按最新宽度重渲染封面（亚像素级抖动 <1px 忽略）。
const thumbSizes = new WeakMap();
const sizeObserver = new ResizeObserver((entries) => {
  for (const ent of entries) {
    const thumb = ent.target;
    const entry = thumbEntries.get(thumb);
    if (!entry || thumb.classList.contains("loading")) continue;
    const proj = projectCache.get(entry.id);
    if (!proj) continue;
    const cw = ent.contentRect.width;
    const prev = thumbSizes.get(thumb);
    thumbSizes.set(thumb, cw);
    if (prev !== undefined && Math.abs(cw - prev) <= 1) continue;
    renderPageFit(thumb, proj.deck.pages[0], proj.deck, proj.theme, proj.imageMap);
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
          renderPageFit(thumb, proj.deck.pages[0], proj.deck, proj.theme, proj.imageMap);
        })
        .catch((err) => {
          if (!document.contains(thumb)) return;
          thumb.classList.remove("loading");
          thumb.innerHTML = `<div class="gallery-card-err">加载失败</div>`;
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
      mode === "local"
        ? `<span class="mode-dot"></span>本地模式：作品可编辑并写回项目目录`
        : `<span class="mode-dot"></span>线上模式：可编辑预览，保存将下载项目包（zip）`;
  }

  const entries = await loadManifest();
  if (!entries.length) {
    // 隐藏“编辑示例作品”快捷按钮（无示例时不可用）
    const btn = $("btn-open-example");
    if (btn) btn.style.display = "none";
    grid.innerHTML =
      `<div class="gallery-empty">examples/ 下暂无作品。<br>` +
      `把做好的 PPTD 项目文件夹（deck.pptd + pages/ + media/）放进 examples/ 即出现在这里。</div>`;
    return;
  }

  for (const entry of entries) {
    const card = document.createElement("div");
    card.className = "gallery-card";
    const thumb = document.createElement("div");
    thumb.className = "gallery-card-cover loading";
    const info = document.createElement("div");
    info.className = "gallery-card-info";
    const tags = (entry.tags || [])
      .map((t) => `<span class="gallery-tag">${escapeHtml(t)}</span>`)
      .join("");
    info.innerHTML =
      `<div class="gallery-card-title">${escapeHtml(entry.title)}` +
      `<span class="gallery-page-badge">${entry.pages} 页</span></div>` +
      (entry.description ? `<div class="gallery-card-desc">${escapeHtml(entry.description)}</div>` : "") +
      (tags ? `<div class="gallery-card-tags">${tags}</div>` : "");
    card.appendChild(thumb);
    card.appendChild(info);
    card.addEventListener("click", () => {
      // 跳转到编辑器并加载该作品（本地可编辑写回；线上可编辑、保存下载 zip）
      location.href = new URL("editor/?deck=" + encodeURIComponent(entry.deck), ROOT).href;
    });
    grid.appendChild(card);
    thumbEntries.set(thumb, entry);
    thumbObserver.observe(thumb);
    sizeObserver.observe(thumb);
  }
}
