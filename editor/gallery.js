// ============================================================================
// gallery.js — deck gallery view (read-only rendering, reuses renderer/page.js)
// ----------------------------------------------------------------------------
// The gallery = a grid of sample-work cover cards; clicking a card enters the
// editor (editor/?deck=...). Render chain: fetch examples/manifest.json →
// parseDeck → normalizeTheme/mergeFonts → renderPage (the cover box has a fixed
// ratio: PPT 16:9 / poster 3:4, with the work contained and centered).
// Works fully statically (GitHub Pages has no server; everything is fetched via
// relative paths; project media images resolve relative paths into absolute URLs).
// Performance: project files use the Cache API across sessions
// (app/project/project-cache.js) and thumbnails lazy-load (fetched on scroll) with
// a ResizeObserver re-rendering on card width changes.
// ============================================================================

import { fetchProjectTexts } from "./app/project/project-cache.js";
import { preloadIcons } from "./app/project/icons.js";
import { pickProjectFolder, hasDeck } from "./app/project/handle-io.js";
import { addRecent, setPendingProject } from "./app/project/handle-store.js";
import { registerRegistryFontFace } from "./app/project/font-manager.js";
import { createFileMenu } from "./app/file-menu.js";
import { showToast } from "./app/toast.js";
import { injectIcons } from "./icons.js";
import { THEME_MODES, bindThemeMode } from "./theme.js";
import { deckSize, parseDeck, parseFontResources, resolveTheme, yaml } from "../packages/model/index.js";
import { disposeChartInstances, renderPage } from "../packages/renderer/index.js";

injectIcons(); // topbar icon placeholders (data-icon) get the real SVG (single icon source icons.js)

// Theme tri-state (light / dark / follow system): the shared mechanism from theme.js
// (the editor's own binding), applied to <html> — the same root the editor themes, so
// the two pages read and write one localStorage key and stay in sync. A host embedding
// the gallery (DSH) can still override through applyThemeTokens on this element; no
// cleanup is needed here (the gallery page has no destroy path).
const themeMode = bindThemeMode();

// Repo root URL (this file lives in <root>/editor/, so ../ is the site root — works for local and GitHub Pages sub-paths)
const ROOT = new URL("../", import.meta.url).href;

let manifestCache = null;
const projectCache = new Map();

const $ = (id) => document.getElementById(id);

async function loadManifest() {
  if (manifestCache) return manifestCache;
  const res = await fetch(new URL("examples/manifest.json", ROOT));
  if (!res.ok) {
    // No examples/ (e.g. a trimmed release repo): degrade to an empty gallery, no error
    console.warn(`[gallery] 画廊清单不可用（${res.status}），按空画廊处理`);
    manifestCache = [];
    return manifestCache;
  }
  const data = await res.json();
  manifestCache = Array.isArray(data) ? data : data.entries || [];
  return manifestCache;
}

/** Register the deck's declared fonts (deck.fonts resource table): match the entry family
 *  name in the registry, the same pipeline as the editor's restoreFromDeck. The slot key
 *  is an arbitrary name the deck author chose and is not guaranteed to equal the registry
 *  key/family (e.g. a shorthand vs the full registry name), so querying with it silently
 *  misses and falls back to a system font. */
async function loadProjectFonts(deck) {
  const resources = parseFontResources(deck?.fonts);
  for (const [key, res] of Object.entries(resources)) {
    try {
      await registerRegistryFontFace(res.family || key);
    } catch {
      /* a single font failing does not affect the rest */
    }
  }
}

