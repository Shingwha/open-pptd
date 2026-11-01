// editor/gallery.js — Home view (gallery grid) of the single application shell
// /editor/ without ?deck= is Home; with ?deck= it is the editor. createHomeView
// renders the Home skeleton into the shell mount point and returns a destroy handle.
// Every card lazily loads its project texts and mounts a real createPreview as an
// embedded instance (live:false — a cover grid must not open one SSE channel per
// card). Navigation out is delegated to the shell's route table (main.js).

import { fetchProjectTexts } from "./app/project/project-cache.js";
import { createFileMenu } from "./app/file-menu.js";
import { injectIcons } from "./icons.js";
import { homeSkeletonHtml } from "./skeleton.js";
import { createPreview } from "./preview.js";
import { httpSource } from "./app/project/source.js";
import { THEME_MODES } from "./theme.js";
import { yaml } from "../packages/model/index.js";

// Repo root URL (this file lives in <root>/editor/, so ../ is the site root)
const ROOT = new URL("../", import.meta.url).href;

/**
 * Mount the Home view.
 * @param {object} deps
 *   root*          shell mount point (the view owns its contents)
 *   themeMode*     bindThemeMode handle of the shell (shared with the editor)
 *   toast          instance toast service
 *   onOpenDeck(deck)     navigate to the editor for a manifest path
 *   onNewBlank()         navigate to a blank editor
 *   onOpenLocal()        OS folder picker flow (shell)
 *   onOpenRecent(entry)  reopen a recent local project (shell)
 * @returns {{ destroy(): void }}
 */
