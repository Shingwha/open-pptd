// ============================================================================
// interaction/font-panel.js — topbar font popover
// ----------------------------------------------------------------------------
// Same shell as the color popover (anchored below the button, right-aligned,
// outside-click close, reposition on resize), with three scrolling sections:
//   1. My fonts: in-library rows with inline preview (bytes already in memory,
//      zero cost) + subset/embed toggles + delete
//   2. Built-in font library: registry grouped by category; "preview" fetches
//      bytes on demand (Cache API, cross-session), "add" puts it in the library;
//      system-font rows copy the registered name
//   3. Add bar: local file / web URL (Enter submits)
// Every change applies fontManager.syncToDeck() immediately; there is no "done"
// button (matching the color popover's immediate effect).
// ============================================================================

import { showToast } from "../app/toast.js";
import { attachPopover } from "../popover.js";
import { fetchFontBytes, loadFontRegistry } from "../../packages/model/index.js";

/** Built-in library category labels (assets/fonts/registry.json `category`). */
const CAT_LABEL = { sans: "黑体", serif: "宋/衬线", handwriting: "手写/书法", display: "标题/艺术", pixel: "像素" };

/** Inline preview sample: Han characters + Latin + digits, showing all three glyph families at once. */
const PREVIEW_TEXT = "永 Aa 36";

/** Currently bound open function (registered by bindFontPanel; openFontPanel serves external entry points such as export dialogs). */
let openPanel = null;

/** Open the font popover (silently ignored when not bound). */
export function openFontPanel() {
  openPanel?.();
}