/** Load a project (manifest + pages → model + theme + fonts), with an in-session cache + Cache API cross-session cache. */
async function loadProject(entry) {
  if (projectCache.has(entry.id)) return projectCache.get(entry.id);
  const manifestUrl = new URL(entry.deck, ROOT).href;
  const { manifestText, pageTexts } = await fetchProjectTexts(manifestUrl, yaml.load);
  const deck = parseDeck(manifestText, pageTexts);
  const theme = resolveTheme(deck);
  await loadProjectFonts(deck);
  // Relative-path images → resolve to absolute URLs against the project manifest (img.src uses them directly)
  const imageMap = {};
  for (const page of deck.pages) {
    for (const el of page.elements || []) {
      if (el.elementType === "image" && el.src && !el.src.startsWith("data:") && !/^https?:/i.test(el.src)) {
        imageMap[el.src] = new URL(el.src, manifestUrl).href;
      }
    }
  }
  // Icon preload (cover page): FA SVGs go through local/CDN + Cache API, cached on the same layer as images
  const iconMap = {};
  if (deck.pages[0]) await preloadIcons([deck.pages[0]], iconMap);
  const proj = { deck, theme, imageMap, iconMap };
  projectCache.set(entry.id, proj);
  return proj;
}

/** Render one cover page contained in the card cover box: the box ratio is fixed (PPT 16:9 / poster
 *  3:4, see gallery.css), the work scales to min(cw/pw, ch/ph) and centers, and the gap is left as the
 *  neutral cover backing (a mounting feel, keeping the grid tidy row by row). */
