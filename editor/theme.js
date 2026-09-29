// ============================================================================
// editor/theme.js — theme token injection (contract 3)
// ----------------------------------------------------------------------------
// The engine's built-in light/dark token values (mirroring editor/styles/tokens.css)
// plus applyThemeTokens(rootEl, { tokens, mode }) to inject tokens into any mount point.
//
// Usage (host / same-origin iframe embedding):
//   const restore = applyThemeTokens(document.body, { mode: "dark" });
//   // or override a single token
//   const restore2 = applyThemeTokens(rootEl, { tokens: { "--accent": "#7c3aed" } });
//   restore();  // idempotent restore (drops the attribute and inline overrides)
//
// Implementation: mode lands on rootEl's data-pptd-theme attribute (the
// [data-pptd-theme="dark"] block in tokens.css overrides the :root light defaults,
// and custom properties inherit naturally); tokens land on rootEl's inline style
// (higher priority than the stylesheet, for hosts mapping their --dsw-* over).
//
// After the token system rebuild, the authoritative names are the --accent family
// and --n-*; the old names (--primary etc.) remain compatibility aliases in
// tokens.css — a host overriding an alias is not overriding --accent, so new
// integrations should override the canonical token names (--accent / --sel-ring etc.).
// ============================================================================

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
  // shadows
  "--sh-pop", "--sh-modal",
  // compatibility aliases (old hosts overriding by the old names still work)
  "--primary", "--primary-strong", "--primary-soft", "--primary-tint", "--scrollbar",
  "--shadow-sm", "--shadow-md", "--shadow-lg", "--shadow-sheet",
];

const LIGHT = {
  "--bg": "#f5f6f8",
  "--panel": "#ffffff",
  "--line": "#e7eaef",
  "--line-strong": "#d3d8e0",
  "--ink": "#1c2532",
  "--sub": "#5b6572",
  "--faint": "#98a2af",
  "--hover": "#ebedf0",
  "--active": "#e7eaef",
  "--disabled": "#98a2af",
  "--sel-bg": "#eef4fd",
  "--sel-ring": "#2563eb",
  "--accent": "#2563eb",
  "--accent-hover": "#1d4ed8",
  "--accent-soft": "#eef4fd",
  "--on-accent": "#ffffff",
  "--danger": "#d64545",
  "--danger-soft": "#fdf1f1",
  "--success": "#2e9e5b",
  "--success-soft": "#ecf7f0",
  "--warning": "#9a6700",
  "--warning-soft": "#fdf6e3",
  "--paper": "#ffffff",
  "--mask": "rgba(28, 37, 50, 0.45)",
  "--chip-border": "rgba(0, 0, 0, 0.12)",
  "--thumb-chip-bg": "rgba(28, 37, 50, 0.65)",
  "--thumb-chip-ink": "#ffffff",
  "--thumb-num-bg": "rgba(255, 255, 255, 0.85)",
  "--thumb-num-ink": "rgba(28, 37, 50, 0.6)",
  "--sh-pop": "0 4px 16px rgba(28, 37, 50, 0.1)",
  "--sh-modal": "0 12px 32px rgba(28, 37, 50, 0.14)",
  // compatibility aliases
  "--primary": "#2563eb",
  "--primary-strong": "#1d4ed8",
  "--primary-soft": "#eef4fd",
  "--primary-tint": "rgba(37, 99, 235, 0.1)",
  "--scrollbar": "#d3d8e0",
  "--shadow-sm": "0 1px 2px rgba(28, 37, 50, 0.06)",
  "--shadow-md": "0 4px 16px rgba(28, 37, 50, 0.1)",
  "--shadow-lg": "0 12px 32px rgba(28, 37, 50, 0.14)",
  "--shadow-sheet": "0 -8px 32px rgba(28, 37, 50, 0.16)",
};

// Dark palette copied entry by entry from the design reference [data-theme="dark"]
// (panels one step darker than the background, text inverted, accents brightened,
// semantic colors desaturated).
const DARK = {
  "--bg": "#1b1f26",
  "--panel": "#16191f",
  "--line": "#353c47",
  "--line-strong": "#454d5a",
  "--ink": "#eef1f5",
  "--sub": "#b3bbc6",
  "--faint": "#6b7482",
  "--hover": "#2a303a",
  "--active": "#353c47",
  "--disabled": "#6b7482",
  "--sel-bg": "#1c2a44",
  "--sel-ring": "#4d8dff",
  "--accent": "#4d8dff",
  "--accent-hover": "#6ba0ff",
  "--accent-soft": "#1c2a44",
  "--on-accent": "#ffffff",
  "--danger": "#ff6b6b",
  "--danger-soft": "#3a1f22",
  "--success": "#3fbf74",
  "--success-soft": "#16301f",
  "--warning": "#e0a83a",
  "--warning-soft": "#382c12",
  "--paper": "#f7f8fa",
  "--mask": "rgba(0, 0, 0, 0.6)",
  "--chip-border": "rgba(255, 255, 255, 0.14)",
  "--thumb-chip-bg": "rgba(0, 0, 0, 0.7)",
  "--thumb-chip-ink": "#eef1f5",
  "--thumb-num-bg": "rgba(22, 25, 31, 0.85)",
  "--thumb-num-ink": "rgba(238, 241, 245, 0.7)",
  "--sh-pop": "0 4px 16px rgba(0, 0, 0, 0.45)",
  "--sh-modal": "0 12px 32px rgba(0, 0, 0, 0.6)",
  // compatibility aliases
  "--primary": "#4d8dff",
  "--primary-strong": "#6ba0ff",
  "--primary-soft": "#1c2a44",
  "--primary-tint": "rgba(77, 141, 255, 0.16)",
  "--scrollbar": "#454d5a",
  "--shadow-sm": "0 1px 2px rgba(0, 0, 0, 0.35)",
  "--shadow-md": "0 4px 16px rgba(0, 0, 0, 0.45)",
  "--shadow-lg": "0 12px 32px rgba(0, 0, 0, 0.6)",
  "--shadow-sheet": "0 -8px 32px rgba(0, 0, 0, 0.55)",
};

/** Built-in light / dark token tables (returns a shallow copy the caller can safely mutate). */
export function defaultTokens(mode = "light") {
  return { ...(mode === "dark" ? DARK : LIGHT) };
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

// ----------------------------------------------------------------------------
// Tri-state theme mode (B3: light / dark / follow system)
// ----------------------------------------------------------------------------
// Under standalone serve / GitHub Pages (layer one, "built-in palette") the editor
// manages it itself:
//   - the choice persists in localStorage (key pptd.themeMode)
//   - "auto" reads prefers-color-scheme live and listens for its changes
//   - the effective value lands on document.documentElement's data-pptd-theme
//     (the dark-palette selector in tokens.css)
// It does not start when embedded in a host (layer two, "host override"): the host
// injects via applyThemeTokens(rootEl,{mode}), and the injection wins over the
// built-in palette (see createEditor's handling of options.theme.mode).
// ----------------------------------------------------------------------------

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