export function bindFontPanel({ state, io, anchor }) {
  const fm = io.fontManager;
  const ac = new AbortController();
  let panel = null;
  let bodyEl = null; // scrolling list area (kept across content rebuilds so scroll position survives)
  let searchEl = null;
  let noMatchEl = null;
  /** Families whose FontFace is already registered (preview state remembered across renders). */
  const previewed = new Set();
  /** Registry: undefined = loading, null = failed, object = ready. */
  let registry = undefined;

  loadFontRegistry()
    .then((r) => (registry = r))
    .catch(() => (registry = null))
    .finally(() => {
      if (panel?.classList.contains("open")) render();
    });

  const isOpen = () => panel?.classList.contains("open");

  /** Single funnel after a change: sync the resource table + re-render + re-apply search filter. */
  function commit() {
    fm.syncToDeck();
    render();
  }

  // --------------------------------------------------------------------------
  // Build (shell once; content rebuilt on every open/change)
  // --------------------------------------------------------------------------
  function build() {
    panel = document.createElement("div");
    panel.className = "font-panel";

    const head = document.createElement("div");
    head.className = "font-panel-head";
    const title = document.createElement("span");
    title.className = "font-panel-title";
    title.textContent = "字体";
    const hint = document.createElement("span");
    hint.className = "font-panel-hint";
    hint.textContent = "添加后可在文字属性「字体」下拉选用，导出按勾选嵌入";
    head.append(title, hint);
    panel.appendChild(head);

    searchEl = document.createElement("input");
    searchEl.type = "text";
    searchEl.className = "font-search";
    searchEl.placeholder = "搜索字体…";
    searchEl.addEventListener("input", () => applySearch());
    panel.appendChild(searchEl);

    bodyEl = document.createElement("div");
    bodyEl.className = "font-body";
    panel.appendChild(bodyEl);

    noMatchEl = document.createElement("div");
    noMatchEl.className = "font-empty";
    noMatchEl.textContent = "没有匹配的字体";
    noMatchEl.hidden = true;
    bodyEl.appendChild(noMatchEl);

    panel.appendChild(buildAddBar());
    document.body.appendChild(panel);
    render();
  }

  /** Bottom add bar: local file (multi-select) + web URL (form submits on Enter). */
  function buildAddBar() {
    const bar = document.createElement("div");
    bar.className = "font-add";

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".ttf,.otf";
    fileInput.multiple = true;
    fileInput.className = "font-add-file";
    fileInput.addEventListener("change", async () => {
      for (const file of fileInput.files) {
        try {
          const family = await fm.addLocalFile(file);
          showToast(`已添加本地字体: ${family}`, "success");
        } catch (e) {
          showToast(`${file.name} 添加失败: ${e.message}`, "danger");
        }
      }
      fileInput.value = "";
      commit();
    });
    const fileBtn = document.createElement("button");
    fileBtn.type = "button";
    fileBtn.className = "btn btn-sm";
    fileBtn.textContent = "选择本地文件…";
    fileBtn.addEventListener("click", () => fileInput.click());

    const form = document.createElement("form");
    form.className = "font-add-url";
    const urlInput = document.createElement("input");
    urlInput.type = "text";
    urlInput.placeholder = "网络字体 URL（需 CORS）";
    const addBtn = document.createElement("button");
    addBtn.type = "submit";
    addBtn.className = "btn btn-sm btn-primary";
    addBtn.textContent = "添加";
    let adding = false;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const url = urlInput.value.trim();
      if (!url || adding) return;
      adding = true;
      addBtn.disabled = true;
      addBtn.textContent = "添加中…";
      try {
        const family = await fm.addUrl(url);
        urlInput.value = "";
        showToast(`已添加网络字体: ${family}`, "success");
        commit();
      } catch (err) {
        showToast(`添加失败: ${err.message}`, "danger");
      } finally {
        adding = false;
        addBtn.disabled = false;
        addBtn.textContent = "添加";
      }
    });
    form.append(urlInput, addBtn);

    bar.append(fileBtn, form, fileInput);
    return bar;
  }

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------
  function render() {
    if (!bodyEl) return;
    const q = searchEl?.value.trim().toLowerCase() || "";
    bodyEl.innerHTML = "";
    bodyEl.appendChild(renderMyFonts());
    bodyEl.appendChild(renderLibrary());
    applySearch(q);
  }

  /** "My fonts" section: in-library rows (preview + meta + toggles + delete). */
  function renderMyFonts() {
    const wrap = document.createElement("div");
    wrap.className = "font-secwrap";

    const sec = document.createElement("div");
    sec.className = "font-sec";
    const entries = Object.entries(state.fontLibrary);
    sec.textContent = entries.length ? `我的字体（${entries.length}）` : "我的字体";
    wrap.appendChild(sec);

    if (!entries.length) {
      const empty = document.createElement("div");
      empty.className = "font-empty";
      empty.textContent = "尚未添加字体。可从下方内置字体库选用，或选择本地文件 / 输入网络 URL。";
      wrap.appendChild(empty);
      return wrap;
    }
    for (const [family, f] of entries) wrap.appendChild(myFontRow(family, f));
    return wrap;
  }

  function myFontRow(family, f) {
    const row = document.createElement("div");
    row.className = "font-item";
    row.dataset.q = `${family}`.toLowerCase();

    const main = document.createElement("div");
    main.className = "font-item-main";
    if (f.bytes) {
      const preview = document.createElement("div");
      preview.className = "font-item-preview";
      preview.textContent = PREVIEW_TEXT;
      preview.style.fontFamily = `"${family}"`;
      main.appendChild(preview);
    }
    const info = document.createElement("div");
    info.className = "font-item-info";
    const name = document.createElement("span");
    name.className = "font-item-name";
    name.textContent = family;
    info.appendChild(name);
    const srcLabel = f.source === "registry" ? "内置库" : f.source === "url" ? "网络" : "本地";
    const meta = document.createElement("span");
    meta.className = "font-item-meta";
    meta.textContent = f.bytes ? `${srcLabel} · ${fmtSize(f.size)}` : `${srcLabel} · 未加载`;
    info.appendChild(meta);
    main.appendChild(info);
    row.appendChild(main);

    // Recovery entry for unloaded fonts: retry the URL for url fonts, re-pick the file for file fonts
    if (!f.bytes && f.source === "url" && f.url) {
      const retryBtn = mkBtn("重试", async (btn) => {
        btn.disabled = true;
        btn.textContent = "加载中…";
        try {
          await fm.addUrl(f.url);
          showToast(`已加载: ${family}`, "success");
          commit();
        } catch (e) {
          showToast(`加载失败: ${e.message}`, "danger");
          btn.disabled = false;
          btn.textContent = "重试";
        }
      });
      row.appendChild(retryBtn);
    } else if (!f.bytes && f.file) {
      const reloadInput = document.createElement("input");
      reloadInput.type = "file";
      reloadInput.accept = ".ttf,.otf";
      reloadInput.className = "font-add-file";
      reloadInput.addEventListener("change", async () => {
        const file = reloadInput.files?.[0];
        if (!file) return;
        try {
          await fm.reloadLocalFile(family, file);
          showToast(`已加载: ${family}`, "success");
        } catch (e) {
          showToast(`加载失败: ${e.message}`, "danger");
        }
        commit();
      });
      row.append(mkBtn("加载文件…", () => reloadInput.click()), reloadInput);
    }

    // Subset / embed toggles (chips: click flips, applied silently)
    row.appendChild(mkChip("子集", "导出时只嵌入用到的字形，体积更小", f.subset, (on) => {
      f.subset = on;
      commit();
    }));
    row.appendChild(mkChip("嵌入", "导出 PPTX 时随文件嵌入，换机不丢字体", f.embed, (on) => {
      f.embed = on;
      commit();
    }));

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "font-del";
    delBtn.textContent = "✕";
    delBtn.title = `删除 ${family}`;
    delBtn.addEventListener("click", () => {
      fm.removeFont(family);
      showToast(`已删除 ${family}`, "info");
      commit();
    });
    row.appendChild(delBtn);
    return row;
  }

  /** "Built-in library" section: registry grouped by category + system fonts (preview on demand + add / copy). */
  function renderLibrary() {
    const wrap = document.createElement("div");
    wrap.className = "font-secwrap";

    const sec = document.createElement("div");
    sec.className = "font-sec";
    sec.textContent = "内置字体库";
    wrap.appendChild(sec);

    if (registry === undefined) {
      const loading = document.createElement("div");
      loading.className = "font-empty";
      loading.textContent = "内置字体库加载中…";
      wrap.appendChild(loading);
      return wrap;
    }
    if (!registry?.fonts?.length) {
      const fail = document.createElement("div");
      fail.className = "font-empty";
      fail.textContent = "内置字体库不可用（离线或注册表缺失）。";
      wrap.appendChild(fail);
      return wrap;
    }

    const byCat = {};
    for (const f of registry.fonts) (byCat[f.category] ||= []).push(f);
    for (const [cat, list] of Object.entries(byCat)) {
      const group = document.createElement("div");
      group.className = "font-group";
      const catTitle = document.createElement("div");
      catTitle.className = "font-cat";
      catTitle.textContent = CAT_LABEL[cat] || cat;
      group.appendChild(catTitle);
      for (const f of list) group.appendChild(registryRow(f));
      wrap.appendChild(group);
    }

    if (registry.systemFonts?.length) {
      const group = document.createElement("div");
      group.className = "font-group";
      const catTitle = document.createElement("div");
      catTitle.className = "font-cat";
      catTitle.textContent = "系统字体（仅声明不嵌入）";
      group.appendChild(catTitle);
      for (const f of registry.systemFonts) group.appendChild(systemFontRow(f));
      wrap.appendChild(group);
    }
    return wrap;
  }

  /** Registry row: preview text (loaded on demand) + name + [preview] [add/✓]. */
  function registryRow(f) {
    const row = document.createElement("div");
    row.className = "font-item";
    row.dataset.q = `${f.key} ${f.family}`.toLowerCase();

    const main = document.createElement("div");
    main.className = "font-item-main";
    const preview = document.createElement("div");
    preview.className = "font-item-preview";
    preview.textContent = PREVIEW_TEXT;
    const inLibrary = !!state.fontLibrary[f.family];
    if (previewed.has(f.family)) preview.style.fontFamily = `"${f.family}"`;
    main.appendChild(preview);
    const info = document.createElement("div");
    info.className = "font-item-info";
    const name = document.createElement("span");
    name.className = "font-item-name";
    name.textContent = f.key;
    name.title = `注册名: ${f.family}\n${f.style}\n${f.license}`;
    info.appendChild(name);
    const meta = document.createElement("span");
    meta.className = "font-item-meta";
    meta.textContent = f.family;
    info.appendChild(meta);
    main.appendChild(info);
    row.appendChild(main);

    const ops = document.createElement("div");
    ops.className = "font-item-ops";
    if (!previewed.has(f.family)) {
      ops.appendChild(mkBtn("预览", async (btn) => {
        btn.disabled = true;
        btn.textContent = "加载中…";
        try {
          const bytes = await fetchFontBytes(f);
          if (!bytes) throw new Error("字体文件不可用");
          await fm.registerFace(f.family, bytes);
          previewed.add(f.family);
          render();
        } catch (e) {
          showToast(`预览加载失败: ${e.message}`, "danger");
          btn.disabled = false;
          btn.textContent = "预览";
        }
      }));
    }
    if (inLibrary) {
      const added = mkBtn("✓ 已添加", null);
      added.disabled = true;
      ops.appendChild(added);
    } else {
      ops.appendChild(mkBtn("添加", async (btn) => {
        btn.disabled = true;
        btn.textContent = "添加中…";
        try {
          const family = await fm.addRegistryFont(f.key);
          previewed.add(family);
          showToast(`已添加内置字体: ${family}`, "success");
          commit();
        } catch (e) {
          showToast(`添加失败: ${e.message}`, "danger");
          btn.disabled = false;
          btn.textContent = "添加";
        }
      }));
    }
    row.appendChild(ops);
    return row;
  }

  /** System-font row: no bytes, only copies the registered name (paste into an element's fontFamily). */
  function systemFontRow(f) {
    const row = document.createElement("div");
    row.className = "font-item";
    row.dataset.q = `${f.key} ${f.family}`.toLowerCase();

    const main = document.createElement("div");
    main.className = "font-item-main";
    const info = document.createElement("div");
    info.className = "font-item-info";
    const name = document.createElement("span");
    name.className = "font-item-name";
    name.textContent = f.key;
    name.title = `注册名: ${f.family}\n平台: ${f.platform}\n仅声明不嵌入，需打开方系统已装`;
    info.appendChild(name);
    const meta = document.createElement("span");
    meta.className = "font-item-meta";
    meta.textContent = f.family;
    info.appendChild(meta);
    main.appendChild(info);
    row.appendChild(main);

    const ops = document.createElement("div");
    ops.className = "font-item-ops";
    ops.appendChild(mkBtn("复制", async () => {
      try {
        await navigator.clipboard.writeText(f.family);
        showToast(`已复制注册名: ${f.family}`, "success");
      } catch {
        showToast("复制失败，请手动抄写注册名", "danger");
      }
    }));
    row.appendChild(ops);
    return row;
  }

  // --------------------------------------------------------------------------
  // Search filter (matches row dataset.q; hides empty groups and sections; shows
  // the no-match hint when everything is filtered out)
  // --------------------------------------------------------------------------
  function applySearch(qOverride) {
    if (!panel || !bodyEl) return;
    const q = (qOverride !== undefined ? qOverride : searchEl.value).trim().toLowerCase();
    let anyVisible = false;
    for (const wrap of bodyEl.querySelectorAll(".font-secwrap")) {
      const items = [...wrap.querySelectorAll(".font-item")];
      let visible = 0;
      for (const it of items) {
        const hit = !q || it.dataset.q?.includes(q);
        it.hidden = !hit;
        if (hit) visible++;
      }
      for (const g of wrap.querySelectorAll(".font-group")) {
        g.hidden = ![...g.querySelectorAll(".font-item")].some((i) => !i.hidden);
      }
      wrap.hidden = visible === 0;
      anyVisible ||= visible > 0;
    }
    noMatchEl.hidden = anyVisible || !q;
  }

  // --------------------------------------------------------------------------
  // Small builders
  // --------------------------------------------------------------------------
  /** Small text button (btn btn-sm); onClick(btn) supports async button states. */
  function mkBtn(text, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-sm";
    btn.textContent = text;
    if (onClick) btn.addEventListener("click", () => onClick(btn));
    return btn;
  }

  /** Toggle chip: pill button, active = accent tint (visually matching the add-cat active state). */
  function mkChip(text, title, on, onToggle) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "font-chip" + (on ? " active" : "");
    chip.textContent = text;
    chip.title = title;
    chip.addEventListener("click", () => {
      const next = !chip.classList.contains("active");
      chip.classList.toggle("active", next);
      onToggle(next);
    });
    return chip;
  }

  function fmtSize(n) {
    return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`;
  }

  // --------------------------------------------------------------------------
  // Toggle (shell matches theme-panel.js; positioning / outside-click / resize
  // repositioning go through popover.js)
  // --------------------------------------------------------------------------
  let popover = null;

  function open() {
    if (!panel) {
      build();
      popover = attachPopover(anchor, panel, { align: "right", isOpen, close });
    }
    render();
    panel.classList.add("open");
    popover.position();
  }

  function close() {
    panel?.classList.remove("open");
  }

  function toggle() {
    if (isOpen()) close();
    else open();
  }

  anchor.addEventListener("click", (e) => {
    e.stopPropagation();
    toggle();
  }, { signal: ac.signal });

  openPanel = open;

  return {
    /** Release: detach the anchor listener, drop the popover and global close listeners, unregister the external entry. */
    destroy() {
      ac.abort();
      popover?.destroy();
      popover = null;
      panel?.remove();
      panel = null;
      if (openPanel === open) openPanel = null;
    },
  };
}
