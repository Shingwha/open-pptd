// ============================================================================
// interaction/design-panel.js — Design drawer (theme library / font library / appearance)
// ----------------------------------------------------------------------------
// One topbar entry ("设计", #btn-design) replaces the old 字体/配色 popovers
// (editor-ux §6, theme-font §7). Loaded lazily by design-panel-lazy.js.
//
// Tabs
//   theme       current theme · built-in + user theme cards (apply / save current /
//               import / export / delete) · every color token (edit / add / delete,
//               a referenced token cannot be deleted) · style summary
//   fonts       deck font status (ready / system / missing) · global library
//               (built-in + user, search, preview) · local/URL import · delete ·
//               global embed note
//   appearance  light / dark / follow system (viewer UI only, never deck.theme)
//
// Data sources
//   themes: /api/themes (local open server); static hosting → built-in themes only
//   fonts:  /api/fonts   (local open server); static hosting → built-in registry only
// Applying a theme goes through model applyTheme(current, theme, {deck}) and keeps
// tokens/styles the deck still references (preserved report). Theme/color edits are
// undoable (one history step per edit session); library import/delete are global
// operations outside deck undo (explicit toast).
// ============================================================================

import * as controls from "../ui.js";
// Instance services (ui.dialogs / ui.toast) are injected by createDesignPanel;
import { THEME_MODES } from "../theme.js";
import { SYSTEM_FONTS } from "../app/project/font-manager.js";
import {
  applyTheme,
  findFont,
  fontFileUrl,
  fetchFontBytes,
  listBuiltinThemes,
  listColorTokens,
  loadFontRegistry,
  parseFontResources,
  removeColorToken,
  resolveColor,
  setColorToken,
} from "../../packages/model/index.js";

// ----------------------------------------------------------------------------
// Constants
// ----------------------------------------------------------------------------
const API = { themes: "/api/themes", fonts: "/api/fonts" };

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

const CARD_KEYS = ["primary", "accent", "accent3", "accent4", "accent5", "accent6"];
const HEX_RE = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const FONT_SAMPLE = "永远相信美好的事情即将发生 AaBb 0123";