export function createHomeView({
  root,
  themeMode,
  toast,
  onOpenDeck = () => {},
  onNewBlank = () => {},
  onOpenLocal = () => {},
  onOpenRecent = () => {},
}) {
  root.innerHTML = homeSkeletonHtml();
  injectIcons(root);

  const $ = (id) => root.querySelector(`#${CSS.escape(id)}`);
  const grid = $("gallery-grid");
  const tabsEl = $("gallery-tabs");
  const modeEl = $("gallery-mode");

  const ac = new AbortController();
  const previews = new Set();
  const previewByCanvas = new WeakMap();
  const entryByCanvas = new WeakMap();
  const lastWidth = new WeakMap();
  let destroyed = false;
  let fileMenu = null;
  let manifestCache = null;
  let currentEntries = []; // last manifest (empty-state "全部作品" action)
  const textCache = new Map(); // entry.id → { manifestText, pageFiles, manifestUrl }

  // --------------------------------------------------------------------------
  // Manifest + project texts (same cache layer as the editor's project reads)
  // --------------------------------------------------------------------------
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

  async function loadProjectTexts(entry) {
    if (textCache.has(entry.id)) return textCache.get(entry.id);
    const manifestUrl = new URL(entry.deck, ROOT).href;
    const { manifestText, pageTexts } = await fetchProjectTexts(manifestUrl, yaml.load);
    const data = { manifestText, pageFiles: pageTexts, manifestUrl };
    textCache.set(entry.id, data);
    return data;
  }

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

  // --------------------------------------------------------------------------
  // File menu (same shell as the editor; Home holds new/open/recent + appearance)
  // --------------------------------------------------------------------------
  const fileBtn = $("btn-file");
  if (fileBtn) {
    fileMenu = createFileMenu(fileBtn, async ({ menu, item, sep, label, appendRecents }) => {
      menu.appendChild(item("新建空白演示", { onClick: onNewBlank }));
      const supported = "showDirectoryPicker" in window; // handle read/write bypasses the server
      const openItem = item("打开本地项目", { onClick: onOpenLocal });
      if (!supported) openItem.hidden = true; // hidden in unsupported browsers
      menu.appendChild(openItem);
      if (supported) await appendRecents(menu, onOpenRecent);
      // Appearance tri-state (light / dark / follow system): labels and storage key come
      // from theme.js, so this menu and the editor's Design panel are two views of one choice
      menu.appendChild(sep(), label("外观"));
      const current = themeMode.get();
      for (const [mode, name] of THEME_MODES) {
        menu.appendChild(item(name, { hint: mode === current ? "✓" : "", onClick: () => themeMode.set(mode) }));
      }
    });
  }

  // Empty-state action (new blank / back to all works): one delegation for every render path
  grid?.addEventListener(
    "click",
    (e) => {
      const btn = e.target.closest("[data-empty-action]");
      if (!btn) return;
      e.stopPropagation();
      if (btn.dataset.emptyAction === "new") onNewBlank();
      else setTab("ppt", currentEntries);
    },
    { signal: ac.signal }
  );

  // Home brand: jump back to the top of the grid (the shell intercepts .brand-home in the editor view)
  root.querySelector(".brand-home")?.addEventListener(
    "click",
    (e) => {
      e.preventDefault();
      grid?.scrollIntoView({ block: "start" });
    },
    { signal: ac.signal }
  );

  // --------------------------------------------------------------------------
  // Cover lazy loading: card enters the grid → load project texts → embedded preview
  // --------------------------------------------------------------------------
  const previewObserver = new IntersectionObserver(
    (entries) => {
      for (const ent of entries) {
        if (!ent.isIntersecting) continue;
        previewObserver.unobserve(ent.target);
        mountPreview(ent.target);
      }
    },
    { rootMargin: "400px" }
  );

  const sizeObserver = new ResizeObserver((entries) => {
    for (const ent of entries) {
      const canvas = ent.target;
      const preview = previewByCanvas.get(canvas);
      if (!preview) continue;
      const w = ent.contentRect.width;
      const prev = lastWidth.get(canvas);
      lastWidth.set(canvas, w);
      if (prev !== undefined && Math.abs(w - prev) <= 1) continue;
      preview.view.render(); // refit the canvas to the new card width
    }
  });

  async function mountPreview(canvas) {
    const entry = entryByCanvas.get(canvas);
    if (!entry || destroyed) return;
    const cover = canvas.parentElement;
    try {
      const data = await loadProjectTexts(entry);
      if (destroyed || !canvas.isConnected) return;
      const preview = createPreview(canvas, {
        source: httpSource({ deckUrl: data.manifestUrl }),
        // Already-fetched texts: the preview parses/loads fonts/images through its own pipeline
        deck: { manifestText: data.manifestText, pageFiles: data.pageFiles, manifestPath: data.manifestUrl },
        chrome: "embedded",
        live: false, // covers never hold a push channel
      });
      previews.add(preview);
      previewByCanvas.set(canvas, preview);
      await preview.ready;
      if (destroyed) return;
      cover?.classList.remove("loading");
    } catch (err) {
      cover?.classList.remove("loading");
      if (!destroyed) canvas.innerHTML = `<div class="gallery-card-err">加载失败</div>`;
      console.error(`[gallery] ${entry.id} 加载失败:`, err);
    }
  }

  // --------------------------------------------------------------------------
  // Grid + tabs
  // --------------------------------------------------------------------------
  const TABS = [
    { kind: "ppt", label: "PPT" },
    { kind: "poster", label: "海报" },
  ];

  /** Empty state: serif title + one line + one action (new blank / back to all). */
  function emptyHtml({ title, hint, action, label }) {
    return (
      `<div class="gallery-empty">` +
      `<p class="gallery-empty-title">${title}</p>` +
      `<p class="gallery-empty-hint">${hint}</p>` +
      `<button type="button" class="btn btn-primary gallery-empty-action" data-empty-action="${action}">${label}</button>` +
      `</div>`
    );
  }

  function fillGrid(list) {
    grid.innerHTML = "";
    if (!list.length) {
      grid.innerHTML = currentEntries.length
        ? emptyHtml({
            title: "此分类下暂无作品",
            hint: "切回「PPT」查看已有作品。",
            action: "all",
            label: "查看全部作品",
          })
        : emptyHtml({
            title: "还没有作品",
            hint: "把 PPTD 项目文件夹（deck.pptd + pages/ + media/）放进 examples/ 即出现在这里。",
            action: "new",
            label: "新建空白演示",
          });
      return;
    }
    for (const entry of list) {
      const card = document.createElement("div");
      card.className = "gallery-card";
      const thumb = document.createElement("div");
      thumb.className = "gallery-card-cover loading";
      // The render target canvas sits level with the cover: clearing it on re-render keeps the card shell
      const canvas = document.createElement("div");
      canvas.className = "gallery-card-canvas";
      thumb.appendChild(canvas);
      const info = document.createElement("div");
      info.className = "gallery-card-info";
      const tags = (entry.tags || [])
        .map((t) => `<span class="gallery-tag">${escapeHtml(t)}</span>`)
        .join("");
      // Title + page count / description / tags (empty slots keep card heights aligned)
      info.innerHTML =
        `<div class="gallery-card-title-row"><span class="gallery-card-title">${escapeHtml(entry.title)}</span><span class="gallery-card-pages">${entry.pages} 页</span></div>` +
        `<div class="gallery-card-desc">${escapeHtml(entry.description || "")}</div>` +
        `<div class="gallery-card-tags">${tags}</div>`;
      card.appendChild(thumb);
      card.appendChild(info);
      card.addEventListener("click", () => onOpenDeck(entry.deck));
      grid.appendChild(card);
      entryByCanvas.set(canvas, entry);
      previewObserver.observe(canvas);
      sizeObserver.observe(canvas);
    }
  }

  function setTab(kind, entries) {
    tabsEl?.querySelectorAll(".gallery-tab").forEach((b) => {
      const on = b.dataset.kind === kind;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    grid.classList.toggle("poster-grid", kind === "poster");
    if (!destroyed) fillGrid(entries.filter((e) => (e.kind || "ppt") === kind));
  }

  async function show() {
    grid.hidden = false;

    // Mode badge
    const mode = await detectMode();
    if (destroyed) return;
    if (modeEl) {
      modeEl.hidden = false;
      modeEl.className = "gallery-mode " + mode;
      modeEl.innerHTML =
        mode === "local" ? `<span class="mode-dot"></span>本地模式` : `<span class="mode-dot"></span>线上模式`;
      modeEl.title =
        mode === "local" ? "作品可编辑并写回项目目录" : "可编辑预览，保存将下载项目包（zip）";
    }

    const entries = await loadManifest();
    if (destroyed) return;
    currentEntries = entries;
    if (!entries.length) {
      grid.hidden = false;
      grid.innerHTML = emptyHtml({
        title: "还没有作品",
        hint: "把 PPTD 项目文件夹（deck.pptd + pages/ + media/）放进 examples/ 即出现在这里。",
        action: "new",
        label: "新建空白演示",
      });
      return;
    }

    if (tabsEl) {
      tabsEl.hidden = false;
      tabsEl.innerHTML = TABS.map((t) => {
        const n = entries.filter((e) => (e.kind || "ppt") === t.kind).length;
        return `<button type="button" class="gallery-tab" role="tab" aria-selected="false" data-kind="${t.kind}">${t.label}<span class="cnt">${n}</span></button>`;
      }).join("");
    }
    tabsEl?.addEventListener(
      "click",
      (ev) => {
        const btn = ev.target.closest(".gallery-tab");
        if (btn && !btn.classList.contains("active")) {
          setTab(btn.dataset.kind, entries);
          window.scrollTo({ top: 0 });
        }
      },
      { signal: ac.signal }
    );
    setTab("ppt", entries);
  }

  show().catch((err) => {
    console.error("画廊加载失败:", err);
    if (!grid || destroyed) return;
    grid.hidden = false;
    grid.innerHTML = emptyHtml({
      title: "画廊加载失败",
      hint: escapeHtml(err.message),
      action: "new",
      label: "新建空白演示",
    });
    toast?.show?.(`画廊加载失败: ${err.message}`, "danger");
  });

  return {
    /** Release: previews, observers, listeners, file menu and the Home DOM. */
    destroy() {
      if (destroyed) return;
      destroyed = true;
      ac.abort();
      previewObserver.disconnect();
      sizeObserver.disconnect();
      fileMenu?.destroy?.();
      fileMenu = null;
      for (const preview of previews) {
        try {
          preview.destroy();
        } catch {
          /* one failed teardown must not block the rest */
        }
      }
      previews.clear();
      textCache.clear();
      if (root.firstElementChild?.id === "home-view") root.innerHTML = "";
    },
  };
}
