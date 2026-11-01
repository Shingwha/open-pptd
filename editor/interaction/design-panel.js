// editor/interaction/design-panel.js — Design drawer (colors / font library / appearance)
// One topbar entry ("设计", #btn-design), loaded lazily by design-panel-lazy.js.
// Tabs: colors (deck theme.colors tokens; add/edit/delete, undoable), fonts (deck status,
// global library, import/delete), appearance (light/dark/auto, viewer UI only, never
// deck.theme). 3.2 removed the theme library: there are no theme cards, presets, save/
// import/export actions. Color edits never touch theme.textStyles / theme.tableStyles.

import * as controls from "../ui.js";
// Instance services (ui.dialogs / ui.toast) are injected by createDesignPanel;
import { formatBytes } from "../app/export-image.js";
import { THEME_MODES } from "../theme.js";
import { SYSTEM_FONTS } from "../app/project/font-manager.js";
import {
  findFont,
  fontFileUrl,
  fetchFontBytes,
  listColorTokens,
  loadFontRegistry,
  parseFontResources,
  removeColorToken,
  resolveColor,
  setColorToken,
} from "../../packages/model/index.js";

// Constants
const API = { fonts: "/api/fonts" };

/** Chinese labels for the standard semantic tokens (custom tokens show their key). */
const STD_LABELS = {
  primary: "主色",
  accent: "点缀色",
  bg: "背景",
  text: "文字",
  muted: "弱化文字",
  line: "线条边框",
  success: "成功",
  warning: "警告",
  danger: "危险",
  primarySoft: "主色浅底",
  primaryTint: "主色卡片",
  primaryDeep: "主色深底",
  accent3: "系列色 3",
  accent4: "系列色 4",
  accent5: "系列色 5",
  accent6: "系列色 6",
};

const HEX_RE = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const FONT_SAMPLE = "永远相信美好的事情即将发生 AaBb 0123";

// Instance factory: one panel per editor instance (no module-level singleton)
/**
 * Build the Design panel service of one editor instance.
 * @param {object} ui instance context (dom / toast / dialogs / isActive)
 * @returns {{ open(opts): void, close(): void }}
 */
