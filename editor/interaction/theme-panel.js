// ============================================================================
// interaction/theme-panel.js — 顶栏「配色」浮层
// ----------------------------------------------------------------------------
// 两层结构（对齐官方 Theme.colors = Record<string, Color>，17 键全集）：
//   1. 预设区：THEME_PALETTES 10 套色卡（6 色块 = primary/accent/accent3-6），
//      点击整套应用（保留 deck 现有 textStyles/tableStyles）
//   2. 语义色编辑区：17 键逐行编辑（取色器 + hex 文本，支持 #RRGGBBAA），
//      改单键即时联动全页 $key 引用与图表系列色
// 应用统一走 io.applyTheme（写 state.deck.theme → 随项目落盘），
// 事务：beginChange → applyTheme → endChange（全量渲染）。
// ============================================================================

import { THEME_PALETTES } from "../core/theme.js";
import { resolveColor } from "../core/theme.js";
import { showToast } from "../app/toast.js";

/** 语义色中文名（17 键全集；accent1/2 = primary/accent，不单独列）。 */
const KEY_LABELS = {
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

/** 编辑区键序（语义色 → 派生色 → 图表系列色）。 */
const EDIT_KEYS = [
  "primary", "accent", "bg", "text", "muted", "line", "success", "warning", "danger",
  "primarySoft", "primaryTint", "primaryDeep",
  "accent3", "accent4", "accent5", "accent6",
];

/** 预设色卡 6 色块（accent1-6 槽位顺序 = 图表系列色循环顺序）。 */
const CARD_KEYS = ["primary", "accent", "accent3", "accent4", "accent5", "accent6"];

const HEX_RE = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export function bindThemePanel({ state, api, io, anchor }) {
  let panel = null;

  const isOpen = () => panel?.classList.contains("open");

  /** 应用整套 colors（保留 deck 现有 textStyles/tableStyles）。 */
  function applyColors(colors, name) {
    api.beginChange();
    io.applyTheme({ ...(state.deck.theme || {}), colors: { ...colors } });
    api.endChange();
    if (name) showToast(`已应用配色「${name}」`, "info");
    refreshPresetHighlight();
  }

  /** 当前主题 colors 命中的预设键（17 键全等）；未命中（自定义）返回 null。 */
  function activePresetKey() {
    const c = state.theme.colors;
    for (const [key, p] of Object.entries(THEME_PALETTES)) {
      const pc = p.colors;
      const hit = Object.keys(pc).every((k) => resolveColor(state.theme, c[k]) === pc[k]);
      if (hit) return key;
    }
    return null;
  }

  function refreshPresetHighlight() {
    if (!panel) return;
    const active = activePresetKey();
    for (const card of panel.querySelectorAll(".theme-card")) {
      card.classList.toggle("active", card.dataset.preset === active);
    }
  }

  // --------------------------------------------------------------------------
  // 构建
  // --------------------------------------------------------------------------
  function build() {
    panel = document.createElement("div");
    panel.className = "theme-panel";
    panel.id = "theme-panel";

    // —— 预设区 ——
    const title = document.createElement("div");
    title.className = "theme-panel-title";
    title.textContent = "配色";
    panel.appendChild(title);

    const sec1 = document.createElement("div");
    sec1.className = "theme-sec";
    sec1.textContent = "预设配色";
    panel.appendChild(sec1);

    const presets = document.createElement("div");
    presets.className = "theme-presets";
    for (const [key, p] of Object.entries(THEME_PALETTES)) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "theme-card";
      card.dataset.preset = key;
      card.title = `应用「${p.name}」`;
      const swatches = document.createElement("div");
      swatches.className = "theme-card-swatches";
      for (const k of CARD_KEYS) {
        const sw = document.createElement("span");
        sw.className = "theme-card-swatch";
        sw.style.background = p.colors[k] || "#ccc";
        swatches.appendChild(sw);
      }
      const name = document.createElement("span");
      name.className = "theme-card-name";
      name.textContent = p.name;
      card.append(swatches, name);
      card.addEventListener("click", () => applyColors(p.colors, p.name));
      presets.appendChild(card);
    }
    panel.appendChild(presets);

    // —— 语义色编辑区 ——
    const sec2 = document.createElement("div");
    sec2.className = "theme-sec";
    sec2.textContent = "语义色（全页 $key 引用即时联动）";
    panel.appendChild(sec2);

    const editor = document.createElement("div");
    editor.className = "theme-editor";
    for (const key of EDIT_KEYS) {
      editor.appendChild(colorRow(key, KEY_LABELS[key] || key));
    }
    panel.appendChild(editor);

    // —— 恢复默认 ——
    const foot = document.createElement("div");
    foot.className = "theme-panel-foot";
    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "btn btn-sm";
    reset.textContent = "恢复默认配色";
    reset.addEventListener("click", () => {
      const d = THEME_PALETTES.consult;
      applyColors(d.colors, d.name);
    });
    foot.appendChild(reset);
    panel.appendChild(foot);

    document.body.appendChild(panel);
    refreshPresetHighlight();
  }

  /** 单键编辑行：色块 + 名称 + 取色器 + hex 文本（#RRGGBB / #RRGGBBAA）。 */
  function colorRow(key, label) {
    const row = document.createElement("div");
    row.className = "theme-row";

    const swatch = document.createElement("span");
    swatch.className = "theme-row-swatch";

    const name = document.createElement("span");
    name.className = "theme-row-name";
    name.textContent = label;

    const picker = document.createElement("input");
    picker.type = "color";
    const hexText = document.createElement("input");
    hexText.type = "text";
    hexText.className = "theme-row-hex";
    hexText.placeholder = "#RRGGBB";

    const sync = () => {
      const raw = state.theme.colors[key];
      swatch.style.background = resolveColor(state.theme, raw) || "#ffffff";
      const hex6 = resolveColor(state.theme, raw);
      if (/^#[0-9a-fA-F]{6}$/.test(hex6 || "")) picker.value = hex6;
      if (hexText !== document.activeElement) hexText.value = raw || "";
    };

    const commit = (v) => {
      api.beginChange();
      io.applyTheme({
        ...(state.deck.theme || {}),
        colors: { ...(state.theme.colors), [key]: v },
      });
      api.endChange();
      sync();
      refreshPresetHighlight();
    };

    picker.addEventListener("input", () => commit(picker.value)); // 拖动实时
    picker.addEventListener("change", () => commit(picker.value)); // 关闭兜底（幂等）
    hexText.addEventListener("change", () => {
      const v = hexText.value.trim();
      if (!HEX_RE.test(v)) {
        sync(); // 非法输入回填
        return;
      }
      commit(v);
    });

    row.append(swatch, name, picker, hexText);
    sync();
    return row;
  }

  // --------------------------------------------------------------------------
  // 开关
  // --------------------------------------------------------------------------
  function toggle() {
    if (isOpen()) {
      close();
      return;
    }
    if (!panel) build();
    const r = anchor.getBoundingClientRect();
    panel.style.top = `${r.bottom + 8}px`;
    panel.style.right = `${Math.max(8, Math.min(window.innerWidth - r.right, 24))}px`;
    panel.classList.add("open");
    refreshPresetHighlight();
  }

  function close() {
    panel?.classList.remove("open");
  }

  anchor.addEventListener("click", (e) => {
    e.stopPropagation();
    toggle();
  });
  document.addEventListener("click", (e) => {
    if (!isOpen()) return;
    if (panel.contains(e.target) || e.target === anchor) return;
    close();
  });
  window.addEventListener("resize", () => {
    if (!isOpen()) return;
    const r = anchor.getBoundingClientRect();
    panel.style.top = `${r.bottom + 8}px`;
    panel.style.right = `${Math.max(8, Math.min(window.innerWidth - r.right, 24))}px`;
  });
}
