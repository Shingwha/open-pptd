// editor/theme.js — theme token injection + tri-state mode binding
// defaultTokens(mode) reads the built-in palette from editor/styles/tokens.css at
// runtime (the sheet is the single source of values); applyThemeTokens(rootEl,
// {tokens, mode}) injects into a mount point and returns an idempotent restore.
// Under standalone serve, bindThemeMode persists light/dark/auto in localStorage and
// follows prefers-color-scheme; a host injection wins over the built-in palette.

/**
 * Token names the engine supports (mirrors editor/styles/tokens.css).
 * Size/spacing/z-index/animation tokens do not participate in theme switching, so
 * they are not listed.
 */
export const TOKENS = [
  // semantic neutrals
  "--bg", "--panel", "--line", "--line-strong", "--ink", "--sub", "--faint",
  "--hover", "--active", "--disabled", "--sel-bg", "--sel-ring",
  // accents
  "--accent", "--accent-hover", "--accent-soft", "--on-accent",
  // semantic colors
  "--danger", "--danger-soft", "--success", "--success-soft", "--warning", "--warning-soft",
  // paper (canvas/thumbnail backdrop: white when light, light gray when dark, so a layout stays readable on dark)
  "--paper",
  // masks and strokes
  "--mask", "--chip-border",
  // thumbnail-bar hover label
  "--thumb-chip-bg", "--thumb-chip-ink", "--thumb-num-bg", "--thumb-num-ink",
  // shadow names (canonical --shadow-*; --sh-* kept in the probe list for hosts)
  "--sh-pop", "--sh-modal",
  // legacy names retained in the probe list; only those still declared in
  // tokens.css resolve to a value, so new integrations should use canonical names
  "--primary", "--primary-strong", "--primary-soft", "--primary-tint", "--scrollbar",
  "--shadow-sm", "--shadow-md", "--shadow-lg", "--shadow-sheet",
];

// Value source: tokens.css. defaultTokens() mounts a hidden probe carrying
// data-pptd-theme and reads the resolved custom properties, so aliases resolve too.
// Without a DOM (Node/SSR) there is no stylesheet to read and this module keeps no
// copy of the values, so an empty record is returned.

/** Mount the hidden probe element, read the mode's tokens, remove the probe. */
function probeTokens(mode) {
  if (typeof document === "undefined" || !document.documentElement || typeof getComputedStyle !== "function") return {};
  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  el.setAttribute("data-pptd-theme", mode);
  el.style.cssText = "position:absolute;left:-9999px;top:-9999px;width:0;height:0;overflow:hidden;pointer-events:none";
  const host = document.body || document.documentElement;
  host.appendChild(el);
  try {
    const cs = getComputedStyle(el);
    const out = {};
    for (const name of TOKENS) {
      const value = cs.getPropertyValue(name).trim();
      if (value) out[name] = value;
    }
    return out;
  } finally {
    el.remove();
  }
}

/** Built-in light / dark token table, read from tokens.css (a fresh copy the caller can safely mutate). */
export function defaultTokens(mode = "light") {
  return probeTokens(mode === "dark" ? "dark" : "light");
}


/**
 * Inject the theme into a mount point: mode → the data-pptd-theme attribute; tokens → inline token overrides.
 * @param {HTMLElement} rootEl mount point (usually document.body or the editor root container)
 * @param {{ tokens?: Record<string,string>, mode?: "light"|"dark" }} [opts]
 * @returns {() => void} restore function (idempotent: drops the attribute, clears inline overrides)
 */
export function applyThemeTokens(rootEl, { tokens, mode } = {}) {
  const el = rootEl || (typeof document !== "undefined" ? document.body : null);
  const applied = [];
  if (!el) return () => {};

  if (mode) {
    const prev = el.getAttribute("data-pptd-theme");
    el.setAttribute("data-pptd-theme", mode);
    applied.push(() => (prev == null ? el.removeAttribute("data-pptd-theme") : el.setAttribute("data-pptd-theme", prev)));
  }

  for (const [name, value] of Object.entries(tokens || {})) {
    const prev = el.style.getPropertyValue(name);
    const had = el.style.getPropertyValue(name) !== "" || el.style.getPropertyPriority(name) !== "";
    el.style.setProperty(name, value);
    applied.push(() => (had ? el.style.setProperty(name, prev) : el.style.removeProperty(name)));
  }

  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    for (const undo of applied.reverse()) undo();
  };
}

// Tri-state theme mode: the choice persists in localStorage (pptd.themeMode),
// "auto" resolves prefers-color-scheme live, and the effective value lands on
// documentElement's data-pptd-theme. Embedded hosts inject a mode instead, which
// wins over the built-in palette.

/** Theme-mode localStorage key (persisted in the standalone serve case). */
export const THEME_MODE_KEY = "pptd.themeMode";

/** Tri-state list (UI render order): light / dark / follow system. */
export const THEME_MODES = [
  ["light", "浅"],
  ["dark", "深"],
  ["auto", "跟随系统"],
];

const isMode = (m) => m === "light" || m === "dark" || m === "auto";

/** Current system preference (resolved to light/dark under auto). */
export function systemTheme() {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

/** Read the saved mode (invalid values fall back to light). */
export function getThemeMode(storageKey = THEME_MODE_KEY) {
  try {
    const v = localStorage.getItem(storageKey);
    return isMode(v) ? v : "light";
  } catch {
    return "light";
  }
}

/**
 * Apply a mode: resolve auto → light/dark, write it to root's data-pptd-theme, and
 * persist the mode itself.
 * @returns {"light"|"dark"} the palette actually in effect
 */
export function setThemeMode(mode, { root = null, storageKey = THEME_MODE_KEY } = {}) {
  const m = isMode(mode) ? mode : "light";
  const el = root || (typeof document !== "undefined" ? document.documentElement : null);
  const effective = m === "auto" ? systemTheme() : m;
  if (el) el.setAttribute("data-pptd-theme", effective);
  try {
    localStorage.setItem(storageKey, m);
  } catch {
    /* ignore write failures (private mode etc.) */
  }
  return effective;
}

/**
 * Bind the tri-state theme: apply the saved mode immediately and follow system
 * changes while in auto.
 * @param {object} [opts] { root, storageKey, onChange(effective, mode) }
 * @returns {{ get(): string, effective(): string, set(mode): string, destroy(): void }}
 */
export function bindThemeMode({ root = null, storageKey = THEME_MODE_KEY, onChange = null } = {}) {
  const el = root || (typeof document !== "undefined" ? document.documentElement : null);
  let mq = null;
  const onSystemChange = () => {
    if (getThemeMode(storageKey) !== "auto") return;
    const eff = setThemeMode("auto", { root: el, storageKey });
    onChange?.(eff, "auto");
  };
  try {
    mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", onSystemChange);
  } catch {
    mq = null;
  }
  setThemeMode(getThemeMode(storageKey), { root: el, storageKey });

  return {
    get: () => getThemeMode(storageKey),
    effective: () => (getThemeMode(storageKey) === "auto" ? systemTheme() : getThemeMode(storageKey)),
    set(mode) {
      const eff = setThemeMode(mode, { root: el, storageKey });
      onChange?.(eff, getThemeMode(storageKey));
      return eff;
    },
    destroy() {
      try {
        mq?.removeEventListener("change", onSystemChange);
      } catch {
        /* ignore */
      }
      mq = null;
    },
  };
}
