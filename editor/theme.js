// ============================================================================
// editor/theme.js — theme token injection (contract 3)
// ----------------------------------------------------------------------------
// defaultTokens(mode) reads the built-in light/dark palette out of
// editor/styles/tokens.css at runtime (that sheet is the single source of the
// values; this module holds no color literal) and applyThemeTokens(rootEl,
// { tokens, mode }) injects tokens into any mount point.
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
// The canonical token names are the semantic ones (--bg/--panel/--line/--ink/
// --radius/--text-*/--shadow-*/--control-h/--dur-*) plus the --accent family;
// the U1 names (--r-*/--f-*/--sh-*/--h-*/--n-*/--t-*) and the older --primary*
// family are aliases kept in the legacy block at the tail of tokens.css. A host
// overriding an alias is not overriding the canonical token, so new integrations
// should override the canonical names (--accent / --sel-ring etc.).
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
  // shadows (legacy names: kept so host overrides by the old names keep working)
  "--sh-pop", "--sh-modal",
  // legacy aliases (old hosts overriding by the old names still work)
  "--primary", "--primary-strong", "--primary-soft", "--primary-tint", "--scrollbar",
  "--shadow-sm", "--shadow-md", "--shadow-lg", "--shadow-sheet",
];

// ----------------------------------------------------------------------------
// Value source: tokens.css (probe read)
// ----------------------------------------------------------------------------
// defaultTokens() mounts a hidden probe element, stamps data-pptd-theme="light"
// | "dark" on it and reads the resolved custom properties with getComputedStyle
// (var() references are substituted at computed-value time, so aliases resolve
// too). tokens.css declares the light palette on ":root, [data-pptd-theme=
// "light"]" and the dark palette on [data-pptd-theme="dark"], so the probe needs
// nothing from the surrounding page.
//
// Degradation: without a DOM (Node, SSR) there is no stylesheet to read, and
// this module deliberately keeps no copy of the values, so an empty record is
// returned. The tables only exist in tokens.css.

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