// ----------------------------------------------------------------------------
// Instance factory: one panel per editor instance (no module-level singleton)
// ----------------------------------------------------------------------------
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
  let activeTab = "theme";
  let ac = null;
  let tokenTx = false;

  let themes = { builtin: listBuiltinThemes(), user: [], api: false, loaded: false, loading: null };
  let fonts = { list: [], api: false, loaded: false, loading: null };
  let fontQuery = "";
  const facesRegistered = new Set();

  // ----------------------------------------------------------------------------
  // Panel lifecycle
  // ----------------------------------------------------------------------------
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
    // Library content may change outside the editor (CLI): refresh on every open.
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
    for (const [id, label] of [["theme", "主题"], ["fonts", "字体"], ["appearance", "外观"]]) {
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
    activeTab = ["theme", "fonts", "appearance"].includes(tab) ? tab : "theme";
    for (const b of tabsEl?.querySelectorAll(".design-tab") || []) {
      b.classList.toggle("active", b.dataset.tab === activeTab);
    }
    renderBody();
  }

  // ----------------------------------------------------------------------------
  // Data loading (API first; static hosting degrades to built-ins)
  // ----------------------------------------------------------------------------
  async function apiJson(url, options) {
    const res = await fetch(url, { cache: "no-store", ...options });
    const data = await res.json().catch(() => null);
    if (!res.ok || data?.ok === false) {
      const msg = data?.error?.message || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data;
  }

  function ensureData({ force = false } = {}) {
    const jobs = [];
    if (force || !themes.loaded) jobs.push(loadThemes(force));
    if (force || !fonts.loaded) jobs.push(loadFonts());
    return Promise.all(jobs);
  }

  function loadThemes(force = false) {
    if (themes.loading && !force) return themes.loading;
    themes.loading = (async () => {
      themes.builtin = listBuiltinThemes();
      let user = [];
      let api = false;
      try {
        const data = await apiJson(API.themes);
        api = true;
        user = (data.themes || []).filter((t) => !t.builtin);
      } catch {
        api = false; // static hosting / server without the theme API
        user = [];
      }
      themes = { ...themes, builtin: listBuiltinThemes(), user, api, loaded: true, loading: null };
    })();
    return themes.loading;
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

  // ----------------------------------------------------------------------------
  // Theme helpers
  // ----------------------------------------------------------------------------
  const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
  const sameColor = (a, b) => String(a || "").toLowerCase() === String(b || "").toLowerCase();

  /** Match deck colors against a theme snapshot: exact match, or "custom based on" when extra tokens exist. */
  function matchTheme() {
    const deckColors = deps.state.theme?.colors || {};
    let based = null;
    for (const t of [...themes.builtin, ...themes.user]) {
      const tc = t.colors || {};
      const keys = Object.keys(tc);
      if (!keys.length || !keys.every((k) => sameColor(deckColors[k], tc[k]))) continue;
      const extra = Object.keys(deckColors).filter((k) => tc[k] === undefined);
      if (!extra.length) return { exact: true, theme: t, extra: 0 };
      if (!based) based = { exact: false, theme: t, extra: extra.length };
    }
    return based;
  }

  function currentThemeLabel() {
    const hit = matchTheme();
    if (!hit) return { name: "自定义主题", detail: "基于内置默认主题的修改" };
    return hit.exact
      ? { name: hit.theme.name, detail: "与主题库快照一致" }
      : { name: `自定义（基于 ${hit.theme.name}）`, detail: `额外 ${hit.extra} 个自定义颜色` };
  }

  /** Apply a theme file with the preserved-reference report (undoable). */
  function applyThemeFile(themeFile) {
    endTokenTx();
    deps.api.beginChange();
    const result = applyTheme(deps.state.theme, themeFile, { deck: deps.state.deck });
    deps.io.applyTheme(result.theme);
    deps.api.endChange();
    const kept =
      result.preserved.colors.length + result.preserved.textStyles.length + result.preserved.tableStyles.length;
    const name = typeof themeFile?.name === "string" ? themeFile.name : themeFile?.id || "主题";
    ui.toast.show(
      kept ? `已应用「${name}」；保留了 ${kept} 个仍被引用的自定义颜色/样式` : `已应用「${name}」`,
      "info"
    );
    renderBody();
  }

  /** Write one color token into the deck theme (caller owns the history transaction). */
  function writeToken(key, value) {
    let next;
    try {
      next = setColorToken(deps.state.theme, key, value);
    } catch (err) {
      ui.dialogs.alert(err.message);
      return false;
    }
    deps.io.applyTheme({
      colors: next.colors,
      textStyles: deps.state.theme.textStyles,
      tableStyles: deps.state.theme.tableStyles,
    });
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
    deps.api.endChange();
  }

  function download(filename, text) {
    const blob = new Blob([text], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  const safeName = (name) => String(name || "theme").replace(/[\\/:*?"<>|\s]+/g, "-").slice(0, 60) || "theme";

  // ----------------------------------------------------------------------------
  // Render dispatcher
  // ----------------------------------------------------------------------------
  function renderBody() {
    if (!bodyEl) return;
    const scroll = bodyEl.scrollTop;
    bodyEl.innerHTML = "";
    if (activeTab === "theme") renderThemeTab();
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

  // ----------------------------------------------------------------------------
  // Theme tab
  // ----------------------------------------------------------------------------
  function renderThemeTab() {
    // -- Current theme --
    const cur = currentThemeLabel();
    const curBox = document.createElement("div");
    curBox.className = "design-current";
    const curName = document.createElement("div");
    curName.className = "design-current-name";
    curName.textContent = cur.name;
    const curDetail = document.createElement("div");
    curDetail.className = "design-current-detail";
    curDetail.textContent = cur.detail;
    curBox.append(curName, curDetail);
    bodyEl.append(sectionTitle("当前主题"), curBox);

    // -- Library cards --
    const cards = document.createElement("div");
    cards.className = "design-theme-grid";
    const hit = matchTheme();
    for (const t of themes.builtin) cards.appendChild(themeCard(t, { builtin: true, active: hit?.theme === t }));
    for (const t of themes.user) cards.appendChild(themeCard(t, { builtin: false, active: hit?.theme === t }));
    bodyEl.append(sectionTitle(`主题库（内置 ${themes.builtin.length} · 我的 ${themes.user.length}）`), cards);
    if (!themes.api) bodyEl.appendChild(hint("静态站仅提供内置主题；保存/导入/删除需要本地 open 服务。"));

    // -- Library actions --
    const actions = document.createElement("div");
    actions.className = "design-actions";
    const saveBtn = controls.button("保存当前为主题", () => saveCurrentTheme());
    const importBtn = controls.button("导入…", () => importTheme());
    saveBtn.disabled = !themes.api;
    importBtn.disabled = !themes.api;
    actions.append(saveBtn, importBtn);
    bodyEl.appendChild(actions);

    // -- Color tokens --
    bodyEl.appendChild(sectionTitle(`颜色令牌（${listColorTokens(deps.state.theme).length}）`));
    const tokens = document.createElement("div");
    tokens.className = "design-tokens";
    for (const tok of listColorTokens(deps.state.theme)) tokens.appendChild(tokenRow(tok));
    bodyEl.appendChild(tokens);
    const addBtn = controls.button("＋ 添加颜色", () => addColorDialog());
    addBtn.classList.add("design-add-color");
    bodyEl.appendChild(addBtn);

    // -- Styles summary --
    const ts = Object.keys(deps.state.theme?.textStyles || {}).length;
    const tb = Object.keys(deps.state.theme?.tableStyles || {}).length;
    bodyEl.append(
      sectionTitle("文本 / 表格样式"),
      hint(`${ts} 个文本样式、${tb} 个表格样式随主题保存与应用；v1 不提供可视化样式编辑器（由 AI/预设管理）。`)
    );
  }

  function themeCard(t, { builtin, active }) {
    const card = document.createElement("div");
    card.className = "design-theme-card" + (active ? " active" : "");
    card.dataset.themeId = t.id;

    const swatches = document.createElement("button");
    swatches.type = "button";
    swatches.className = "design-swatches";
    swatches.title = `应用「${t.name}」`;
    for (const k of CARD_KEYS) {
      const s = document.createElement("span");
      s.className = "design-swatch";
      s.style.background = t.colors?.[k] || "var(--line)";
      swatches.appendChild(s);
    }
    swatches.addEventListener("click", () => applyThemeFile(t));

    const name = document.createElement("button");
    name.type = "button";
    name.className = "design-theme-name";
    name.textContent = t.name;
    name.title = `应用「${t.name}」`;
    name.addEventListener("click", () => applyThemeFile(t));

    const meta = document.createElement("div");
    meta.className = "design-theme-meta";
    const badge = document.createElement("span");
    badge.className = "design-badge" + (builtin ? "" : " mine");
    badge.textContent = builtin ? "内置" : "我的";
    meta.appendChild(badge);

    if (!builtin) {
      const exp = document.createElement("button");
      exp.type = "button";
      exp.className = "design-mini-btn";
      exp.textContent = "导出";
      exp.title = "导出主题 JSON";
      exp.addEventListener("click", () => exportTheme(t));
      const del = document.createElement("button");
      del.type = "button";
      del.className = "design-mini-btn danger";
      del.textContent = "删除";
      del.title = "删除该用户主题（内置只读）";
      del.addEventListener("click", () => deleteTheme(t));
      meta.append(exp, del);
    }
    card.append(swatches, name, meta);
    return card;
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
      syncThemeHighlights();
    }, { signal: ac.signal });
    hex.addEventListener("change", () => {
      endTokenTx();
      beginTokenTx();
      if (HEX_RE.test(hex.value.trim()) && writeToken(tok.key, hex.value.trim())) {
        endTokenTx();
        paint();
        syncThemeHighlights();
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

  function syncThemeHighlights() {
    if (!bodyEl || activeTab !== "theme") return;
    for (const row of bodyEl.querySelectorAll(".design-token")) {
      const key = row.dataset.token;
      const resolved = resolveColor(deps.state.theme, deps.state.theme?.colors?.[key]);
      const sw = row.querySelector(".design-token-swatch");
      if (sw) sw.style.background = resolved || "transparent";
    }
    const cur = currentThemeLabel();
    const nameEl = bodyEl.querySelector(".design-current-name");
    const detailEl = bodyEl.querySelector(".design-current-detail");
    if (nameEl) nameEl.textContent = cur.name;
    if (detailEl) detailEl.textContent = cur.detail;
    const hit = matchTheme();
    for (const card of bodyEl.querySelectorAll(".design-theme-card")) {
      card.classList.toggle("active", !!hit && hit.theme.id === card.dataset.themeId);
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
    deps.io.applyTheme({
      colors: report.theme.colors,
      textStyles: deps.state.theme.textStyles,
      tableStyles: deps.state.theme.tableStyles,
    });
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

  function saveCurrentTheme() {
    if (!themes.api) {
      ui.toast.show("保存主题需要本地 open 服务（静态站主题库只读）", "danger");
      return;
    }
    const wrap = document.createElement("div");
    wrap.className = "design-add-form";
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "design-input";
    nameInput.placeholder = "例如：咨询暖灰";
    const descInput = document.createElement("input");
    descInput.type = "text";
    descInput.className = "design-input";
    descInput.placeholder = "可选：用途 / 场景";
    wrap.append(controls.field("名称", nameInput), controls.field("描述", descInput));

    ui.dialogs.showDialog("保存当前主题", wrap, {
      doneText: "保存",
      onDone() {
        const name = nameInput.value.trim();
        if (!name) {
          ui.toast.show("主题名称不能为空", "danger");
          return;
        }
        const existing = themes.user.find((t) => t.name === name);
        const doSave = async () => {
          const payload = {
            version: 1,
            id: existing?.id || `user-${Date.now().toString(36)}`,
            name,
            description: descInput.value.trim(),
            colors: clone(deps.state.theme.colors),
            textStyles: clone(deps.state.theme.textStyles),
            tableStyles: clone(deps.state.theme.tableStyles),
          };
          try {
            await apiJson(API.themes, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ theme: payload }),
            });
            await loadThemes(true);
            renderBody();
            ui.toast.show(`已保存主题「${name}」${existing ? "（覆盖同名主题）" : ""}`, "success");
          } catch (err) {
            ui.toast.show(`保存主题失败: ${err.message}`, "danger");
          }
        };
        if (existing) {
          ui.dialogs.confirm(`已存在同名主题「${name}」，覆盖它？`).then((ok) => {
            if (ok) doSave();
          });
        } else {
          doSave();
        }
      },
    });
  }

  function importTheme() {
    if (!themes.api) {
      ui.toast.show("导入主题需要本地 open 服务", "danger");
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const parsed = JSON.parse(await file.text());
        const data = await apiJson(API.themes, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "import", json: parsed }),
        });
        await loadThemes(true);
        renderBody();
        const renamed = data.renamed ? "（id 重复，已另存）" : "";
        ui.toast.show(`已导入主题「${data.theme?.name || file.name}」${renamed}`, "success");
      } catch (err) {
        ui.toast.show(`导入主题失败: ${err.message}`, "danger");
      }
    });
    input.click();
  }

  async function exportTheme(t) {
    try {
      const json = t.builtin
        ? JSON.stringify(t, null, 2)
        : (await apiJson(`${API.themes}?id=${encodeURIComponent(t.id)}&export=1`)).json;
      download(`${safeName(t.name)}.json`, json);
      ui.toast.show(`已导出主题「${t.name}」`, "success");
    } catch (err) {
      ui.toast.show(`导出主题失败: ${err.message}`, "danger");
    }
  }

  async function deleteTheme(t) {
    if (t.builtin) return;
    const ok = await ui.dialogs.confirm(`删除主题「${t.name}」？此操作不可撤销。`);
    if (!ok) return;
    try {
      await apiJson(`${API.themes}?id=${encodeURIComponent(t.id)}`, { method: "DELETE" });
      await loadThemes(true);
      renderBody();
      ui.toast.show(`已删除主题「${t.name}」`, "info");
    } catch (err) {
      ui.toast.show(`删除主题失败: ${err.message}`, "danger");
    }
  }

  // ----------------------------------------------------------------------------
  // Fonts tab
  // ----------------------------------------------------------------------------
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
    return n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;
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

  // ----------------------------------------------------------------------------
  // Appearance tab
  // ----------------------------------------------------------------------------
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