export function createDesignPanel(ui) {
  let panel = null;
  let mask = null;
  let tabsEl = null;
  let bodyEl = null;
  let deps = null;
  let activeTab = "colors";
  let ac = null;
  let tokenTx = false;

  let fonts = { list: [], api: false, loaded: false, loading: null };
  let fontQuery = "";
  const facesRegistered = new Set();

  // Panel lifecycle
  /**
   * Open (or focus) the Design drawer.
   * @param {object} opts { state, api, io, themeMode?, tab? }
   */
  function openDesignPanel(opts = {}) {
    if (opts.api) deps = opts;
    if (!deps?.api) return;
    if (opts.tab) activeTab = opts.tab;
    if (!panel) build();
    show();
    setActiveTab(activeTab);
    renderBody();
    // 字体库内容可能在编辑器外变化（CLI）：每次打开刷新；颜色编辑离线可用，无网络请求。
    ensureData({ force: true }).then(() => {
      if (panel && !panel.hidden) renderBody();
    });
  }

  /** Close and remove the panel DOM (idempotent; used by createEditor destroy). */
  function closeDesignPanel() {
    endTokenTx();
    ac?.abort();
    ac = null;
    panel?.remove();
    mask?.remove();
    panel = null;
    mask = null;
    tabsEl = null;
    bodyEl = null;
  }

  function show() {
    mask.hidden = false;
    panel.hidden = false;
    panel.setAttribute("aria-hidden", "false");
  }

  function close() {
    endTokenTx();
    if (panel) {
      panel.hidden = true;
      panel.setAttribute("aria-hidden", "true");
    }
    if (mask) mask.hidden = true;
  }

  function build() {
    mask = document.createElement("div");
    mask.className = "design-mask";
    mask.hidden = true;
    mask.addEventListener("pointerdown", close);

    panel = document.createElement("aside");
    panel.className = "design-panel";
    panel.id = "design-panel";
    panel.hidden = true;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "设计");

    const head = document.createElement("div");
    head.className = "design-head";
    const title = document.createElement("strong");
    title.textContent = "设计";
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "btn btn-sm";
    closeBtn.textContent = "✕";
    closeBtn.title = "关闭";
    closeBtn.addEventListener("click", close);
    head.append(title, closeBtn);

    tabsEl = document.createElement("div");
    tabsEl.className = "design-tabs";
    for (const [id, label] of [["colors", "颜色"], ["fonts", "字体"], ["appearance", "外观"]]) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "design-tab";
      b.dataset.tab = id;
      b.textContent = label;
      b.addEventListener("click", () => setActiveTab(id));
      tabsEl.appendChild(b);
    }

    bodyEl = document.createElement("div");
    bodyEl.className = "design-body";

    panel.append(head, tabsEl, bodyEl);
    document.body.append(mask, panel);

    ac = new AbortController();
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || !panel || panel.hidden) return;
      if (!ui.isActive()) return;
      close();
    }, { signal: ac.signal });
  }

  function setActiveTab(tab) {
    activeTab = ["colors", "fonts", "appearance"].includes(tab) ? tab : "colors";
    for (const b of tabsEl?.querySelectorAll(".design-tab") || []) {
      b.classList.toggle("active", b.dataset.tab === activeTab);
    }
    renderBody();
  }

  // Data loading (API first; static hosting degrades to built-ins)
  async function apiJson(url, options) {
    const res = await fetch(url, { cache: "no-store", ...options });
    const data = await res.json().catch(() => null);
    if (!res.ok || data?.ok === false) {
      const msg = data?.error?.message || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data;
  }

  function ensureData() {
    // 颜色编辑只读写 deck.theme.colors（本地 state），无需任何网络数据；只需字体库。
    return Promise.all([loadFonts()]);
  }

  async function loadFonts() {
    if (fonts.loading) return fonts.loading;
    fonts.loading = (async () => {
      try {
        const data = await apiJson(API.fonts);
        fonts = { list: data.fonts || [], api: true, loaded: true, loading: null };
      } catch {
        let list = [];
        try {
          const registry = await loadFontRegistry();
          list = [
            ...(registry.fonts || []).map((f) => ({
              key: f.key || f.family,
              family: f.family,
              file: f.file || null,
              source: "builtin",
              size: f.size || 0,
              license: f.license || null,
              url: f.url || null,
            })),
            ...(registry.systemFonts || []).map((f) => ({
              key: f.key || f.family,
              family: f.family,
              file: null,
              source: "system",
              size: 0,
              license: null,
            })),
          ];
        } catch {
          list = [];
        }
        fonts = { list, api: false, loaded: true, loading: null };
      }
    })();
    return fonts.loading;
  }

  // Color helpers
  /**
   * Write one color token into deck.theme.colors (caller owns the history transaction).
   * Text/table styles are never touched: loader.applyColors only replaces theme.colors.
   */
  function writeToken(key, value) {
    let next;
    try {
      next = setColorToken(deps.state.deck.theme || deps.state.theme, key, value);
    } catch (err) {
      ui.dialogs.alert(err.message);
      return false;
    }
    deps.io.applyColors(next.colors);
    return true;
  }

  function beginTokenTx() {
    if (tokenTx) return;
    tokenTx = true;
    deps.api.beginChange();
  }

  function endTokenTx() {
    if (!tokenTx) return;
    tokenTx = false;
    deps.api.endChange({ thumbs: "all" }); // color token write: theme-level, all thumbnails
  }

  // Render dispatcher
  function renderBody() {
    if (!bodyEl) return;
    const scroll = bodyEl.scrollTop;
    bodyEl.innerHTML = "";
    if (activeTab === "colors") renderColorsTab();
    else if (activeTab === "fonts") renderFontsTab();
    else renderAppearanceTab();
    bodyEl.scrollTop = scroll;
  }

  function sectionTitle(text, extra) {
    const wrap = document.createElement("div");
    wrap.className = "design-sec";
    const label = document.createElement("span");
    label.textContent = text;
    wrap.appendChild(label);
    if (extra) wrap.appendChild(extra);
    return wrap;
  }

  function hint(text) {
    const d = document.createElement("div");
    d.className = "prop-hint";
    d.textContent = text;
    return d;
  }

  // Colors tab
  function renderColorsTab() {
    bodyEl.appendChild(sectionTitle(`颜色令牌（${listColorTokens(deps.state.theme).length}）`));
    const tokens = document.createElement("div");
    tokens.className = "design-tokens";
    for (const tok of listColorTokens(deps.state.theme)) tokens.appendChild(tokenRow(tok));
    bodyEl.appendChild(tokens);
    const addBtn = controls.button("＋ 添加颜色", () => addColorDialog());
    addBtn.classList.add("design-add-color");
    bodyEl.appendChild(addBtn);
    bodyEl.appendChild(hint("只修改 theme.colors；文字/表格样式保持不变。"));
  }

  function tokenRow(tok) {
    const row = document.createElement("div");
    row.className = "design-token";
    row.dataset.token = tok.key;

    const swatch = document.createElement("span");
    swatch.className = "design-token-swatch";
    const label = document.createElement("span");
    label.className = "design-token-name";
    label.textContent = tok.standard ? STD_LABELS[tok.key] || tok.key : tok.key;
    label.title = tok.key;

    const picker = document.createElement("input");
    picker.type = "color";
    picker.className = "design-token-picker";
    picker.value = toHex6(resolveColor(deps.state.theme, tok.value));

    const hex = document.createElement("input");
    hex.type = "text";
    hex.className = "design-token-hex";
    hex.value = tok.value || "";
    hex.placeholder = "#RRGGBB";
    hex.title = "支持 #RRGGBB 与 #RRGGBBAA";

    const paint = () => {
      const resolved = resolveColor(deps.state.theme, deps.state.theme?.colors?.[tok.key]);
      swatch.style.background = resolved || "transparent";
      if (hex !== document.activeElement) hex.value = deps.state.theme?.colors?.[tok.key] || "";
      const h6 = toHex6(resolved);
      if (h6 && picker !== document.activeElement) picker.value = h6;
    };
    paint();

    // One history entry per edit session (dragging the picker / typing a hex value)
    picker.addEventListener("pointerdown", () => endTokenTx(), { signal: ac.signal });
    picker.addEventListener("input", () => {
      beginTokenTx();
      if (writeToken(tok.key, picker.value)) paint();
    }, { signal: ac.signal });
    picker.addEventListener("change", () => {
      endTokenTx();
      syncColorRows();
    }, { signal: ac.signal });
    hex.addEventListener("change", () => {
      endTokenTx();
      beginTokenTx();
      if (HEX_RE.test(hex.value.trim()) && writeToken(tok.key, hex.value.trim())) {
        endTokenTx();
        paint();
        syncColorRows();
      } else {
        endTokenTx();
        ui.dialogs.alert("颜色值需为 #RRGGBB 或 #RRGGBBAA");
        paint();
      }
    }, { signal: ac.signal });

    row.append(swatch, label, picker, hex);

    // Standard semantic tokens are part of every theme; only custom tokens can be removed.
    if (!tok.standard) {
      const del = document.createElement("button");
      del.type = "button";
      del.className = "design-token-del";
      del.textContent = "✕";
      del.title = "删除该颜色";
      del.addEventListener("click", () => deleteToken(tok.key));
      row.appendChild(del);
    }
    return row;
  }

  /** 只同步颜色行的色块（3.2 无主题卡/当前主题标签）。 */
  function syncColorRows() {
    if (!bodyEl || activeTab !== "colors") return;
    for (const row of bodyEl.querySelectorAll(".design-token")) {
      const key = row.dataset.token;
      const resolved = resolveColor(deps.state.theme, deps.state.theme?.colors?.[key]);
      const sw = row.querySelector(".design-token-swatch");
      if (sw) sw.style.background = resolved || "transparent";
    }
  }

  function toHex6(value) {
    const m = /^#([0-9a-fA-F]{6})/.exec(String(value || ""));
    return m ? `#${m[1]}` : "";
  }

  function deleteToken(key) {
    const report = removeColorToken(deps.state.theme, key, { deck: deps.state.deck });
    if (report.blocked) {
      ui.dialogs.alert(`颜色 $${key} 仍被 deck 引用 ${report.usage} 处，无法删除。请先修改引用。`);
      return;
    }
    beginTokenTx();
    deps.io.applyColors(report.theme.colors);
    endTokenTx();
    ui.toast.show(`已删除颜色 $${key}`, "info");
    renderBody();
  }

  function addColorDialog() {
    const wrap = document.createElement("div");
    wrap.className = "design-add-form";
    const keyInput = document.createElement("input");
    keyInput.type = "text";
    keyInput.placeholder = "令牌名，如 gold";
    keyInput.className = "design-input";
    const valueInput = document.createElement("input");
    valueInput.type = "color";
    valueInput.value = "#3366FF";
    valueInput.className = "design-token-picker";
    wrap.append(controls.field("令牌名", keyInput), controls.field("颜色", valueInput));

    ui.dialogs.showDialog("添加颜色", wrap, {
      doneText: "添加",
      onDone() {
        const key = keyInput.value.trim();
        if (!key) return;
        beginTokenTx();
        if (!writeToken(key, valueInput.value)) {
          endTokenTx();
          return;
        }
        endTokenTx();
        ui.toast.show(`已添加颜色 $${key}（写入 deck 主题；可撤销）`, "info");
        renderBody();
      },
    });
  }

  // Fonts tab
  function renderFontsTab() {
    // -- Deck font status --
    const families = deckFontFamilies();
    bodyEl.appendChild(sectionTitle(`当前 deck 使用的字体（${families.length}）`));
    if (!families.length) {
      bodyEl.appendChild(hint("当前 deck 未声明字体，使用主题默认字体。"));
    } else {
      const list = document.createElement("div");
      list.className = "design-font-status";
      for (const family of families) list.appendChild(fontStatusRow(family));
      bodyEl.appendChild(list);
    }

    // -- Library --
    const search = document.createElement("input");
    search.type = "text";
    search.className = "design-input";
    search.placeholder = "搜索字体名…";
    search.value = fontQuery;
    search.addEventListener("input", () => {
      fontQuery = search.value;
      renderFontList(listWrap);
    });
    bodyEl.appendChild(
      sectionTitle(
        `全局字体库（内置 ${countSource("builtin")} · 我的 ${countSource("user") + countSource("url")}）`
      )
    );
    bodyEl.appendChild(search);
    const listWrap = document.createElement("div");
    listWrap.className = "design-font-list";
    bodyEl.appendChild(listWrap);
    renderFontList(listWrap);

    // -- Import --
    bodyEl.appendChild(sectionTitle("导入字体"));
    if (!fonts.api) {
      bodyEl.appendChild(hint("静态站仅提供内置字体；导入/删除用户字体需要本地 open 服务。"));
    } else {
      const row = document.createElement("div");
      row.className = "design-font-import";
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = ".ttf,.otf";
      fileInput.hidden = true;
      const localBtn = controls.button("导入本地字体…", () => fileInput.click());
      fileInput.addEventListener("change", () => importLocalFont(fileInput));
      const urlInput = document.createElement("input");
      urlInput.type = "text";
      urlInput.className = "design-input";
      urlInput.placeholder = "字体 URL（http/https）";
      const urlBtn = controls.button("从 URL 导入", () => importUrlFont(urlInput));
      row.append(localBtn, urlInput, urlBtn, fileInput);
      bodyEl.appendChild(row);
    }
    bodyEl.appendChild(
      hint("导出 PPTX 时统一按导出对话框的全局开关嵌入字体；系统字体只声明不嵌入，缺失字体会给出警告。")
    );
  }

  function countSource(source) {
    return fonts.list.filter((f) => f.source === source).length;
  }

  /** Families the deck actually uses: deck.fonts resources, editor library and theme style fontFamily. */
  function deckFontFamilies() {
    const out = new Set();
    const resources = parseFontResources(deps.state.deck?.fonts);
    for (const [key, res] of Object.entries(resources)) out.add(res.family || key);
    for (const family of Object.keys(deps.state.fontLibrary || {})) out.add(family);
    const walk = (obj) => {
      if (!obj || typeof obj !== "object") return;
      for (const [key, value] of Object.entries(obj)) {
        if (/^fontFamily$/i.test(key) && typeof value === "string" && value) out.add(value);
        else if (value && typeof value === "object") walk(value);
      }
    };
    walk(deps.state.theme?.textStyles);
    walk(deps.state.theme?.tableStyles);
    return [...out];
  }

  function fontStatus(family) {
    const loaded = deps.state.fontLibrary?.[family];
    if (loaded?.bytes) return { level: "ready", text: "可嵌入" };
    const hit = fonts.list.find((f) => f.family === family);
    if (hit?.source === "builtin") return { level: "ready", text: "可嵌入（内置）" };
    if (hit?.source === "user" || hit?.source === "url") return { level: "ready", text: "可嵌入（我的）" };
    if (hit?.source === "system" || SYSTEM_FONTS.includes(family) || isRegistrySystemFont(family)) {
      return { level: "system", text: "系统" };
    }
    return { level: "missing", text: "缺失" };
  }

  function isRegistrySystemFont(family) {
    return fonts.list.some((f) => f.source === "system" && f.family === family);
  }

  function fontStatusRow(family) {
    const status = fontStatus(family);
    const row = document.createElement("div");
    row.className = "design-font-status-row";
    const name = document.createElement("span");
    name.className = "design-font-family";
    name.textContent = family;
    const badge = document.createElement("span");
    badge.className = `design-status ${status.level}`;
    badge.textContent = status.text;
    row.append(name, badge);
    if (status.level === "missing") {
      const fix = controls.button("从字体库选择", () => {
        fontQuery = family;
        setActiveTab("fonts");
      });
      fix.classList.add("design-mini-btn");
      row.appendChild(fix);
    }
    return row;
  }

  function renderFontList(container) {
    if (!container) return;
    container.innerHTML = "";
    const q = fontQuery.trim().toLowerCase();
    const list = fonts.list.filter((f) => !q || String(f.family || "").toLowerCase().includes(q) || String(f.key || "").toLowerCase().includes(q));
    if (!list.length) {
      container.appendChild(hint(fonts.loaded ? "没有匹配的字体。" : "正在加载字体库…"));
      return;
    }
    for (const entry of list) {
      const row = document.createElement("div");
      row.className = "design-font";

      const main = document.createElement("button");
      main.type = "button";
      main.className = "design-font-main";
      main.title = "点击预览";
      const preview = document.createElement("span");
      preview.className = "design-font-preview";
      preview.textContent = FONT_SAMPLE;
      const info = document.createElement("span");
      info.className = "design-font-info";
      const name = document.createElement("span");
      name.className = "design-font-name";
      name.textContent = entry.family;
      const meta = document.createElement("span");
      meta.className = "design-font-meta";
      meta.textContent = [sourceLabel(entry.source), formatSize(entry.size), entry.license]
        .filter(Boolean)
        .join(" · ");
      info.append(name, meta);
      main.append(preview, info);
      main.addEventListener("click", () => previewFont(entry, preview));
      row.appendChild(main);

      if (entry.source === "user" || entry.source === "url") {
        const del = document.createElement("button");
        del.type = "button";
        del.className = "design-token-del";
        del.textContent = "✕";
        del.title = "删除用户字体（引用它的项目会显示缺失）";
        del.addEventListener("click", () => deleteFont(entry));
        row.appendChild(del);
      }
      container.appendChild(row);
    }
  }

  const sourceLabel = (source) =>
    source === "builtin" ? "内置" : source === "system" ? "系统" : source === "url" ? "URL" : "我的";

  function formatSize(size) {
    const n = Number(size) || 0;
    if (!n) return "";
    return formatBytes(n);
  }

  /** Best-effort font bytes for preview: built-in registry, then the user library file, then the entry URL. */
  async function fontBytes(entry) {
    if (entry.source === "builtin") {
      const registry = await loadFontRegistry();
      const hit = findFont(registry, entry.family);
      if (hit) {
        const bytes = await fetchFontBytes(hit);
        if (bytes) return bytes;
      }
      if (entry.file) {
        const res = await fetch(fontFileUrl(entry.file));
        if (res.ok) return new Uint8Array(await res.arrayBuffer());
      }
      return null;
    }
    if (entry.file) {
      const res = await fetch(`/assets/fonts/user/${encodeURIComponent(entry.file)}`);
      if (res.ok) return new Uint8Array(await res.arrayBuffer());
    }
    if (entry.url) {
      const res = await fetch(entry.url);
      if (res.ok) return new Uint8Array(await res.arrayBuffer());
    }
    return null;
  }

  async function previewFont(entry, previewEl) {
    try {
      if (!facesRegistered.has(entry.family)) {
        const bytes = await fontBytes(entry);
        if (!bytes) throw new Error("字体字节不可用");
        const face = new FontFace(entry.family, bytes);
        await face.load();
        document.fonts.add(face);
        facesRegistered.add(entry.family);
      }
      previewEl.style.fontFamily = `"${entry.family}", var(--font)`;
    } catch (err) {
      ui.toast.show(`字体预览失败: ${err.message}`, "danger");
    }
  }

  /** Register imported bytes in the editor library so text editing and export see the new family. */
  async function registerImportedFont(entry, bytes) {
    if (!entry?.family) return;
    try {
      if (bytes && !facesRegistered.has(entry.family)) {
        const face = new FontFace(entry.family, bytes);
        await face.load();
        document.fonts.add(face);
        facesRegistered.add(entry.family);
      }
    } catch {
      /* preview registration is best-effort */
    }
    deps.state.fontLibrary[entry.family] = {
      bytes: bytes || null,
      source: "library",
      file: entry.file || null,
      url: entry.url || null,
      subset: entry.subset !== false,
      embed: true,
      size: bytes?.length || entry.size || 0,
    };
  }

  async function importLocalFont(fileInput) {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const base64 = await bytesToBase64(bytes);
      const data = await apiJson(API.fonts, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64, file: file.name }),
      });
      await registerImportedFont(data.font, bytes);
      await loadFonts();
      renderBody();
      ui.toast.show(`已导入字体「${data.font?.family || file.name}」到全局库`, "success");
    } catch (err) {
      ui.toast.show(`导入字体失败: ${err.message}`, "danger");
    } finally {
      fileInput.value = "";
    }
  }

  async function importUrlFont(urlInput) {
    const url = urlInput.value.trim();
    if (!url) return;
    try {
      const data = await apiJson(API.fonts, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      let bytes = null;
      try {
        const res = await fetch(`/assets/fonts/user/${encodeURIComponent(data.font.file)}`);
        if (res.ok) bytes = new Uint8Array(await res.arrayBuffer());
      } catch {
        /* bytes stay null; the font is still in the global library */
      }
      await registerImportedFont(data.font, bytes);
      await loadFonts();
      renderBody();
      ui.toast.show(`已导入字体「${data.font?.family || url}」到全局库`, "success");
    } catch (err) {
      ui.toast.show(`导入字体失败: ${err.message}`, "danger");
    }
  }

  async function deleteFont(entry) {
    const ok = await ui.dialogs.confirm(
      `删除字体「${entry.family}」？引用它的项目会显示字体缺失（不会扫描其他项目）。`
    );
    if (!ok) return;
    try {
      const data = await apiJson(`${API.fonts}?key=${encodeURIComponent(entry.key || entry.family)}`, {
        method: "DELETE",
      });
      delete deps.state.fontLibrary[entry.family];
      await loadFonts();
      renderBody();
      ui.toast.show(data.warning || `已删除字体「${entry.family}」`, "info");
    } catch (err) {
      ui.toast.show(`删除字体失败: ${err.message}`, "danger");
    }
  }

  function bytesToBase64(bytes) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || "");
        resolve(result.slice(result.indexOf(",") + 1));
      };
      reader.onerror = () => reject(reader.error || new Error("读取字体文件失败"));
      reader.readAsDataURL(new Blob([bytes]));
    });
  }

  // Appearance tab
  function renderAppearanceTab() {
    bodyEl.appendChild(sectionTitle("外观"));
    if (!deps.themeMode) {
      bodyEl.appendChild(hint("外观由宿主注入（options.theme.mode），编辑器内不可切换。"));
      return;
    }
    const row = document.createElement("div");
    row.className = "design-modes";
    const labels = { light: "浅色", dark: "深色", auto: "跟随系统" };
    for (const [mode] of THEME_MODES) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "design-mode-btn" + (deps.themeMode.get() === mode ? " active" : "");
      b.textContent = labels[mode] || mode;
      b.addEventListener("click", () => {
        deps.themeMode.set(mode);
        for (const other of row.querySelectorAll(".design-mode-btn")) other.classList.remove("active");
        b.classList.add("active");
      });
      row.appendChild(b);
    }
    bodyEl.appendChild(row);
    bodyEl.appendChild(hint("只影响查看器 UI（明暗），不写入 deck.theme。"));
  }

  return { open: openDesignPanel, close: closeDesignPanel };
}
