// ============================================================================
// model/chart/colors.js — chart color lookup and derivation (official §5.2, shared by writer/renderer)
// ----------------------------------------------------------------------------

import { resolveColor, colorOr, themeChartPalette } from "../theme.js";

/**
 * Hierarchy node color (official treemap/sunburst color derivation, shared by writer/renderer):
 *   single fill -> all roots share one color; a 1D array cycles per root; a 2D array
 *   takes the outer index by root and the inner index by level directly;
 *   child nodes step down HSL.L by 10 per level (L_new = max(0, L_old - 10)).
 * @param {object} s normalized series (with fill)
 * @param {number} rootIdx root appearance-order index
 * @param {number} levelFromRoot distance from the root (0 = root)
 */
export function hierarchyColor(theme, s, rootIdx, levelFromRoot) {
  const fill = s?.fill;
  if (fill == null) return null;
  if (Array.isArray(fill)) {
    const f = fill[rootIdx % fill.length];
    if (Array.isArray(f)) {
      if (levelFromRoot < f.length) return colorOr(theme, f[levelFromRoot]);
      const base = colorOr(theme, f[f.length - 1]);
      return base ? darkenByLightness(base, 10 * (levelFromRoot - f.length + 1)) : null;
    }
    const base = colorOr(theme, f);
    return base ? darkenByLightness(base, 10 * levelFromRoot) : null;
  }
  const base = colorOr(theme, fill);
  return base ? darkenByLightness(base, 10 * levelFromRoot) : null;
}

/** hex -> HEX8 (#RRGGBBAA, the official translucent Color form; both ECharts and OOXML accept it). */
export function hexA(hex, alpha) {
  const h = String(hex || "#888888").replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `#${h.slice(0, 6)}${a}`;
}

/** HEX6/HEX8 -> { rgb: "RRGGBB" (case preserved), alpha: 0..1 | null };
 * any other input returns null. An OOXML projection writes alpha ×100000 as a:alpha;
 * whether rgb is uppercased is up to each projection (classic srgbClr goes through
 * hexToRgbVal and uppercases, cx:dataPt stays as is). */
export function parseHexColor(hex) {
  const c = String(hex || "");
  if (/^#[0-9a-fA-F]{8}$/.test(c)) return { rgb: c.slice(1, 7), alpha: parseInt(c.slice(7), 16) / 255 };
  if (/^#[0-9a-fA-F]{6}$/.test(c)) return { rgb: c.slice(1), alpha: null };
  return null;
}

/** Relative luminance (Rec.709 weighted, 0..1; hex6/hex8, invalid input returns null). */
export function luminanceOf(hex) {
  const parsed = parseHexColor(hex);
  if (!parsed) return null;
  const ch = [0, 2, 4].map((i) => parseInt(parsed.rgb.slice(i, i + 2), 16) / 255);
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** Background color -> label text color (tile/segment readability: white on dark, theme dark on light; threshold 0.5).
 * An invalid background returns null (the caller keeps the platform default). */
export function labelColorOn(bgHex, darkHex = "#1f2937") {
  const l = luminanceOf(bgHex);
  if (l == null) return null;
  return l < 0.5 ? "#FFFFFF" : darkHex;
}

/**
 * Waterfall three-category color (official totalBars/increaseBars/decreaseBars -> default
 * theme color cycle palette[0/1/2]; preview and chartEx export share the same category
 * semantics — previously an unconfigured chartEx fell back to the PowerPoint platform
 * palette, disagreeing with the preview).
 */
export function waterfallColorOf(theme, s, isTotal, y) {
  const cfg = isTotal ? s.totalBars : y >= 0 ? s.increaseBars : s.decreaseBars;
  if (cfg && cfg.fill) {
    const c = resolveColor(theme, cfg.fill);
    if (c) return c;
  }
  const palette = themeChartPalette(theme);
  return isTotal ? palette[0] : y >= 0 ? palette[1] : palette[2];
}

/** Reduce HSL lightness by n% (official treemap derivation: L_new = max(0, L_old - 10)). */
export function darkenByLightness(hex, step = 10) {
  const h = String(hex || "#888888").replace("#", "");
  if (h.length < 6) return hex;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const nl = Math.max(0, l - step / 100);
  // Keep hue and saturation, change lightness only (HSL -> RGB)
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  const ns = s;
  const c = (1 - Math.abs(2 * nl - 1)) * ns;
  const hp = hue2rgb(hueOf(r, g, b, max, min, d), c, nl);
  return `#${hp.map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("")}`;
}

function hue2rgb(h, c, l) {
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rgb;
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return rgb.map((v) => v + m);
}

function hueOf(r, g, b, max, min, d) {
  if (d === 0) return 0;
  if (max === r) return ((g - b) / d) % 6 * 60;
  if (max === g) return ((b - r) / d + 2) * 60;
  return ((r - g) / d + 4) * 60;
}
