// ============================================================================
// interaction/theme-panel.js — topbar theme popover
// ----------------------------------------------------------------------------
// Two sections (aligned with the official Theme.colors = Record<string, Color>,
// the full 17-key set):
//   1. presets: 10 THEME_PALETTES cards (6 swatches = primary/accent/accent3-6);
//      clicking applies the whole set (keeping the deck's textStyles/tableStyles)
//   2. semantic-color editing: one row per key of the 17-key set (picker + hex
//      text, #RRGGBBAA supported); editing one key updates every $key reference
//      on the page and the chart series colors immediately
// Application goes through io.applyTheme (writes state.deck.theme → persisted with
// the project); transaction: beginChange → applyTheme → endChange (full render).
// ============================================================================

import { showToast } from "../app/toast.js";
import { attachPopover } from "../popover.js";
import { THEME_PALETTES, mergePaletteColors, resolveColor } from "../../packages/model/index.js";
import { THEME_MODES } from "../theme.js";

/** Semantic-color labels (full 17-key set; accent1/2 = primary/accent, not listed separately). */
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

/** Editor key order (semantic → derived → chart series colors). */
const EDIT_KEYS = [
  "primary", "accent", "bg", "text", "muted", "line", "success", "warning", "danger",
  "primarySoft", "primaryTint", "primaryDeep",
  "accent3", "accent4", "accent5", "accent6",
];

/** Preset card swatches (accent1-6 slot order = chart series-color cycle order). */
const CARD_KEYS = ["primary", "accent", "accent3", "accent4", "accent5", "accent6"];

const HEX_RE = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export function bindThemePanel({ state, api, io, anchor, themeMode = null }) {
  let panel = null;
  let popover = null;
  const ac = new AbortController();

  const isOpen = () => panel?.classList.contains("open");

  /** Apply a whole colors set (preset keys overwrite, custom color keys are kept — AI decks often carry their own keys such as $gold referenced by pages). */
  function applyColors(colors, name) {
    api.beginChange();
    io.applyTheme({ ...(state.deck.theme || {}), colors: mergePaletteColors(state.theme.colors, colors) });
    api.endChange();
    if (name) showToast(`已应用配色「${name}」`, "info");
    refreshPresetHighlight();
  }

  /** Preset key matched by the current theme colors (all 17 keys equal); null when custom. */
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
  // Build
  // --------------------------------------------------------------------------
  function build() {
    panel = document.createElement("div");
    panel.className = "theme-panel";
    panel.id = "theme-panel";

    // -- Preset title --
    const title = document.createElement("div");
    title.className = "theme-panel-title";
    title.textContent = "配色";
    panel.appendChild(title);

    // -- Appearance (light / dark / follow system; lives here, not in the topbar) --
    if (themeMode) {
      const sec0 = document.createElement("div");
      sec0.className = "theme-sec";
      sec0.textContent = "外观";
      panel.appendChild(sec0);
      const modes = document.createElement("div");
      modes.className = "theme-modes";
      const modeBtns = [];
      const syncModes = () => {
        const cur = themeMode.get();
        for (const [mode, b] of modeBtns) b.classList.toggle("active", mode === cur);
      };
      for (const [mode, label] of THEME_MODES) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "btn btn-sm theme-mode-btn";
        b.textContent = label;
        b.addEventListener("click", () => {
          themeMode.set(mode);
          syncModes();
        });
        modeBtns.push([mode, b]);
        modes.appendChild(b);
      }
      panel.appendChild(modes);
      syncModes();
    }

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

    // -- Semantic-color editing --
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

    // -- Restore defaults --
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

  /** One-key edit row: swatch + name + picker + hex text (#RRGGBB / #RRGGBBAA). */
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

    picker.addEventListener("input", () => commit(picker.value)); // live while dragging
    picker.addEventListener("change", () => commit(picker.value)); // closed fallback (idempotent)
    hexText.addEventListener("change", () => {
      const v = hexText.value.trim();
      if (!HEX_RE.test(v)) {
        sync(); // restore on invalid input
        return;
      }
      commit(v);
    });

    row.append(swatch, name, picker, hexText);
    sync();
    return row;
  }

  // --------------------------------------------------------------------------
  // Toggle (positioning / outside-click close / resize repositioning via popover.js)
  // --------------------------------------------------------------------------
  function toggle() {
    if (isOpen()) {
      close();
      return;
    }
    if (!panel) {
      build();
      popover = attachPopover(anchor, panel, { align: "right", isOpen, close });
    }
    panel.classList.add("open");
    popover.position(); // show first, then position (right edge aligns to the anchor, kept 24px inside the viewport)
    refreshPresetHighlight();
  }

  function close() {
    panel?.classList.remove("open");
  }

  anchor.addEventListener("click", (e) => {
    e.stopPropagation();
    toggle();
  }, { signal: ac.signal });

  return {
    /** Release: detach the anchor listener and drop the popover plus global close listeners. */
    destroy() {
      ac.abort();
      popover?.destroy();
      popover = null;
      panel?.remove();
      panel = null;
    },
  };
}