function renderPageFit(container, page, deck, theme, imageMap, iconMap = {}) {
  disposeChartInstances(container);
  container.innerHTML = "";
  const cw = container.clientWidth;
  const ch = container.clientHeight;
  if (!cw || !ch) {
    // The container is not laid out yet (zero size): retry next frame, avoiding the 0.1 floor shrinking the cover to a ghost
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

// Cover size following: re-render the cover at the latest width when window resize /
// mobile address-bar changes / orientation changes alter the card width (sub-pixel
// jitter <1px is ignored).
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
// Thumbnail lazy loading: cards enter the grid first (skeleton placeholder) and the
// project is fetched and rendered only once scrolled into view (400px preheat).
// The first paint makes zero project requests, so the gallery opens instantly.
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
          if (!document.contains(canvas)) return; // left the page before loading finished
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

/** Detect the runtime mode: local serve has /api/ping; pure-static GitHub Pages → remote mode. */
async function detectMode() {
  try {
    const res = await fetch(new URL("api/ping", ROOT), { cache: "no-store" });
    if (res.ok) return "local";
  } catch {
    /* network error → remote */
  }
  return "remote";
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/** Gallery: a grid of sample-work cover cards (click → editor). */
export async function showGallery() {
  const grid = $("gallery-grid");
  grid.hidden = false;
  grid.innerHTML = "";

  // Mode badge
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

  // The File menu (same shell as the editor): the gallery is the start page, so it holds open editor / open / recent
  const fileBtn = $("btn-file");
  if (fileBtn) {
    const supported = "showDirectoryPicker" in window; // handle read/write bypasses the server, available locally and online
    createFileMenu(fileBtn, async ({ menu, item, sep, label, appendRecents }) => {
      menu.appendChild(item("打开编辑器", { onClick: () => (location.href = new URL("editor/", ROOT).href) }));
      const openItem = item("打开本地项目", { onClick: openLocalFromPicker });
      if (!supported) openItem.hidden = true; // hidden in unsupported browsers
      menu.appendChild(openItem);
      if (supported) {
        await appendRecents(menu, (entry) => {
          setPendingProject(entry.id); // the editor reopens from this (no prompt while the grant holds)
          location.href = new URL("editor/", ROOT).href;
        });
      }
      // Appearance tri-state (light / dark / follow system): labels and storage key come
      // from theme.js, so this menu and the editor's theme panel are two views of one choice
      // (the checkmark marks the saved mode, re-read on every open)
      menu.appendChild(sep(), label("外观"));
      const current = themeMode.get();
      for (const [mode, name] of THEME_MODES) {
        menu.appendChild(item(name, { hint: mode === current ? "✓" : "", onClick: () => themeMode.set(mode) }));
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

  // Two tabs: PPT / poster (the entry is specified by meta.yaml kind, defaulting to ppt)
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
      card.style.setProperty("--card-i", i); // [experiment] staggered float-in index (pairs with gallery-card-in in gallery.css)
      const thumb = document.createElement("div");
      thumb.className = "gallery-card-cover loading";
      // The render target canvas sits level with the page-count slot: clearing the canvas on re-render does not take it with it
      const canvas = document.createElement("div");
      canvas.className = "gallery-card-canvas";
      thumb.appendChild(canvas);
      const info = document.createElement("div");
      info.className = "gallery-card-info";
      const tags = (entry.tags || [])
        .map((t) => `<span class="gallery-tag">${escapeHtml(t)}</span>`)
        .join("");
      // The title/description/tags slots always exist (empty when absent), so card info height is uniform and the grid stays tidy;
      // the page count rides the title row as plain meta text — it never covers the cover
      info.innerHTML =
        `<div class="gallery-card-title-row"><span class="gallery-card-title">${escapeHtml(entry.title)}</span><span class="gallery-card-pages">${entry.pages} 页</span></div>` +
        `<div class="gallery-card-desc">${escapeHtml(entry.description || "")}</div>` +
        `<div class="gallery-card-tags">${tags}</div>`;
      card.appendChild(thumb);
      card.appendChild(info);
      card.addEventListener("click", () => {
        // Jump to the editor and load this work (editable + writable locally; online editable with zip download on save)
        location.href = new URL("editor/?deck=" + encodeURIComponent(entry.deck), ROOT).href;
      });
      grid.appendChild(card);
      thumbEntries.set(canvas, entry);
      thumbObserver.observe(canvas);
      sizeObserver.observe(canvas);
    }
  }

  /** Align the slider indicator with the active tab. FLIP: left/width jump instantly to the
      target, and the visual offset is compensated with transform — start and end are both
      measured in viewport coords (getBoundingClientRect) and include in-flight animation, so
      rapid clicks continue from "where it looks like it is" without teleporting.
      instant=true (resize/fonts ready) snaps it directly into place. */
  function moveTabIndicator(instant = false) {
    const active = tabsEl?.querySelector(".gallery-tab.active");
    const bar = $("gallery-tab-indicator");
    if (!active || !bar) return;
    const startLeft = bar.getBoundingClientRect().left; // current visual position (viewport coords)
    bar.style.transition = "none";
    bar.style.transform = "";
    bar.style.left = `${active.offsetLeft}px`;
    bar.style.width = `${active.offsetWidth}px`;
    const dx = instant ? 0 : startLeft - bar.getBoundingClientRect().left; // difference in the same coordinate system
    if (!dx) {
      bar.style.transition = "";
      return;
    }
    bar.style.transform = `translateX(${dx}px)`;
    bar.getBoundingClientRect(); // force reflow so the starting offset applies first
    bar.style.transition = "";
    bar.style.transform = ""; // transition from dx back to 0, sliding to the target
  }

  function setTab(kind) {
    tabsEl?.querySelectorAll(".gallery-tab").forEach((b) => b.classList.toggle("active", b.dataset.kind === kind));
    moveTabIndicator();
    grid.classList.toggle("poster-grid", kind === "poster");
    // Defer the grid rebuild by one frame: the slider animation starts on a clean main thread
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
        // Smooth scroll to top: pairs with the slider and the entry animation, and avoids a vertical jolt when the current
        // scrollTop exceeds the new content height
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
    window.addEventListener("resize", () => moveTabIndicator(true));
    document.fonts?.ready.then(() => moveTabIndicator(true)); // tab widths may change once fonts load; snap into place
  }
  setTab("ppt");
}

/** "Open local project": native picker → validate deck.pptd → record recent → jump to the editor to reopen. */
async function openLocalFromPicker() {
  try {
    const handle = await pickProjectFolder();
    if (!handle) return; // user cancelled
    if (!(await hasDeck(handle))) {
      showToast("所选文件夹里没有 deck.pptd，请选择 PPTD 项目文件夹", "danger", 5000);
      return;
    }
    const entry = await addRecent(handle);
    if (entry) setPendingProject(entry.id); // the editor reopens from this (the same-session grant still holds, no prompt)
    location.href = new URL("editor/", ROOT).href;
  } catch (err) {
    showToast(`打开失败: ${err.message}`, "danger");
  }
}
